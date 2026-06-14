export interface Sample {
  id: string;
  label: string;
  hint: string;
  task: string;
  diff: string;
}

export const SAMPLES: Sample[] = [
  {
    id: "clean",
    label: "Clean",
    hint: "a correct change → everything PASSES",
    task: "Add a function is_even(n) that returns True when n is even.",
    diff: `diff --git a/num_utils.py b/num_utils.py
new file mode 100644
--- /dev/null
+++ b/num_utils.py
@@ -0,0 +1,2 @@
+def is_even(n):
+    return n % 2 == 0`,
  },
  {
    id: "bug",
    label: "Logic bug",
    hint: "clamp() forgets the upper bound → RUN + JUDGE fail",
    task: "Add clamp(x, lo, hi) that constrains x to the range [lo, hi].",
    diff: `diff --git a/clamp.py b/clamp.py
new file mode 100644
--- /dev/null
+++ b/clamp.py
@@ -0,0 +1,2 @@
+def clamp(x, lo, hi):
+    return max(lo, x)`,
  },
  {
    id: "secret",
    label: "Leaked key",
    hint: "hardcoded sk-… key → SECRETS fails, but JUDGE passes",
    task: "Add a helper get_key() that returns the configured API key.",
    diff: `diff --git a/config.py b/config.py
new file mode 100644
--- /dev/null
+++ b/config.py
@@ -0,0 +1,3 @@
+OPENAI_API_KEY = "sk-proj-AbCdEf0123456789abcdef0123456789ABCDEF"
+def get_key():
+    return OPENAI_API_KEY`,
  },
  {
    id: "bloat",
    label: "Bloat",
    hint: "200-line diff for a one-line typo task → SIZE fails",
    task: "Fix a typo in the README.",
    diff:
      `diff --git a/generated.py b/generated.py
new file mode 100644
--- /dev/null
+++ b/generated.py
@@ -0,0 +1,200 @@
` + Array.from({ length: 200 }, (_, i) => `+    field_${i} = ${i}`).join("\n"),
  },
];
