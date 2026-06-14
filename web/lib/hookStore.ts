import type { VerifyResult } from "./types";

export interface HookState {
  id: string;
  ts: number;
  task: string;
  diff: string;
  status: "running" | "done" | "error";
  result: VerifyResult | null;
  error?: string;
}

// Module/global state holding the latest Stop-hook run, so the POST that triggers it and
// the GET the UI polls can share it. Kept on globalThis to survive dev hot-reloads.
const g = globalThis as unknown as { __mcHook?: HookState | null };

export function setLatestHook(s: HookState): void {
  g.__mcHook = s;
}

export function getLatestHook(): HookState | null {
  return g.__mcHook ?? null;
}
