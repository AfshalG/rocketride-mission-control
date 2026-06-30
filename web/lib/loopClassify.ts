import type { VerifyResult, LaneName } from "./types";

// The run lane (LLM + RestrictedPython sandbox) is non-deterministic and structurally
// fails correct code that uses modules the sandbox forbids (e.g. `os`). It is ADVISORY:
// shown in the verdict, but it never blocks or loops the agent.
const BLOCKING_LANES: LaneName[] = ["secrets", "size", "judge"];

export interface LoopClassification {
  verdict: "PASS" | "FAIL" | "ERROR";
  failures: string[]; // blocking-lane FAILs only, "<lane>: <detail>"
}

export function classifyLoop(result: VerifyResult): LoopClassification {
  const blocking = result.summary.filter((s) => BLOCKING_LANES.includes(s.lane));
  const blockingError = blocking.some((s) => s.verdict === "ERROR");
  const blockingFails = blocking.filter((s) => s.verdict === "FAIL");
  const verdict: "PASS" | "FAIL" | "ERROR" = blockingError
    ? "ERROR"
    : blockingFails.length
      ? "FAIL"
      : "PASS";
  return { verdict, failures: blockingFails.map((s) => `${s.lane}: ${s.detail}`) };
}
