import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { SetupError, createTeacher, listTeachers } from "@/lib/school-setup";
import { createTeacherSchema, fieldErrors } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const GET = withAuth(
  async (request, auth) => {
    // The search term narrows the result; it can never widen it past the
    // school filter, which is applied first inside listTeachers.
    const search = new URL(request.url).searchParams.get("q")?.trim() || undefined;

    return NextResponse.json({
      teachers: await listTeachers(auth.schoolId, { search }),
    });
  },
  { roles: ["admin"] }
);

export const POST = withAuth(
  async (request, auth) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
    }

    const parsed = createTeacherSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Some details need fixing.", fields: fieldErrors(parsed.error) },
        { status: 400 }
      );
    }

    try {
      const teacher = await createTeacher(auth.schoolId, parsed.data);
      // teacher.temporaryPassword is present only when the server generated
      // one. This is the only time it is ever readable.
      return NextResponse.json({ teacher }, { status: 201 });
    } catch (error) {
      if (error instanceof SetupError) {
        return NextResponse.json(
          {
            error: error.message,
            fields: error.field ? { [error.field]: error.message } : undefined,
          },
          { status: error.status }
        );
      }
      console.error("[/api/teachers POST] failed:", error);
      return NextResponse.json({ error: "Could not add that teacher." }, { status: 500 });
    }
  },
  { roles: ["admin"] }
);
