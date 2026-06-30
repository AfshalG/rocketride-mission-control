// Per-session auto-fix-loop state. Kept on globalThis so it survives Next dev hot-reloads.
export type LoopStatus = "fixing" | "passed" | "capped" | "cancelled" | "error";

export interface LoopAttempt {
  n: number;
  verdict: "PASS" | "FAIL" | "ERROR" | "CANCELLED";
  failures: string[];
  ts: number;
}

export interface LoopRecord {
  sessionId: string;
  attempt: number;
  cap: number;
  status: LoopStatus;
  attempts: LoopAttempt[];
  cancelRequested: boolean;
  updatedAt: number;
}

const g = globalThis as unknown as { __mcLoop?: Map<string, LoopRecord> };
function store(): Map<string, LoopRecord> {
  if (!g.__mcLoop) g.__mcLoop = new Map();
  return g.__mcLoop;
}

export function recordAttempt(
  sessionId: string,
  p: { verdict: "PASS" | "FAIL" | "ERROR" | "CANCELLED"; failures: string[]; cap: number },
): LoopRecord {
  let r = store().get(sessionId);
  // start a fresh loop if none exists or the previous one already ended
  if (!r || r.status !== "fixing") {
    r = {
      sessionId,
      attempt: 0,
      cap: p.cap,
      status: "fixing",
      attempts: [],
      cancelRequested: false,
      updatedAt: Date.now(),
    };
    store().set(sessionId, r);
  }
  r.cap = p.cap;
  r.attempt += 1;
  r.attempts.push({ n: r.attempt, verdict: p.verdict, failures: p.failures, ts: Date.now() });
  if (p.verdict === "PASS") r.status = "passed";
  else if (p.verdict === "ERROR") r.status = "error";
  else if (p.verdict === "CANCELLED") r.status = "cancelled";
  else r.status = r.attempt >= r.cap ? "capped" : "fixing"; // FAIL
  r.updatedAt = Date.now();
  return r;
}

export function requestCancel(sessionId: string): boolean {
  const r = store().get(sessionId);
  if (!r) return false;
  r.cancelRequested = true;
  r.updatedAt = Date.now();
  return true;
}

export function isCancelRequested(sessionId: string): boolean {
  return store().get(sessionId)?.cancelRequested ?? false;
}

export function resetLoop(sessionId: string): void {
  store().delete(sessionId);
}

export function getActiveLoop(): LoopRecord | null {
  let best: LoopRecord | null = null;
  // >= so that on equal timestamps the most-recently-touched (later in insertion order) wins
  for (const r of store().values()) if (!best || r.updatedAt >= best.updatedAt) best = r;
  return best;
}
