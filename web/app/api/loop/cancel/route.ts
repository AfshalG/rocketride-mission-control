import { NextResponse } from "next/server";
import { requestCancel, getActiveLoop } from "@/lib/loopStore";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* tolerate empty body */
  }
  const sid =
    (typeof body.session_id === "string" && body.session_id) || getActiveLoop()?.sessionId;
  if (!sid) return NextResponse.json({ ok: false, reason: "no active loop" });
  const ok = requestCancel(sid);
  return NextResponse.json({ ok, sessionId: sid });
}
