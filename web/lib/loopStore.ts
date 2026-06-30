// Per-session attempt counter for the auto-fix loop. Kept on globalThis so the
// counter survives Next dev hot-reloads (same pattern as hookStore).
const g = globalThis as unknown as { __mcLoop?: Map<string, number> };

function store(): Map<string, number> {
  if (!g.__mcLoop) g.__mcLoop = new Map();
  return g.__mcLoop;
}

export function bumpAttempt(sessionId: string): number {
  const m = store();
  const n = (m.get(sessionId) ?? 0) + 1;
  m.set(sessionId, n);
  return n;
}

export function resetAttempt(sessionId: string): void {
  store().delete(sessionId);
}

export function getAttempt(sessionId: string): number {
  return store().get(sessionId) ?? 0;
}
