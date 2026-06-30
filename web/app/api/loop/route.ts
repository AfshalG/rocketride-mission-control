import { NextResponse } from "next/server";
import { verify } from "@/lib/verify";
import { gitDiff, lastUserTask } from "@/lib/captureDiff";
import { bumpAttempt, resetAttempt } from "@/lib/loopStore";
import { setLatestHook } from "@/lib/hookStore";
import type { VerifyResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Synchronous auto-fix-loop endpoint. A Claude Code Stop hook POSTs the session's
 * diff + task; we run the existing 4-lane verifier, track a per-session attempt
 * counter, and return a verdict the hook turns into a block/release decision.
 * Infra-safety: any lane ERROR (e.g. engine down) → verdict "ERROR" so the hook
 * releases the agent instead of trapping it in an unfixable loop.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* tolerate empty/odd body */
  }

  const sessionId =
    typeof body.session_id === "string" && body.session_id ? body.session_id : "default";
  const cap = Number(process.env.MC_LOOP_CAP) || 5;
  const cwd = typeof body.cwd === "string" ? body.cwd : process.cwd();

  let diff = typeof body.diff === "string" ? body.diff : "";
  if (!diff.trim()) diff = gitDiff(cwd);
  if (!diff.trim()) {
    resetAttempt(sessionId);
    return NextResponse.json({
      verdict: "PASS",
      iteration: 0,
      cap,
      capReached: false,
      failures: [],
      summary: "nothing to verify — working tree clean",
    });
  }

  const task =
    (typeof body.task === "string" && body.task.trim()) ||
    lastUserTask(typeof body.transcript_path === "string" ? body.transcript_path : undefined) ||
    "Verify the changes from this Claude Code session.";

  const iteration = bumpAttempt(sessionId);

  let result: VerifyResult;
  try {
    result = await verify({ task, diff });
  } catch (e) {
    resetAttempt(sessionId);
    const msg = e instanceof Error ? e.message : "verify failed";
    return NextResponse.json({
      verdict: "ERROR",
      iteration,
      cap,
      capReached: false,
      failures: [],
      summary: `verifier error (released): ${msg}`,
    });
  }

  const hasLaneError = result.summary.some((s) => s.verdict === "ERROR");
  const verdict: "PASS" | "FAIL" | "ERROR" = hasLaneError ? "ERROR" : result.verdict;
  const failures = result.summary
    .filter((s) => s.verdict === "FAIL")
    .map((s) => `${s.lane}: ${s.detail}`);
  const capReached = verdict === "FAIL" && iteration >= cap;

  if (verdict !== "FAIL" || capReached) resetAttempt(sessionId);

  // keep the live UI panel in sync (reuses the existing Stop-hook store)
  setLatestHook({
    id: sessionId.slice(0, 6).toUpperCase(),
    ts: Date.now(),
    task,
    diff,
    status: verdict === "ERROR" ? "error" : "done",
    result,
    error: verdict === "ERROR" ? "engine/verify error" : undefined,
  });

  const summary =
    verdict === "PASS"
      ? `all lanes passed (attempt ${iteration})`
      : verdict === "ERROR"
        ? `released on infra error (attempt ${iteration})`
        : capReached
          ? `still failing after ${iteration} attempts — needs a human`
          : `attempt ${iteration}/${cap} failed: ${failures.map((f) => f.split(":")[0]).join(", ")}`;

  return NextResponse.json({ verdict, iteration, cap, capReached, failures, summary });
}
