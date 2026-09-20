import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { SetupError } from "@/lib/school-setup";
import { setAssignments } from "@/lib/tests";
import { assignmentSchema, fieldErrors, objectIdSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Replace the set of sections a published test is assigned to.
 *
 * Every section id is checked against the caller's school before anything is
 * written, and a draft is refused outright — assigning an unpublished paper to
 * a class is the mistake this endpoint exists to prevent.
 */
export const PUT = withAuth<Ctx>(
  async (request, auth, context) => {
    const { id } = await context.params;
    if (!objectIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "No such test." }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
    }

    const parsed = assignmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Some details need fixing.", fields: fieldErrors(parsed.error) },
        { status: 400 }
      );
    }

    try {
      const test = await setAssignments(auth.schoolId, id, parsed.data.sectionIds);
      return NextResponse.json({ test });
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
      console.error("[/api/tests/[id]/assignments PUT] failed:", error);
      return NextResponse.json({ error: "Could not save those sections." }, { status: 500 });
    }
  },
  { roles: ["teacher", "admin"] }
);
