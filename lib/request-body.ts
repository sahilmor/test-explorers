import { NextResponse } from "next/server";

/**
 * Auth forms post JSON when JavaScript is running, and plain
 * application/x-www-form-urlencoded when it is not — a browser that has not
 * hydrated yet, or has failed to load the bundle, still submits the <form>.
 *
 * Handling both matters for more than tidiness: a form with no method submits
 * as GET, which puts the password in the URL, in the server log, in browser
 * history and in the Referer header. The forms therefore declare
 * method="post" with an action, and these helpers make that submission work
 * end to end instead of 400-ing.
 */

export type ParsedBody =
  | { ok: true; data: Record<string, unknown>; wantsJson: boolean }
  | { ok: false; response: Response };

export async function parseBody(request: Request): Promise<ParsedBody> {
  const contentType = request.headers.get("content-type") ?? "";

  // A fetch() caller sends JSON and wants JSON back. A native form submission
  // sends form data and wants to be redirected somewhere.
  if (contentType.includes("application/json")) {
    try {
      const data = (await request.json()) as Record<string, unknown>;
      return { ok: true, data, wantsJson: true };
    } catch {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Expected a JSON body." },
          { status: 400 }
        ),
      };
    }
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await request.formData();
    const data: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") data[key] = value;
    }
    return { ok: true, data, wantsJson: false };
  }

  return {
    ok: false,
    response: NextResponse.json(
      { error: "Send JSON or form data." },
      { status: 415 }
    ),
  };
}

/**
 * Where to send a non-JavaScript client after a form submission. Errors go
 * back to the form with a short code in the query string — never the values
 * the user typed.
 */
export function formRedirect(
  request: Request,
  path: string,
  params?: Record<string, string>
): NextResponse {
  const url = new URL(path, request.url);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  // 303 forces the follow-up request to be a GET.
  return NextResponse.redirect(url, 303);
}
