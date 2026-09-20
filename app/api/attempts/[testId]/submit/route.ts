import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { SetupError } from "@/lib/school-setup";
import { submitAttempt } from "@/lib/attempts";
import { objectIdSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ testId: string }> };

/**
 * Hand the paper in.
 *
 * Idempotent: submitting an already-submitted attempt returns the existing
 * result rather than an error, so a double-click or a retry lands on the
 * confirmation screen instead of a failure.
 */
export const POST = withAuth<Ctx>(
  async (_request, auth, context) => {
    const { testId } = await context.params;
    if (!objectIdSchema.safeParse(testId).success) {
      return NextResponse.json({ error: "No such test." }, { status: 404 });
    }

    try {
      return NextResponse.json(
        await submitAttempt(auth.schoolId, auth.userId, testId),
        { headers: { "cache-control": "no-store" } }
      );
    } catch (error) {
      if (error instanceof SetupError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      console.error("[/api/attempts/[testId]/submit] failed:", error);
      return NextResponse.json({ error: "Could not submit that attempt." }, { status: 500 });
    }
  },
  { roles: ["student"] }
);
