import type { VerifyResult, LaneName } from "./types";

const ICON = (v: string) => (v === "PASS" ? "✅" : v === "FAIL" ? "❌" : "⚠️");
const LANE_LABEL: Record<string, string> = {
  run: "Run-check",
  secrets: "Secrets",
  size: "Size",
  judge: "Judge",
};

/** Format a verdict as a GitHub-flavored markdown PR comment. */
export function formatVerdictMarkdown(r: VerifyResult, modelLabel: string): string {
  const out: string[] = [];
  out.push(`## Mission Control — ${ICON(r.verdict)} **${r.verdict}**`);
  out.push("");
  out.push(`> ${r.reason} · judged by ${modelLabel} · ${(r.elapsedMs / 1000).toFixed(1)}s`);
  out.push("");
  out.push("| Lane | Verdict | Detail |");
  out.push("| --- | --- | --- |");
  for (const l of r.summary) {
    out.push(`| ${LANE_LABEL[l.lane] ?? l.lane} | ${ICON(l.verdict)} ${l.verdict} | ${l.detail.replace(/\|/g, "\\|")} |`);
  }

  if (r.totalFiles > 1) {
    out.push("");
    out.push(`<details><summary>Per-file (${r.totalFiles} files · ${r.deepCheckedCount} deep-checked)</summary>`);
    out.push("");
    out.push("| File | Run | Secrets | Size | Judge |");
    out.push("| --- | --- | --- | --- | --- |");
    const order: LaneName[] = ["run", "secrets", "size", "judge"];
    for (const f of r.files) {
      const cells = order.map((ln) => {
        const c = f.lanes[ln];
        return c ? ICON(c.verdict) : "–";
      });
      out.push(`| \`${f.file}\` | ${cells.join(" | ")} |`);
    }
    out.push("");
    out.push("</details>");
  }

  out.push("");
  out.push("— Mission Control · verifies what AI coding agents ship, on RocketRide");
  return out.join("\n");
}
