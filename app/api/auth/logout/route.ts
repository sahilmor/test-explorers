import { NextResponse } from "next/server";
import { withClearedSessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withClearedSessionCookie(NextResponse.json({ ok: true }), request);
}
