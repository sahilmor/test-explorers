import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { SetupError, deleteSubject, updateSubject } from "@/lib/school-setup";
import { fieldErrors, objectIdSchema, subjectSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The id comes from the URL, which is attacker-controlled, so it is only ever
 * used alongside the school filter inside `lib/school-setup`. An id belonging
 * to another school matches nothing and returns 404 — the same answer as an id
 * that exists nowhere.
 */
export const PATCH = withAuth<Ctx>(
  async (request, auth, context) => {
    const { id } = await context.params;
    if (!objectIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "No such subject." }, { status: 404 });
    }

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
      const subject = await updateSubject(auth.schoolId, id, parsed.data);
      return NextResponse.json({ subject });
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
      console.error("[/api/subjects/[id] PATCH] failed:", error);
      return NextResponse.json({ error: "Could not save that change." }, { status: 500 });
    }
  },
  { roles: ["admin"] }
);

export const DELETE = withAuth<Ctx>(
  async (_request, auth, context) => {
    const { id } = await context.params;
    if (!objectIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "No such subject." }, { status: 404 });
    }

    try {
      return NextResponse.json(await deleteSubject(auth.schoolId, id));
    } catch (error) {
      if (error instanceof SetupError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      console.error("[/api/subjects/[id] DELETE] failed:", error);
      return NextResponse.json({ error: "Could not delete that subject." }, { status: 500 });
    }
  },
  { roles: ["admin"] }
);
