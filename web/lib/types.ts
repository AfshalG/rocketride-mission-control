// Shared types — safe to import from client components (no Node deps here).

export type LaneName = "run" | "secrets" | "size" | "judge";
export type Verdict = "PASS" | "FAIL" | "ERROR";

export interface LaneResult {
  lane: LaneName;
  verdict: Verdict;
  detail: string;
}

export interface FileResult {
  file: string;
  deepChecked: boolean; // did the LLM lanes (run/judge) run on this file?
  lanes: Record<LaneName, LaneResult | null>; // run/judge are null when not deep-checked
}

export interface VerifyResult {
  verdict: "PASS" | "FAIL";
  reason: string;
  summary: LaneResult[]; // one aggregated entry per lane, in order run/secrets/size/judge
  files: FileResult[]; // per-file matrix
  totalFiles: number;
  deepCheckedCount: number;
  elapsedMs: number;
}

export const LANE_ORDER: LaneName[] = ["run", "secrets", "size", "judge"];

export interface JudgeModelOption {
  id: string;
  label: string;
  note?: string;
}

// The judge model is swappable — same pipeline, different LLM node (composition, not code).
export const JUDGE_MODELS: JudgeModelOption[] = [
  { id: "gemini-flash-lite", label: "Gemini 3.1 Flash-Lite", note: "fast" },
  { id: "gemini-pro", label: "Gemini 3.1 Pro", note: "stronger" },
  { id: "openrouter", label: "OpenRouter", note: "any model · 1 key" },
];
export const DEFAULT_JUDGE_MODEL = "gemini-flash-lite";
export const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-sonnet-4.6";
