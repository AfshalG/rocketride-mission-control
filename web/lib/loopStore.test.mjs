import { test } from "node:test";
import assert from "node:assert/strict";
import { bumpAttempt, resetAttempt, getAttempt } from "./loopStore.ts";

test("bumpAttempt increments per session and reset clears it", () => {
  const s = "sess-A";
  assert.equal(getAttempt(s), 0);
  assert.equal(bumpAttempt(s), 1);
  assert.equal(bumpAttempt(s), 2);
  assert.equal(getAttempt(s), 2);
  // sessions are independent
  assert.equal(bumpAttempt("sess-B"), 1);
  assert.equal(getAttempt(s), 2);
  resetAttempt(s);
  assert.equal(getAttempt(s), 0);
});
