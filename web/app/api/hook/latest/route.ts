import { NextResponse } from "next/server";
import { getLatestHook } from "@/lib/hookStore";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getLatestHook() ?? { id: null });
}
