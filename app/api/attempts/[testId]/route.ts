import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { SetupError } from "@/lib/school-setup";
import { getAttemptState } from "@/lib/attempts";
import { objectIdSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ testId: string }> };

/**
 * The current state of this student's attempt.
 *
 * Doubles as the timer re-sync: the response carries both `deadlineAt` and
 * `serverNow`, so the client can measure its own clock offset rather than
 * trusting a setInterval that has been drifting for an hour, or a laptop that
 * was asleep.
 */
export const GET = withAuth<Ctx>(
  async (_request, auth, context) => {
    const { testId } = await context.params;
    if (!objectIdSchema.safeParse(testId).success) {
      return NextResponse.json({ error: "No such test." }, { status: 404 });
    }

    try {
      return NextResponse.json(
        await getAttemptState(auth.schoolId, auth.userId, testId),
        { headers: { "cache-control": "no-store" } }
      );
    } catch (error) {
      if (error instanceof SetupError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      console.error("[/api/attempts/[testId]] failed:", error);
      return NextResponse.json({ error: "Could not load that attempt." }, { status: 500 });
    }
  },
  { roles: ["student"] }
);
