/**
 * Mission Control verifier — per-file Option-A orchestration.
 * Splits the diff by file; runs deterministic lanes (secrets, size) on every file and
 * the LLM lanes (run, judge) on the top code files; aggregates into one verdict + a matrix.
 */
import { randomUUID } from "node:crypto";
import { RocketRideClient, Question } from "rocketride";
import type { LaneName, Verdict, LaneResult, FileResult, VerifyResult } from "./types";
import { LANE_ORDER } from "./types";
import { splitDiffByFile, selectDeepFiles } from "./diff";
// Pipes are embedded (imported) so they ship inside the serverless bundle on deploy —
// not read from disk. Keep these in sync with /pipes/*.pipe (the canvas source of truth).
import runCheckPipe from "./pipes/run-check.json";
import verifierPipe from "./pipes/verifier.json";

const MAX_DEEP = 6; // how many code files get the (expensive) LLM lanes
const CONCURRENCY = 3; // files deep-checked in parallel

const JUDGE_INSTRUCTION =
  "You are the JUDGE lane of a code-change verifier, reviewing the diff for a SINGLE file. " +
  "The message gives the overall TASK (for context) and this one file's DIFF. Judge ONLY whether " +
  "THIS file's change is internally correct and free of obvious bugs — does its code do what it " +
  "plainly intends, without errors? Do NOT fail it for work that belongs in other files. " +
  'Reply with ONLY a JSON object: {"lane":"judge","verdict":"PASS or FAIL","detail":"<reasoning>"}.';

const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9]{16,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /(api[_-]?key|secret|password|token)\s*[=:]\s*["'][^"']{8,}["']/i,
];

function addedLines(diff: string): string[] {
  return diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1));
}

export function secretsCheck(diff: string): LaneResult {
  const body = addedLines(diff).join("\n");
  for (const re of SECRET_PATTERNS) {
    const m = body.match(re);
    if (m) return { lane: "secrets", verdict: "FAIL", detail: `hardcoded secret detected: ${m[0].slice(0, 40)}` };
  }
  return { lane: "secrets", verdict: "PASS", detail: "no hardcoded secrets or API keys in added lines" };
}

export function sizeCheck(task: string, diff: string): LaneResult {
  const adds = addedLines(diff);
  const chars = adds.reduce((n, l) => n + l.length, 0);
  const bloated = adds.length > 150;
  return {
    lane: "size",
    verdict: bloated ? "FAIL" : "PASS",
    detail: `+${adds.length} lines, ${chars} chars${bloated ? " — runaway/bloated for the task" : ""}`,
  };
}

function laneFromAnswers(answers: unknown[], lane: LaneName): LaneResult | null {
  let found: LaneResult | null = null;
  for (const a of answers) {
    let obj: unknown = a;
    if (typeof obj === "string") {
      const s = obj.trim().replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
      try {
        obj = JSON.parse(s);
      } catch {
        const m = s.match(/\{[^{}]*"lane"[^{}]*\}/);
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

type UsePipeline = NonNullable<Parameters<RocketRideClient["use"]>[0]>["pipeline"];

function clone<T>(o: T): T {
  return JSON.parse(JSON.stringify(o));
}

function freshRunPipe(): UsePipeline {
  const cfg = clone(runCheckPipe) as Record<string, unknown>;
  cfg.project_id = randomUUID();
  return cfg as unknown as UsePipeline;
}

// Swappable judge model: same pipeline, different LLM node. Gemini variants use the
// existing key; Claude/GPT need their own key set in the engine env.
const JUDGE_MODEL_NODES: Record<string, { node: string; model: string; keyEnv: string }> = {
  "gemini-flash-lite": { node: "llm_gemini", model: "gemini-3.1-flash-lite-preview", keyEnv: "ROCKETRIDE_GEMINI_KEY" },
  "gemini-pro": { node: "llm_gemini", model: "gemini-3.1-pro-preview", keyEnv: "ROCKETRIDE_GEMINI_KEY" },
};

function loadJudgePipe(modelKey: string, orModel?: string): UsePipeline {
  const cfg = clone(verifierPipe) as {
    components: Array<Record<string, unknown>>;
    [k: string]: unknown;
  };
  cfg.project_id = randomUUID();
  const llm = cfg.components.find((c) => String(c.id).startsWith("llm_"));
  if (llm) {
    if (modelKey === "openrouter") {
      // Any OpenRouter model through the OpenAI-compatible node — one key unlocks all.
      llm.provider = "llm_openai_api";
      llm.config = {
        profile: "custom",
        custom: {
          model: (orModel || "anthropic/claude-sonnet-4.6").trim(),
          base_url: "https://openrouter.ai/api/v1",
          modelTotalTokens: 1000000,
          apikey: "${ROCKETRIDE_OPENROUTER_KEY}",
        },
        parameters: {},
      };
    } else {
      const m = JUDGE_MODEL_NODES[modelKey] ?? JUDGE_MODEL_NODES["gemini-flash-lite"];
      llm.provider = m.node;
      llm.config = {
        profile: "custom",
        custom: { model: m.model, modelTotalTokens: 1000000, outputTokens: 8192, apikey: `\${${m.keyEnv}}` },
        parameters: {},
      };
    }
  }
  return cfg as unknown as UsePipeline;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runLane(client: any, token: string, text: string): Promise<LaneResult> {
  const q = new Question();
  q.addQuestion(text);
  const resp = await client.chat({ token, question: q });
  const rErr = (resp as Record<string, unknown> | null)?.error as { message?: string } | undefined;
  if (rErr?.message) return { lane: "run", verdict: "ERROR", detail: `engine: ${rErr.message}` };
  const answers: unknown[] = Array.isArray(resp?.answers) ? resp.answers : [];
  return laneFromAnswers(answers, "run") ?? { lane: "run", verdict: "ERROR", detail: "no run verdict parsed" };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function judgeLane(client: any, token: string, text: string): Promise<LaneResult> {
  const q = new Question({ expectJson: true });
  q.addInstruction("Role", JUDGE_INSTRUCTION);
  q.addQuestion(text);
  const resp = await client.chat({ token, question: q });
  const jErr = (resp as Record<string, unknown> | null)?.error as { message?: string } | undefined;
  if (jErr?.message) return { lane: "judge", verdict: "ERROR", detail: `engine: ${jErr.message}` };
  const answers: unknown[] = Array.isArray(resp?.answers) ? resp.answers : [];
  // robust across providers (Gemini auto-parses; Claude may wrap JSON in prose/fences)
  for (const a of answers) {
    let obj: unknown = a;
    if (typeof obj === "string") {
      const s = obj.trim().replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
      try {
        obj = JSON.parse(s);
      } catch {
        const m = s.match(/\{[^{}]*"verdict"[^{}]*\}/);
        if (!m) continue;
        try {
          obj = JSON.parse(m[0]);
        } catch {
          continue;
        }
      }
    }
    if (obj && typeof obj === "object" && "verdict" in (obj as object)) {
      const o = obj as Record<string, unknown>;
      return { lane: "judge", verdict: (o.verdict as Verdict) ?? "ERROR", detail: String(o.detail ?? "") };
    }
  }
  return { lane: "judge", verdict: "ERROR", detail: "no judge verdict parsed" };
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

function base(file: string): string {
  return file.split("/").pop() || file;
}

function aggregate(results: FileResult[]): Pick<VerifyResult, "summary" | "verdict" | "reason"> {
  const summary: LaneResult[] = LANE_ORDER.map((lane) => {
    const relevant = results.filter((r) => r.lanes[lane]);
    if (relevant.length === 0) return { lane, verdict: "PASS" as Verdict, detail: "not run" };
    // single file: keep the rich per-lane explanation
    if (relevant.length === 1) {
      const only = relevant[0].lanes[lane]!;
      return { lane, verdict: only.verdict, detail: only.detail };
    }
    const failed = relevant.filter((r) => r.lanes[lane]!.verdict !== "PASS");
    if (failed.length) {
      const names = failed.map((r) => base(r.file));
      const detail = names.slice(0, 4).join(", ") + (names.length > 4 ? ` +${names.length - 4}` : "");
      return { lane, verdict: "FAIL" as Verdict, detail };
    }
    return { lane, verdict: "PASS" as Verdict, detail: `${relevant.length} files clean` };
  });
  const verdict = summary.every((s) => s.verdict === "PASS") ? "PASS" : "FAIL";
  const fails = summary.filter((s) => s.verdict !== "PASS").map((s) => s.lane);
  const reason = verdict === "PASS" ? "all lanes passed" : `failed: ${fails.join(", ")}`;
  return { summary, verdict, reason };
}

export async function verify(input: { task: string; diff: string; model?: string; orModel?: string }): Promise<VerifyResult> {
  const started = Date.now();
  const fileDiffs = splitDiffByFile(input.diff);
  const deepFiles = selectDeepFiles(fileDiffs, MAX_DEEP);
  const deepSet = new Set(deepFiles.map((f) => f.file));

  const results: FileResult[] = fileDiffs.map((fd) => ({
    file: fd.file,
    deepChecked: deepSet.has(fd.file),
    lanes: {
      run: null,
      judge: null,
      secrets: secretsCheck(fd.diff),
      size: sizeCheck(input.task, fd.diff),
    },
  }));
  const byFile = new Map(results.map((r) => [r.file, r]));

  if (deepFiles.length > 0) {
    const uri = process.env.ROCKETRIDE_URI;
    if (!uri) throw new Error("ROCKETRIDE_URI is not set (the RocketRide engine WebSocket URI).");
    const client = new RocketRideClient({ uri, auth: process.env.ROCKETRIDE_APIKEY ?? "local" });
    await client.connect();
    try {
      const { token: runTok } = await client.use({ pipeline: freshRunPipe() });
      const { token: judgeTok } = await client.use({ pipeline: loadJudgePipe(input.model ?? "gemini-flash-lite", input.orModel) });
      await pool(deepFiles, CONCURRENCY, async (fd) => {
        const text = `TASK: ${input.task}\nFILE: ${fd.file}\nDIFF:\n${fd.diff}`;
        const fr = byFile.get(fd.file)!;
        const [run, judge] = await Promise.all([runLane(client, runTok, text), judgeLane(client, judgeTok, text)]);
        fr.lanes.run = run;
        fr.lanes.judge = judge;
      });
      await Promise.allSettled([client.terminate(runTok), client.terminate(judgeTok)]);
    } finally {
      await client.disconnect();
    }
  }

  const { summary, verdict, reason } = aggregate(results);
  return {
    verdict,
    reason,
    summary,
    files: results,
    totalFiles: fileDiffs.length,
    deepCheckedCount: deepFiles.length,
    elapsedMs: Date.now() - started,
  };
}
