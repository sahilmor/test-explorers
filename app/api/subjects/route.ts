import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { SetupError, createSubject, listSubjects } from "@/lib/school-setup";
import { fieldErrors, subjectSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const GET = withAuth(
  async (_request, auth) => {
    return NextResponse.json({ subjects: await listSubjects(auth.schoolId) });
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

    const parsed = subjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Some details need fixing.", fields: fieldErrors(parsed.error) },
        { status: 400 }
      );
    }

    try {
      const subject = await createSubject(auth.schoolId, parsed.data);
      return NextResponse.json({ subject }, { status: 201 });
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
      console.error("[/api/subjects POST] failed:", error);
      return NextResponse.json({ error: "Could not create that subject." }, { status: 500 });
    }
  },
  { roles: ["admin"] }
);
