import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

/**
 * Next 16 renamed `middleware.ts` to `proxy.ts`.
 *
 * This is a convenience redirect, NOT a security boundary. It only checks
 * whether a session cookie is present — it does not verify the signature, and
 * it never decides what a role may see. Every protected route is gated again
 * server-side in its layout (`requireRole`) and every API route in
 * `withAuth`, which is where the real enforcement lives.
 *
 * The point is simply that a signed-out visitor gets sent to /login without
 * paying for a render first.
 */
export function proxy(request: NextRequest) {
  const hasCookie = request.cookies.has(SESSION_COOKIE);

  if (!hasCookie) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/teacher/:path*", "/student/:path*"],
};
