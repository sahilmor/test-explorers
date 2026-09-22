import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { SetupError } from "@/lib/school-setup";
import { getStudentResult } from "@/lib/results";
import { objectIdSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ testId: string }> };

/**
 * A student's own result, including the answer key.
 *
 * Refused with 403 until the test window has closed for everyone — see the
 * note at the top of lib/results.ts. Nothing here can be reached by asking
 * about somebody else: the attempt is resolved from the token's student id.
 */
export const GET = withAuth<Ctx>(
  async (_request, auth, context) => {
    const { testId } = await context.params;
    if (!objectIdSchema.safeParse(testId).success) {
      return NextResponse.json({ error: "No such test." }, { status: 404 });
    }

    try {
      return NextResponse.json(
        await getStudentResult(auth.schoolId, auth.userId, testId),
        { headers: { "cache-control": "no-store" } }
      );
    } catch (error) {
      if (error instanceof SetupError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      console.error("[/api/attempts/[testId]/result] failed:", error);
      return NextResponse.json({ error: "Could not load that result." }, { status: 500 });
    }
  },
  { roles: ["student"] }
);
