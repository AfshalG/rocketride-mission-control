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
