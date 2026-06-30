// Claude Code Stop hook — Mission Control auto-fix loop.
// Reads the Stop event from stdin, asks the running Mission Control app to verify
// the session's diff, and BLOCKS the stop (feeding the failures back to Claude) until
// the verdict is green or the attempt cap is hit. Wire via .claude/settings.json:
//   { "hooks": { "Stop": [ { "hooks": [ { "type": "command",
//       "command": "node /abs/path/to/hooks/mc-loop.mjs" } ] } ] } }
// Requires the Mission Control app running (default http://localhost:3000) with the
// RocketRide engine up. Override the endpoint with MC_LOOP_URL.

const URL = process.env.MC_LOOP_URL || "http://localhost:3000/api/loop";

/** Pure decision: turn a /api/loop response into block-or-release. */
export function buildDecision(resp) {
  if (resp && resp.verdict === "FAIL" && !resp.capReached) {
    const lanes = (resp.failures || []).join("\n  - ");
    const reason =
      `Mission Control verification FAILED (attempt ${resp.iteration}/${resp.cap}).\n` +
      `Fix these and finish — the change is not done until all lanes pass:\n  - ${lanes}`;
    return { block: true, reason, note: `blocking — attempt ${resp.iteration}/${resp.cap}` };
  }
  const note = !resp
    ? "released — no response"
    : resp.verdict === "PASS"
      ? `released — all green (attempt ${resp.iteration})`
      : resp.capReached
        ? `released — still failing after ${resp.iteration} attempts; needs a human`
        : resp.verdict === "ERROR"
          ? `released — infra error: ${resp.summary}`
          : `released — ${resp.summary}`;
  return { block: false, note };
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
    // hooks always pipe stdin; guard anyway so we never hang
    setTimeout(() => resolve(data), 2000).unref?.();
  });
}

async function main() {
  let evt = {};
  try {
    evt = JSON.parse((await readStdin()) || "{}");
  } catch {
    /* odd/empty stdin — fall through with defaults */
  }
  const payload = {
    session_id: evt.session_id,
    cwd: evt.cwd,
    transcript_path: evt.transcript_path,
  };
  let resp;
  try {
    const r = await fetch(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    resp = await r.json();
  } catch (e) {
    // Infra failure (app/engine down) — NEVER trap the agent.
    process.stderr.write(`[mc-loop] released — cannot reach verifier: ${e?.message || e}\n`);
    process.exit(0);
  }
  const d = buildDecision(resp);
  process.stderr.write(`[mc-loop] ${d.note}\n`);
  if (d.block) process.stdout.write(JSON.stringify({ decision: "block", reason: d.reason }));
  process.exit(0);
}

// Only run main when executed directly (not when imported by the test).
if (import.meta.url === `file://${process.argv[1]}`) main();
