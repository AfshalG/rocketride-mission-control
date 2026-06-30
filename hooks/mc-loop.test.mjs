import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDecision } from "./mc-loop.mjs";

test("FAIL under cap blocks with the failing lanes in the reason", () => {
  const d = buildDecision({
    verdict: "FAIL",
    iteration: 1,
    cap: 5,
    capReached: false,
    failures: ["secrets: hardcoded secret detected: sk-ant-…"],
    summary: "attempt 1/5 failed: secrets",
  });
  assert.equal(d.block, true);
  assert.match(d.reason, /secrets/);
  assert.match(d.reason, /fix/i);
});

test("PASS releases (no block)", () => {
  const d = buildDecision({
    verdict: "PASS",
    iteration: 2,
    cap: 5,
    capReached: false,
    failures: [],
    summary: "all lanes passed",
  });
  assert.equal(d.block, false);
});

test("cap reached releases even on FAIL", () => {
  const d = buildDecision({
    verdict: "FAIL",
    iteration: 5,
    cap: 5,
    capReached: true,
    failures: ["judge: still wrong"],
    summary: "needs a human",
  });
  assert.equal(d.block, false);
  assert.match(d.note, /human/i);
});

test("ERROR releases (infra safety)", () => {
  const d = buildDecision({
    verdict: "ERROR",
    iteration: 1,
    cap: 5,
    capReached: false,
    failures: [],
    summary: "released on infra error",
  });
  assert.equal(d.block, false);
});

test("CANCELLED releases with a cancel note", () => {
  const d = buildDecision({
    verdict: "CANCELLED",
    iteration: 2,
    cap: 5,
    capReached: false,
    failures: [],
    summary: "cancelled by user",
  });
  assert.equal(d.block, false);
  assert.match(d.note, /cancel/i);
});
