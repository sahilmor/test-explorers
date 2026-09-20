import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { SetupError } from "@/lib/school-setup";
import { startOrResumeAttempt } from "@/lib/attempts";
import { objectIdSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Start a test, or resume the attempt already running.
 *
 * Safe to call repeatedly: a second tab, a refresh, or a retry all land on the
 * same attempt because of the unique index on { testId, studentId }.
 */
export const POST = withAuth(
  async (request, auth) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
    }

    const testId = (body as { testId?: unknown })?.testId;
    if (typeof testId !== "string" || !objectIdSchema.safeParse(testId).success) {
      return NextResponse.json({ error: "No such test." }, { status: 404 });
    }

    try {
      return NextResponse.json(
        await startOrResumeAttempt(auth.schoolId, auth.userId, testId)
      );
    } catch (error) {
      if (error instanceof SetupError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      console.error("[/api/attempts/start] failed:", error);
      return NextResponse.json({ error: "Could not start that test." }, { status: 500 });
    }
  },
  { roles: ["student"] }
);
