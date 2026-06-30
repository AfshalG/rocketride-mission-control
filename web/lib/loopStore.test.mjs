import { test } from "node:test";
import assert from "node:assert/strict";
import { recordAttempt, requestCancel, isCancelRequested, resetLoop, getActiveLoop } from "./loopStore.ts";

test("recordAttempt builds a timeline and transitions status", () => {
  resetLoop("S");
  let r = recordAttempt("S", { verdict: "FAIL", failures: ["secrets: x"], cap: 3 });
  assert.equal(r.attempt, 1);
  assert.equal(r.status, "fixing");
  assert.equal(r.attempts.length, 1);
  r = recordAttempt("S", { verdict: "PASS", failures: [], cap: 3 });
  assert.equal(r.attempt, 2);
  assert.equal(r.status, "passed");
  assert.equal(r.attempts.length, 2);
});
test("a fresh loop starts after a terminal status", () => {
  resetLoop("T");
  recordAttempt("T", { verdict: "PASS", failures: [], cap: 3 }); // terminal
  const r = recordAttempt("T", { verdict: "FAIL", failures: ["size: big"], cap: 3 });
  assert.equal(r.attempt, 1);
  assert.equal(r.attempts.length, 1);
});
test("cap reached → capped", () => {
  resetLoop("C");
  recordAttempt("C", { verdict: "FAIL", failures: ["judge: no"], cap: 2 });
  const r = recordAttempt("C", { verdict: "FAIL", failures: ["judge: no"], cap: 2 });
  assert.equal(r.status, "capped");
});
test("cancel flag + getActiveLoop returns most recent", () => {
  resetLoop("X");
  resetLoop("Y");
  recordAttempt("X", { verdict: "FAIL", failures: [], cap: 5 });
  recordAttempt("Y", { verdict: "FAIL", failures: [], cap: 5 });
  assert.equal(getActiveLoop().sessionId, "Y");
  assert.equal(isCancelRequested("X"), false);
  assert.equal(requestCancel("X"), true);
  assert.equal(isCancelRequested("X"), true);
  assert.equal(requestCancel("nope"), false);
});
