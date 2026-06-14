# Mission Control

**Verify what AI coding agents ship — on [RocketRide](https://rocketride.org)'s runtime.**

A coding agent (Claude Code, or any other) writes and commits code. Mission Control
answers the question the agent can't answer about itself: **did it actually work?**

You give it `{task, diff}` — the task the agent was asked to do, and the git diff it
produced — and a RocketRide pipeline fans out **parallel verification lanes**, then
synthesizes a single **PASS / FAIL** verdict with a confidence score and a one-line
diagnosis.

| Lane | RocketRide nodes | What it checks |
| --- | --- | --- |
| **Run-check** | agent + `tool_python` | Does the code in the diff actually run / pass basic asserts? |
| **Secrets** | agent + `tool_python` (regex) + `guardrails` | Leaked API keys (`sk-…`, `ghp_…`) or PII in the diff? |
| **Cost / size** | agent + `tool_python` | Runaway diff size vs the task — the idea behind Claude Code's internal token-budget tracker, as a lane |
| **Judge** | agent + LLM (Gemini) | Is the change correct vs the stated task? |

Because the lanes run concurrently on RocketRide's C++ runtime, you also get per-lane
latency and token-cost **traces for free** — no hand-rolled instrumentation.

## Status

🚧 **In active development**, built in thin, independently demoable vertical slices:

- [x] **Slice 0** — baseline pipeline runs (chat → agent → LLM → response)
- [ ] **Slice 1** — single-lane verifier: `{task, diff}` → judge → PASS/FAIL verdict
- [ ] **Slice 2** — four parallel verification lanes + synthesis
- [ ] **Slice 3** — sequential-vs-parallel speedup benchmark + trace capture
- [ ] **Slice 4** — verdict-card web UI (Next.js + RocketRide SDK)

## Why RocketRide

Mission Control is a verification "brain" expressed as composable RocketRide nodes.
Parallel execution, secret/PII scanning, sandboxed code execution, model-swap, and
observability all come from the runtime instead of hand-rolled infrastructure — so the
pipeline stays small and the interesting work is in the *composition*, not the plumbing.

## Layout

```
pipes/      RocketRide pipeline definitions (.pipe)
ui/         Next.js verdict-card app (arrives in Slice 4)
```

## Running it

Requires the RocketRide engine — run locally via the
[VS Code extension](https://docs.rocketride.org), or with Docker:

```sh
docker pull ghcr.io/rocketride-org/rocketride-engine:latest
```

The judge LLM uses a Gemini API key supplied via the `ROCKETRIDE_GEMINI_KEY`
environment variable (or the node's API-key field) — **never committed to the repo**.

A browser-based way to run it (paste a diff, see the verdict card) arrives with Slice 4.

## License

[MIT](LICENSE)
