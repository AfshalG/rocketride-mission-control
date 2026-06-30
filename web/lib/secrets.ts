import type { LaneResult } from "./types";

// Patterns for the deterministic secret-scanning lane. Kept here (not in verify.ts) so
// the scanning + redaction logic is unit-testable without importing the RocketRide SDK.
export const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9]{16,}/, // OpenAI classic
  /sk-ant-[A-Za-z0-9_-]{12,}/, // Anthropic
  /sk-proj-[A-Za-z0-9_-]{12,}/, // OpenAI project key
  /sk-or-v1-[A-Za-z0-9]{12,}/, // OpenRouter
  /gh[oprsu]_[A-Za-z0-9]{20,}/, // GitHub tokens (ghp_/gho_/ghs_/ghu_/ghr_)
  /AKIA[0-9A-Z]{16}/, // AWS access key id
  /AIza[0-9A-Za-z_-]{35}/, // Google API key
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /(api[_-]?key|secret|password|token)\s*[=:]\s*["'][^"']{8,}["']/i,
];

export function addedLines(diff: string): string[] {
  return diff
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1));
}

// Mask any detected secret so the verifier never reprints it in full. A secret scanner
// that echoes the secret it caught would leak it into the UI, PR comments, verdict
// history, and the hook's block reason — so we scrub every generated string (including
// the LLM lanes' free-text, which can quote the literal). A short type-identifying
// prefix is kept (e.g. "sk-ant-") so the finding stays useful.
export function redactSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    out = out.replace(g, (m) => `${m.slice(0, 7)}…[redacted]`);
  }
  return out;
}

export function secretsCheck(diff: string): LaneResult {
  const body = addedLines(diff).join("\n");
  for (const re of SECRET_PATTERNS) {
    const m = body.match(re);
    if (m) return { lane: "secrets", verdict: "FAIL", detail: `hardcoded secret detected: ${redactSecrets(m[0])}` };
  }
  return { lane: "secrets", verdict: "PASS", detail: "no hardcoded secrets or API keys in added lines" };
}
