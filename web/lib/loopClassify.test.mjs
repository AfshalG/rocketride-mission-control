import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyLoop } from "./loopClassify.ts";

const lane = (l, v, detail = "") => ({ lane: l, verdict: v, detail });
const mk = (lanes) => ({ verdict: "FAIL", reason: "", summary: lanes, files: [], totalFiles: 1, deepCheckedCount: 1, elapsedMs: 1 });

test("run-only FAIL is advisory → PASS, no blocking failures", () => {
  const c = classifyLoop(mk([lane("run", "FAIL", "os not available"), lane("secrets", "PASS"), lane("size", "PASS"), lane("judge", "PASS")]));
  assert.equal(c.verdict, "PASS");
  assert.deepEqual(c.failures, []);
});
test("secrets FAIL blocks", () => {
  const c = classifyLoop(mk([lane("run", "PASS"), lane("secrets", "FAIL", "hardcoded key"), lane("size", "PASS"), lane("judge", "PASS")]));
  assert.equal(c.verdict, "FAIL");
  assert.match(c.failures[0], /secrets/);
});
test("blocking lane ERROR → ERROR (infra), even if run is fine", () => {
  const c = classifyLoop(mk([lane("run", "PASS"), lane("secrets", "PASS"), lane("size", "PASS"), lane("judge", "ERROR", "engine down")]));
  assert.equal(c.verdict, "ERROR");
});
test("run ERROR + blocking lanes PASS → PASS", () => {
  const c = classifyLoop(mk([lane("run", "ERROR", "os module"), lane("secrets", "PASS"), lane("size", "PASS"), lane("judge", "PASS")]));
  assert.equal(c.verdict, "PASS");
});
