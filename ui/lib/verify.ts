/**
 * Mission Control verifier — Option A orchestration in TypeScript.
 * Two RocketRide pipe lanes (run, judge) fired concurrently + two deterministic
 * lanes (secrets, size). Ported from the proven Python runner.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { RocketRideClient, Question } from "rocketride";

export type LaneName = "run" | "secrets" | "size" | "judge";
export type Verdict = "PASS" | "FAIL" | "ERROR";

export interface LaneResult {
  lane: LaneName;
  verdict: Verdict;
  detail: string;
}

export interface VerifyResult {
  verdict: "PASS" | "FAIL";
  reason: string;
  lanes: LaneResult[];
  elapsedMs: number;
}

const JUDGE_INSTRUCTION =
  "You are the JUDGE lane of a code-change verifier. The message contains a TASK and a DIFF. " +
  "Decide whether the DIFF correctly and completely accomplishes the TASK (correctness, completeness, " +
  "obvious bugs). Reply with ONLY a JSON object: " +
  '{"lane":"judge","verdict":"PASS or FAIL","detail":"<reasoning>"}.';

const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9]{16,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /(api[_-]?key|secret|password|token)\s*[=:]\s*["'][^"']{8,}["']/i,
];

function addedLines(diff: string): string[] {
  return diff
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1));
}

export function secretsCheck(diff: string): LaneResult {
  const body = addedLines(diff).join("\n");
  for (const re of SECRET_PATTERNS) {
    const m = body.match(re);
    if (m) {
      return { lane: "secrets", verdict: "FAIL", detail: `hardcoded secret detected: ${m[0].slice(0, 40)}` };
    }
  }
  return { lane: "secrets", verdict: "PASS", detail: "no hardcoded secrets or API keys in added lines" };
}

export function sizeCheck(task: string, diff: string): LaneResult {
  const adds = addedLines(diff);
  const files = (diff.match(/^diff --git /gm) ?? []).length || (diff.match(/^\+\+\+ /gm) ?? []).length;
  const chars = adds.reduce((n, l) => n + l.length, 0);
  const bloated = adds.length > 150 || files > 10;
  return {
    lane: "size",
    verdict: bloated ? "FAIL" : "PASS",
    detail: `+${adds.length} lines, ${files} file(s), ${chars} chars${bloated ? " — runaway/bloated for the task" : ""}`,
  };
}

type Answer = unknown;

function laneFromAnswers(answers: Answer[], lane: LaneName): LaneResult | null {
  let found: LaneResult | null = null;
  for (const a of answers) {
    let obj: unknown = a;
    if (typeof obj === "string") {
      let s = obj.trim().replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
      try {
        obj = JSON.parse(s);
      } catch {
        const m = s.match(/\{[^{}]*"lane"[^{}]*\}/s);
        if (!m) continue;
        try {
          obj = JSON.parse(m[0]);
        } catch {
          continue;
        }
      }
    }
    if (obj && typeof obj === "object" && (obj as Record<string, unknown>).lane === lane) {
      const o = obj as Record<string, unknown>;
      found = { lane, verdict: (o.verdict as Verdict) ?? "ERROR", detail: String(o.detail ?? "") };
    }
  }
  return found;
}

function pipePath(name: string): string {
  const dir = process.env.MISSION_CONTROL_PIPES_DIR ?? path.resolve(process.cwd(), "..", "pipes");
  return path.join(dir, name);
}

/** Load a .pipe file and stamp a fresh project_id so each deploy is a clean instance. */
function loadPipe(name: string): Record<string, unknown> {
  const cfg = JSON.parse(readFileSync(pipePath(name), "utf8")) as Record<string, unknown>;
  cfg.project_id = randomUUID();
  return cfg;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runLane(client: any, token: string, text: string): Promise<LaneResult> {
  const q = new Question();
  q.addQuestion(text);
  const resp = await client.chat({ token, question: q });
  const answers: Answer[] = Array.isArray(resp?.answers) ? resp.answers : [];
  return laneFromAnswers(answers, "run") ?? { lane: "run", verdict: "ERROR", detail: "no run verdict parsed" };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function judgeLane(client: any, token: string, text: string): Promise<LaneResult> {
  const q = new Question({ expectJson: true });
  q.addInstruction("Role", JUDGE_INSTRUCTION);
  q.addQuestion(text);
  const resp = await client.chat({ token, question: q });
  const answers: Answer[] = Array.isArray(resp?.answers) ? resp.answers : [];
  const first = answers[0];
  const obj = typeof first === "string" ? safeJson(first) : first;
  if (obj && typeof obj === "object" && "verdict" in (obj as object)) {
    const o = obj as Record<string, unknown>;
    return { lane: "judge", verdict: (o.verdict as Verdict) ?? "ERROR", detail: String(o.detail ?? "") };
  }
  return { lane: "judge", verdict: "ERROR", detail: "no judge verdict parsed" };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function synthesize(lanes: LaneResult[], elapsedMs: number): VerifyResult {
  const order: LaneName[] = ["run", "secrets", "size", "judge"];
  const sorted = [...lanes].sort((a, b) => order.indexOf(a.lane) - order.indexOf(b.lane));
  const fails = sorted.filter((l) => l.verdict !== "PASS").map((l) => l.lane);
  return {
    verdict: fails.length === 0 ? "PASS" : "FAIL",
    reason: fails.length === 0 ? "all lanes passed" : `failed: ${fails.join(", ")}`,
    lanes: sorted,
    elapsedMs,
  };
}

export async function verify(input: { task: string; diff: string }): Promise<VerifyResult> {
  const text = `TASK: ${input.task}\nDIFF:\n${input.diff}`;
  const uri = process.env.ROCKETRIDE_URI;
  if (!uri) throw new Error("ROCKETRIDE_URI is not set (the RocketRide engine WebSocket URI).");

  const started = Date.now();
  const client = new RocketRideClient({ uri, auth: process.env.ROCKETRIDE_APIKEY ?? "local" });
  await client.connect();
  try {
    const { token: runTok } = await client.use({ pipeline: loadPipe("run-check.pipe") });
    const { token: judgeTok } = await client.use({ pipeline: loadPipe("verifier.pipe") });

    const [runRes, judgeRes] = await Promise.all([
      runLane(client, runTok, text),
      judgeLane(client, judgeTok, text),
    ]);

    const lanes = [runRes, secretsCheck(input.diff), sizeCheck(input.task, input.diff), judgeRes];
    await Promise.allSettled([client.terminate(runTok), client.terminate(judgeTok)]);
    return synthesize(lanes, Date.now() - started);
  } finally {
    await client.disconnect();
  }
}
