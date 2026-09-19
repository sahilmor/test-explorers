import { NextResponse } from "next/server";
import { authenticate } from "@/lib/accounts";
import { HOME_FOR_ROLE, signSessionToken, withSessionCookie } from "@/lib/auth";
import { formRedirect, parseBody } from "@/lib/request-body";
import { fieldErrors, loginSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsedBody = await parseBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const { data, wantsJson } = parsedBody;

  const parsed = loginSchema.safeParse(data);
  if (!parsed.success) {
    if (!wantsJson) return formRedirect(request, "/login", { error: "invalid" });
    return NextResponse.json(
      { error: "Some details need fixing.", fields: fieldErrors(parsed.error) },
      { status: 400 }
    );
  }

  try {
    const user = await authenticate(parsed.data.email, parsed.data.password);

    if (!user) {
      // Deliberately vague: the same answer for an unknown email and a wrong
      // password, so this cannot be used to find out who has an account.
      if (!wantsJson) return formRedirect(request, "/login", { error: "bad" });
      return NextResponse.json(
        { error: "That email and password don't match." },
        { status: 401 }
      );
    }

    const token = await signSessionToken({
      userId: user.userId,
      schoolId: user.schoolId,
      role: user.role,
    });

    const home = HOME_FOR_ROLE[user.role];

    const response = wantsJson
      ? NextResponse.json({
          ok: true,
          user: {
            id: user.userId,
            name: user.name,
            email: user.email,
            role: user.role,
          },
          redirectTo: home,
        })
      : formRedirect(request, home);

    return withSessionCookie(response, token, request);
  } catch (error) {
    console.error("[/api/auth/login] failed:", error);
    if (!wantsJson) return formRedirect(request, "/login", { error: "server" });
    return NextResponse.json(
      { error: "Something broke on our end. Try again in a moment." },
      { status: 500 }
    );
  }
}
