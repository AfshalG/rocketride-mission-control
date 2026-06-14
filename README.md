# Mission Control

**Verify what AI coding agents ship — on [RocketRide](https://rocketride.org)'s runtime.**

A coding agent (Claude Code, or any other) writes and commits code. Mission Control
answers the question the agent can't answer about itself: **did it actually work?**

You give it `{task, diff}` — the task the agent was asked to do, and the git diff it
produced — and it fans out **four verification lanes in parallel**, then synthesizes a
single **PASS / FAIL** verdict with a per-lane breakdown.

| Lane | How | What it checks |
| --- | --- | --- |
| **Run-check** | RocketRide: `agent` + `tool_python` | Does the code in the diff actually run / pass basic asserts? |
| **Judge** | RocketRide: LLM (Gemini) | Is the change correct vs the stated task? |
| **Secrets** | deterministic regex | Leaked API keys (`sk-…`, `ghp_…`) in the diff? |
| **Size / cost** | deterministic line/char count | Runaway diff vs the task — the idea behind Claude Code's token-budget tracker, as a lane |

The two LLM/execution lanes run on **RocketRide's C++ runtime**, fired concurrently and
aggregated by the app; the deterministic lanes need no LLM (don't spend a model call on a
regex). The interesting work is in the *composition*, not the plumbing.

## Parallelism

The lanes run concurrently, not one-by-one. Measured on a local dev engine
(`gemini-3.1-flash-lite`), the four-lane fan-out runs in **~8s vs ~13s sequential (~1.6×)**.
The point isn't the multiplier on a laptop — it's that parallelism here is a *pipeline-shape
choice* (fan out from `chat`, fan in to `response_answers`), **not hand-rolled concurrency
code**. It scales with lane count, lane balance, and a production / multi-core engine.

## Status

🚧 **In active development**, built in thin, independently demoable vertical slices:

- [x] **Slice 0** — baseline pipeline runs (chat → agent → LLM → response)
- [x] **Slice 1** — single-lane verifier: `{task, diff}` → judge → PASS/FAIL verdict
- [x] **Slice 2** — four parallel verification lanes + synthesis
- [x] **Slice 3** — sequential-vs-parallel benchmark (~1.6× on the four-lane fan-out)
- [x] **Slice 4** — verdict-card web UI (Next.js + RocketRide SDK)

## Why RocketRide

Mission Control is a verification "brain" expressed as composable RocketRide nodes.
Parallel execution, secret/PII scanning, sandboxed code execution, model-swap, and
observability all come from the runtime instead of hand-rolled infrastructure — so the
pipeline stays small and the interesting work is in the *composition*, not the plumbing.

## Layout

```
pipes/      RocketRide pipeline definitions (.pipe) — run-check.pipe, verifier.pipe
web/        Next.js verdict-card app (App Router + the /api/verify orchestrator)
```

## Running it

**1. The RocketRide engine** — run locally via the
[VS Code extension](https://docs.rocketride.org), or with Docker:

```sh
docker pull ghcr.io/rocketride-org/rocketride-engine:latest
```

The judge LLM uses a Gemini API key via the `ROCKETRIDE_GEMINI_KEY` environment variable
(or the node's API-key field) — **never committed to the repo**.

**2. The web app:**

```sh
cd web
npm install
cp .env.example .env.local   # set ROCKETRIDE_URI to your engine's ws:// address
npm run dev                  # http://localhost:3000
```

Paste a diff (or load a sample) and run verification — the verdict card renders the
overall PASS/FAIL and each lane's result.

## License

[MIT](LICENSE)
