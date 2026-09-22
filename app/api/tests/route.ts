import { NextResponse, after } from "next/server";
import { withAuth } from "@/lib/auth";
import { SetupError } from "@/lib/school-setup";
import { setupErrorResponse } from "@/lib/api-response";
import { createTest, listTests } from "@/lib/tests";
import { notifyTestAssigned } from "@/lib/notifications";
import { sweepSchool } from "@/lib/sweep";
import { fieldErrors, testSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Teachers set papers; admins oversee them. Students never touch this. */
const AUTHORS = ["teacher", "admin"] as const;

export const GET = withAuth(
  async (_request, auth) => {
    await sweepSchool(auth.schoolId);
    return NextResponse.json({ tests: await listTests(auth.schoolId) });
  },
  { roles: AUTHORS }
);

export const POST = withAuth(
  async (request, auth) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
    }

    const parsed = testSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Some details need fixing.", fields: fieldErrors(parsed.error) },
        { status: 400 }
      );
    }

    try {
      const test = await createTest(auth.schoolId, auth.userId, parsed.data);

      // A draft is not assigned to anyone, so there is nobody to tell yet.
      // notifyTestAssigned re-checks that itself; this just avoids the call.
      if (test.state !== "draft") announce(auth.schoolId, test.id);
      return NextResponse.json({ test }, { status: 201 });
    } catch (error) {
      if (error instanceof SetupError) {
        return setupErrorResponse(error);
      }
      console.error("[/api/tests POST] failed:", error);
      return NextResponse.json({ error: "Could not save that test." }, { status: 500 });
    }
  },
  { roles: AUTHORS }
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
