import { NextResponse } from "next/server";
import { verify } from "@/lib/verify";
import { gitDiff, lastUserTask } from "@/lib/captureDiff";
import { classifyLoop } from "@/lib/loopClassify";
import { recordAttempt, isCancelRequested, resetLoop } from "@/lib/loopStore";
import { setLatestHook } from "@/lib/hookStore";
import type { VerifyResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Synchronous auto-fix-loop endpoint. A Claude Code Stop hook POSTs the session's
 * diff + task; we run the 4-lane verifier, but the loop blocks only on the blocking
 * lanes (secrets/size/judge — see classifyLoop; run is advisory). Per-session loop
 * state powers the live UI. A pending cancel releases at this checkpoint.
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

  // cancel requested from the UI → release at this checkpoint, record it for the timeline
  if (isCancelRequested(sessionId)) {
    const r = recordAttempt(sessionId, { verdict: "CANCELLED", failures: [], cap });
    return NextResponse.json({
      verdict: "CANCELLED",
      iteration: r.attempt,
      cap,
      capReached: false,
      failures: [],
      status: r.status,
      summary: "cancelled by user",
    });
  }

  let diff = typeof body.diff === "string" ? body.diff : "";
  if (!diff.trim()) diff = gitDiff(cwd);
  if (!diff.trim()) {
    resetLoop(sessionId);
    return NextResponse.json({
      verdict: "PASS",
      iteration: 0,
      cap,
      capReached: false,
      failures: [],
      status: "passed",
      summary: "nothing to verify — working tree clean",
    });
  }

  const task =
    (typeof body.task === "string" && body.task.trim()) ||
    lastUserTask(typeof body.transcript_path === "string" ? body.transcript_path : undefined) ||
    "Verify the changes from this Claude Code session.";

  let result: VerifyResult;
  try {
    result = await verify({ task, diff });
  } catch (e) {
    const r = recordAttempt(sessionId, { verdict: "ERROR", failures: [], cap });
    const msg = e instanceof Error ? e.message : "verify failed";
    return NextResponse.json({
      verdict: "ERROR",
      iteration: r.attempt,
      cap,
      capReached: false,
      failures: [],
      status: r.status,
      summary: `verifier error (released): ${msg}`,
    });
  }

  const { verdict, failures } = classifyLoop(result);
  const r = recordAttempt(sessionId, { verdict, failures, cap });
  const capReached = r.status === "capped";

  // keep the existing verdict panel in sync (full result, incl. advisory run lane)
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
      ? `all blocking lanes passed (attempt ${r.attempt})`
      : verdict === "ERROR"
        ? `released on infra error (attempt ${r.attempt})`
        : capReached
          ? `still failing after ${r.attempt} attempts — needs a human`
          : `attempt ${r.attempt}/${cap} failed: ${failures.map((f) => f.split(":")[0]).join(", ")}`;

  return NextResponse.json({ verdict, iteration: r.attempt, cap, capReached, failures, status: r.status, summary });
}
