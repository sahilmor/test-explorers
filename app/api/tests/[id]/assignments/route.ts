import { NextResponse, after } from "next/server";
import { withAuth } from "@/lib/auth";
import { SetupError } from "@/lib/school-setup";
import { setAssignments } from "@/lib/tests";
import { notifyTestAssigned } from "@/lib/notifications";
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

      // Students already told about this paper are not told again — the
      // claim is per student, so only a newly added section hears about it.
      announce(auth.schoolId, id);
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

/**
 * Mails the class once the response has gone out.
 *
 * Deliberately not inside `createTest`/`setAssignments`: those are the things
 * that must succeed, and an email has no business sitting in their path. If
 * the scheduling itself is unavailable the send runs inline, and
 * `notifyTestAssigned` throws nothing either way.
 */
function announce(schoolId: string, testId: string) {
  const run = async () => {
    const summary = await notifyTestAssigned(schoolId, testId);
    if (summary.sent > 0) {
      console.log(`[notify] told ${summary.sent} student(s) about test ${testId}`);
    }
  };

  try {
    after(run);
  } catch {
    void run();
  }
}
