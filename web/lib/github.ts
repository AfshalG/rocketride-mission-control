/**
 * Fetch a GitHub pull request's title (→ task) and unified diff (→ diff),
 * so a user can verify a real PR by pasting its URL instead of a raw diff.
 */

export interface PrRef {
  owner: string;
  repo: string;
  number: number;
}

export interface PrResult {
  task: string;
  diff: string;
  title: string;
  url: string;
  ref: string; // owner/repo#number
  truncated: boolean;
}

const MAX_DIFF_CHARS = 60_000; // keep the LLM lanes within a sane context window

/** Accepts a PR URL, `owner/repo#123`, or `owner/repo/pull/123`. */
export function parsePrRef(input: string): PrRef | null {
  const s = input.trim();
  const patterns = [
    /github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/i, // full/short URL
    /^([^/\s]+)\/([^/\s#]+)#(\d+)$/, // owner/repo#123
    /^([^/\s]+)\/([^/\s]+)\/pull\/(\d+)$/, // owner/repo/pull/123
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      return { owner: m[1], repo: m[2].replace(/\.git$/, ""), number: Number(m[3]) };
    }
  }
  return null;
}

function headers(accept: string): HeadersInit {
  const h: Record<string, string> = {
    Accept: accept,
    "User-Agent": "mission-control",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

export async function fetchPr(ref: PrRef): Promise<PrResult> {
  const api = `https://api.github.com/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`;

  const metaRes = await fetch(api, { headers: headers("application/vnd.github+json") });
  if (metaRes.status === 404) throw new Error(`PR not found: ${ref.owner}/${ref.repo}#${ref.number}`);
  if (metaRes.status === 403) throw new Error("GitHub rate limit hit — set GITHUB_TOKEN in .env.local.");
  if (!metaRes.ok) throw new Error(`GitHub API error (${metaRes.status}).`);
  const meta = (await metaRes.json()) as { title?: string; html_url?: string };

  const diffRes = await fetch(api, { headers: headers("application/vnd.github.v3.diff") });
  if (!diffRes.ok) throw new Error(`Could not fetch the PR diff (${diffRes.status}).`);
  let diff = await diffRes.text();

  let truncated = false;
  if (diff.length > MAX_DIFF_CHARS) {
    diff = diff.slice(0, MAX_DIFF_CHARS) + "\n… [diff truncated]";
    truncated = true;
  }

  return {
    task: meta.title?.trim() || `PR #${ref.number}`,
    diff,
    title: meta.title?.trim() || `PR #${ref.number}`,
    url: meta.html_url || `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`,
    ref: `${ref.owner}/${ref.repo}#${ref.number}`,
    truncated,
  };
}

/** Post a comment to a PR (needs a token with write access to that repo). */
export async function postPrComment(ref: PrRef, body: string): Promise<{ url: string }> {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error("Posting needs a GITHUB_TOKEN with repo write access — set it in web/.env.local.");
  }
  const api = `https://api.github.com/repos/${ref.owner}/${ref.repo}/issues/${ref.number}/comments`;
  const res = await fetch(api, {
    method: "POST",
    headers: { ...headers("application/vnd.github+json"), "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (res.status === 403 || res.status === 404) {
    throw new Error(`No write access to ${ref.owner}/${ref.repo} — use a PR you can comment on.`);
  }
  if (!res.ok) throw new Error(`GitHub API error posting the comment (${res.status}).`);
  const data = (await res.json()) as { html_url?: string };
  return { url: data.html_url || `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}` };
}
