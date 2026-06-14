import { NextResponse } from "next/server";
import { verify } from "@/lib/verify";
import { gitDiff, lastUserTask } from "@/lib/captureDiff";
import { setLatestHook } from "@/lib/hookStore";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Claude Code Stop-hook receiver. CC POSTs the Stop event JSON (cwd, transcript_path, …).
 * We grab the working-tree diff + the last task, kick off verification in the background,
 * and return immediately so the agent's stop isn't blocked. The UI polls /api/hook/latest.
 */
export async function POST(req: Request) {
  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    /* hook may send empty/odd body */
  }

  const cwd = typeof payload.cwd === "string" ? payload.cwd : process.cwd();
  const diff = gitDiff(cwd);
  if (!diff.trim()) {
    return NextResponse.json({ ok: true, skipped: "working tree clean — nothing to verify" });
  }

  const task =
    lastUserTask(typeof payload.transcript_path === "string" ? payload.transcript_path : undefined) ||
    "Verify the changes from this Claude Code session.";
  const id = Math.random().toString(16).slice(2, 8).toUpperCase();
  const ts = Date.now();

  setLatestHook({ id, ts, task, diff, status: "running", result: null });
  // fire-and-forget: verification continues after we respond
  verify({ task, diff })
    .then((result) => setLatestHook({ id, ts, task, diff, status: "done", result }))
    .catch((e) =>
      setLatestHook({
        id,
        ts,
        task,
        diff,
        status: "error",
        result: null,
        error: e instanceof Error ? e.message : "verification failed",
      }),
    );

  return NextResponse.json({ ok: true, verifying: id });
}
