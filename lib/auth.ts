import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { Role } from "@/models/User";

/**
 * The one and only auth module.
 *
 * Every route handler, layout and server action gets its identity from here.
 * The rule this module exists to enforce:
 *
 *   schoolId ALWAYS comes from the verified JWT. Never from the request body,
 *   never from a query parameter, never from a URL segment.
 *
 * Nothing outside this file should read the session cookie or call jwtVerify.
 */

export const SESSION_COOKIE = "sotm_session";

/** 7 days, in seconds. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export type SessionClaims = {
  userId: string;
  schoolId: string;
  role: Role;
};

/** Where each role lands after logging in. */
export const HOME_FOR_ROLE: Record<Role, string> = {
  admin: "/admin",
  teacher: "/teacher",
  student: "/student",
};

let cachedSecret: Uint8Array | null = null;

function getSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;

  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "Missing or too-short JWT_SECRET environment variable (needs at least 32 characters). " +
        "Generate one with `openssl rand -base64 48` and put it in .env.local, " +
        "and in the Vercel project's environment variables."
    );
  }

  cachedSecret = new TextEncoder().encode(secret);
  return cachedSecret;
}

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

export async function signSessionToken(claims: SessionClaims): Promise<string> {
  // Only these three fields go in. No email, no name, no password hash — the
  // token is readable by anyone who has it, it is only unforgeable.
  return new SignJWT({
    schoolId: claims.schoolId,
    role: claims.role,
  } satisfies Omit<SessionClaims, "userId"> & JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

/**
 * Verifies a token's signature and expiry and returns its claims.
 * Returns null for anything at all suspicious — never throws at callers.
 */
export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionClaims | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"], // pinned: stops an "alg: none" style downgrade
    });

    const userId = payload.sub;
    const schoolId = payload.schoolId;
    const role = payload.role;

    if (
      typeof userId !== "string" ||
      typeof schoolId !== "string" ||
      (role !== "admin" && role !== "teacher" && role !== "student")
    ) {
      return null;
    }

    return { userId, schoolId, role };
  } catch {
    // Bad signature, expired, malformed — all the same to a caller.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reading the session
// ---------------------------------------------------------------------------

/** Minimal RFC-6265 cookie header parse — enough to find one named cookie. */
function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

/** For route handlers: derive the session from the incoming Request alone. */
export async function getSessionFromRequest(
  request: Request
): Promise<SessionClaims | null> {
  return verifySessionToken(
    readCookie(request.headers.get("cookie"), SESSION_COOKIE)
  );
}

/** For server components, layouts and server actions. */
export async function getSession(): Promise<SessionClaims | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

// ---------------------------------------------------------------------------
// Guards for server components / layouts
// ---------------------------------------------------------------------------

/** Redirects to /login when there is no valid session. */
export async function requireSession(): Promise<SessionClaims> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * Server-side role gate for a route group's layout.
 *
 * A student who types /admin into the address bar is bounced to their own
 * home, because this runs on the server before any markup is produced — it is
 * not a client-side check that can be skipped with devtools.
 */
export async function requireRole(role: Role): Promise<SessionClaims> {
  const session = await requireSession();
  if (session.role !== role) redirect(HOME_FOR_ROLE[session.role]);
  return session;
}

// ---------------------------------------------------------------------------
// Guard for route handlers
// ---------------------------------------------------------------------------

export type AuthedHandler<Ctx = unknown> = (
  request: Request,
  auth: SessionClaims,
  context: Ctx
) => Promise<Response> | Response;

/**
 * Wraps a route handler so it only ever runs with a verified session, and
 * receives schoolId/role as arguments rather than reaching for them itself.
 *
 *   export const GET = withAuth(async (request, auth) => { … })
 *
 * Optionally restrict to particular roles:
 *
 *   export const POST = withAuth(handler, { roles: ["admin"] })
 */
export function withAuth<Ctx = unknown>(
  handler: AuthedHandler<Ctx>,
  options: { roles?: readonly Role[] } = {}
) {
  return async (request: Request, context: Ctx): Promise<Response> => {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return Response.json(
        { error: "Not signed in." },
        { status: 401, headers: { "cache-control": "no-store" } }
      );
    }

    if (options.roles && !options.roles.includes(session.role)) {
      return Response.json(
        { error: "Your role does not have access to this." },
        { status: 403, headers: { "cache-control": "no-store" } }
      );
    }

    return handler(request, session, context);
  };
}

// ---------------------------------------------------------------------------
// Writing the cookie
// ---------------------------------------------------------------------------

/**
 * `secure` is derived from the actual protocol rather than NODE_ENV, so the
 * cookie is secure on the deployed HTTPS site while still working against a
 * production build served over http://localhost during tests.
 */
function isSecure(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim() === "https";
  return new URL(request.url).protocol === "https:";
}

export function withSessionCookie(
  response: NextResponse,
  token: string,
  request: Request
): NextResponse {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecure(request),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}

export function withClearedSessionCookie(
  response: NextResponse,
  request: Request
): NextResponse {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isSecure(request),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
