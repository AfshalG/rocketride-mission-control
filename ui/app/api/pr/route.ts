import { NextResponse } from "next/server";
import { parsePrRef, fetchPr } from "@/lib/github";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  let body: { ref?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const ref = parsePrRef(body.ref ?? "");
  if (!ref) {
    return NextResponse.json(
      { error: "Couldn't read that. Use a PR URL, owner/repo#123, or owner/repo/pull/123." },
      { status: 400 },
    );
  }

  try {
    const result = await fetchPr(ref);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to fetch the PR.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
