import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { SetupError, createStudent, listStudents } from "@/lib/school-setup";
import { createStudentSchema, fieldErrors, objectIdSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const GET = withAuth(
  async (request, auth) => {
    const params = new URL(request.url).searchParams;
    const search = params.get("q")?.trim() || undefined;
    const rawSection = params.get("sectionId")?.trim();

    // A malformed sectionId is ignored rather than 500-ing on a bad ObjectId.
    // Either way the school filter still applies, so this can only narrow.
    const sectionId =
      rawSection && objectIdSchema.safeParse(rawSection).success
        ? rawSection
        : undefined;

    return NextResponse.json({
      students: await listStudents(auth.schoolId, { search, sectionId }),
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

    const parsed = createStudentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Some details need fixing.", fields: fieldErrors(parsed.error) },
        { status: 400 }
      );
    }

    try {
      const student = await createStudent(auth.schoolId, parsed.data);
      return NextResponse.json({ student }, { status: 201 });
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
      console.error("[/api/students POST] failed:", error);
      return NextResponse.json({ error: "Could not add that student." }, { status: 500 });
    }
  },
  { roles: ["admin"] }
);
