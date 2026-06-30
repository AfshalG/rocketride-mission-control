import { NextResponse } from "next/server";
import { getActiveLoop } from "@/lib/loopStore";

export const runtime = "nodejs";

export async function GET() {
  const r = getActiveLoop();
  return NextResponse.json(r ? { active: true, ...r } : { active: false });
}
