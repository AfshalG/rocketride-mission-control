import { NextResponse } from "next/server";
import { parsePrRef, postPrComment } from "@/lib/github";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  let body: { ref?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const ref = parsePrRef(body.ref ?? "");
  if (!ref) {
    return NextResponse.json({ error: "Could not parse the PR reference." }, { status: 400 });
  }
  if (!body.body?.trim()) {
    return NextResponse.json({ error: "Empty comment body." }, { status: 400 });
  }

  try {
    const { url } = await postPrComment(ref, body.body);
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to post the comment." },
      { status: 502 },
    );
  }
}
