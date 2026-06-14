// Split a unified diff into per-file diffs, and decide which files are worth the
// (expensive) LLM lanes vs. just the deterministic ones.

export interface FileDiff {
  file: string;
  diff: string;
}

/** Split at `diff --git a/… b/…` boundaries. Falls back to a single block. */
export function splitDiffByFile(diff: string): FileDiff[] {
  const lines = diff.split("\n");
  const files: FileDiff[] = [];
  let cur: string[] | null = null;
  let curFile = "";

  for (const line of lines) {
    const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (m) {
      if (cur) files.push({ file: curFile, diff: cur.join("\n") });
      cur = [line];
      curFile = m[2];
    } else if (cur) {
      cur.push(line);
    }
  }
  if (cur) files.push({ file: curFile, diff: cur.join("\n") });

  if (files.length === 0 && diff.trim()) {
    files.push({ file: "(diff)", diff });
  }
  return files;
}

const SKIP_PATTERNS: RegExp[] = [
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|composer\.lock|go\.sum)$/,
  /\.(svg|png|jpe?g|gif|ico|webp|pdf|woff2?|ttf|eot|lock|map)$/i,
  /\.min\.(js|css)$/i,
];

/** Lockfiles, binaries, generated assets — skip the LLM lanes (deterministic still runs). */
export function isDeepCheckable(file: string): boolean {
  return !SKIP_PATTERNS.some((re) => re.test(file));
}

/** Pick the files that get the LLM lanes: code files first, capped. */
export function selectDeepFiles(files: FileDiff[], max: number): FileDiff[] {
  return files.filter((f) => isDeepCheckable(f.file)).slice(0, max);
}
