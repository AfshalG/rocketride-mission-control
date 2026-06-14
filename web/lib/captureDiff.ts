import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Capture the working-tree diff in a project dir (what a CC agent just changed). */
export function gitDiff(cwd: string): string {
  const run = (args: string[]): string => {
    try {
      return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 8_000_000 });
    } catch {
      return "";
    }
  };
  // changes since the last commit (tracked); fall back to plain working-tree diff
  let d = run(["--no-pager", "diff", "HEAD"]);
  if (!d.trim()) d = run(["--no-pager", "diff"]);
  return d;
}

/** Best-effort: pull the last user message from a CC transcript as the "task". */
export function lastUserTask(transcriptPath?: string): string | null {
  if (!transcriptPath) return null;
  try {
    const lines = readFileSync(transcriptPath, "utf8").trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      let obj: unknown;
      try {
        obj = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      const o = obj as Record<string, unknown>;
      const msg = (o.message ?? o) as Record<string, unknown>;
      const role = (msg.role ?? o.type) as string | undefined;
      if (role !== "user") continue;
      const c = msg.content;
      if (typeof c === "string" && c.trim()) return c.trim().slice(0, 500);
      if (Array.isArray(c)) {
        const t = c.find((x) => typeof (x as Record<string, unknown>)?.text === "string") as
          | Record<string, unknown>
          | undefined;
        if (t?.text) return String(t.text).slice(0, 500);
      }
    }
  } catch {
    /* unreadable transcript */
  }
  return null;
}
