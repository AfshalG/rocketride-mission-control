# hooks/mc-loop.mjs — Mission Control auto-fix loop

Drop this Stop hook into any repo to make Claude Code self-verify against the
running Mission Control pipeline and keep fixing until every lane is green.

## Wire it

Add to the project's `.claude/settings.json`:

```json
{ "hooks": { "Stop": [ { "hooks": [ { "type": "command",
    "command": "node /ABSOLUTE/PATH/TO/hooks/mc-loop.mjs" } ] } ] } }
```

## Requirements

- Mission Control app running (`cd web && npm run dev`, default `:3000`) with the
  RocketRide engine up.
- The agent edits **tracked** files (the loop verifies `git diff HEAD`).

## Behaviour

- Agent finishes a turn → the hook verifies the diff → on **FAIL** it blocks the
  stop and feeds the failing lanes back, so Claude fixes them → re-verifies →
  releases on **PASS**. No human in the loop after the initial prompt.
- **Safety:** stops after `MC_LOOP_CAP` (default 5) attempts and reports
  "needs a human"; **releases** (never traps the agent) if the engine/app is
  unreachable or the verifier errors.

## Environment

| Var | Default | Purpose |
| --- | --- | --- |
| `MC_LOOP_URL` | `http://localhost:3000/api/loop` | the verifier endpoint |
| `MC_LOOP_CAP` | `5` | max fix attempts before releasing with "needs a human" |
