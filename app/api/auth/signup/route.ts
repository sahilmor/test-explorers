import { NextResponse } from "next/server";
import { AccountError, createSchoolWithAdmin } from "@/lib/accounts";
import { signSessionToken, withSessionCookie } from "@/lib/auth";
import { formRedirect, parseBody } from "@/lib/request-body";
import { fieldErrors, signupSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsedBody = await parseBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const { data, wantsJson } = parsedBody;

  const parsed = signupSchema.safeParse(data);
  if (!parsed.success) {
    if (!wantsJson) return formRedirect(request, "/signup", { error: "invalid" });
    return NextResponse.json(
      { error: "Some details need fixing.", fields: fieldErrors(parsed.error) },
      { status: 400 }
    );
  }

  try {
    const result = await createSchoolWithAdmin(parsed.data);

    const token = await signSessionToken({
      userId: result.userId,
      schoolId: result.schoolId,
      role: result.role,
    });

    const response = wantsJson
      ? NextResponse.json(
          {
            ok: true,
            school: {
              id: result.schoolId,
              name: result.schoolName,
              slug: result.slug,
            },
            user: {
              id: result.userId,
              name: result.name,
              email: result.email,
              role: result.role,
            },
            redirectTo: "/admin",
          },
          { status: 201 }
        )
      : formRedirect(request, "/admin");

    return withSessionCookie(response, token, request);
  } catch (error) {
    if (error instanceof AccountError) {
      if (!wantsJson) {
        return formRedirect(request, "/signup", { error: "taken" });
      }
      return NextResponse.json(
        {
          error: error.message,
          fields: error.field ? { [error.field]: error.message } : undefined,
        },
        { status: error.status }
      );
    }

    console.error("[/api/auth/signup] failed:", error);
    if (!wantsJson) return formRedirect(request, "/signup", { error: "server" });
    return NextResponse.json(
      { error: "Something broke on our end. Try again in a moment." },
      { status: 500 }
    );
  }
}
