import { NextResponse } from "next/server";
import { verify } from "@/lib/verify";

// The RocketRide SDK needs the Node runtime (fs + websockets), not edge.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { task?: string; diff?: string; model?: string; orModel?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const task = (body.task ?? "").trim();
  const diff = (body.diff ?? "").trim();
  const model = typeof body.model === "string" ? body.model : undefined;
  const orModel = typeof body.orModel === "string" ? body.orModel : undefined;
  if (!diff) {
    return NextResponse.json({ error: "A diff is required." }, { status: 400 });
  }

  try {
    const result = await verify({ task, diff, model, orModel });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Verification failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
