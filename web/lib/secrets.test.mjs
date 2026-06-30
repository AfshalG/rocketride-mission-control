import { test } from "node:test";
import assert from "node:assert/strict";
import { redactSecrets, secretsCheck } from "./secrets.ts";

const KEY = "sk-ant-api03-DEMO0000000000000000000000";

test("redactSecrets removes the full secret but keeps a short type prefix", () => {
  const out = redactSecrets(`the key is ${KEY} ok`);
  assert.ok(!out.includes(KEY), "full key must not appear");
  assert.match(out, /redacted/i);
  assert.match(out, /sk-ant/); // key type still recognizable
});

test("redactSecrets masks GitHub / AWS / Google keys", () => {
  for (const s of [
    "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345",
    "AKIAIOSFODNN7EXAMPLE",
    "AIzaSyA1234567890123456789012345678901234",
  ]) {
    const out = redactSecrets(`x ${s} y`);
    assert.ok(!out.includes(s), `must redact ${s}`);
  }
});

test("redactSecrets leaves clean text untouched", () => {
  const clean = "no secrets here, just normal text";
  assert.equal(redactSecrets(clean), clean);
});

test("secretsCheck flags the key but its detail does not leak the raw value", () => {
  const diff = `--- a/c.py\n+++ b/c.py\n@@ -0,0 +1 @@\n+    return "${KEY}"\n`;
  const r = secretsCheck(diff);
  assert.equal(r.verdict, "FAIL");
  assert.ok(!r.detail.includes(KEY), "secrets lane must not echo the raw key");
  assert.match(r.detail, /redacted/i);
});
