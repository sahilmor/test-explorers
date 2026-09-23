import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { setupErrorResponse } from "@/lib/api-response";
import { SetupError } from "@/lib/errors";
import { recordViolation } from "@/lib/attempts";
import { VIOLATION_KINDS } from "@/lib/attempts-shared";
import { objectIdSchema } from "@/lib/validation";
import { z } from "zod";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ testId: string }> };

const bodySchema = z.object({ kind: z.enum(VIOLATION_KINDS) });

/**
 * "I left the test screen."
 *
 * The browser reports; the server decides. The count lives in the database, so
 * refreshing does not hand warnings back, and the third one submits the paper
 * through the ordinary grading path rather than a special one.
 *
 * Reachable only by the student whose attempt it is: the attempt is resolved
 * from `{ testId, studentId }` where the student id comes off the token, so
 * there is no attempt id to guess and nobody else's warnings to spend.
 */
export const POST = withAuth<Ctx>(
  async (request, auth, context) => {
    const { testId } = await context.params;
    if (!objectIdSchema.safeParse(testId).success) {
      return NextResponse.json({ error: "No such test." }, { status: 404 });
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Unknown violation kind." }, { status: 400 });
    }

    try {
      return NextResponse.json(
        await recordViolation(auth.schoolId, auth.userId, testId, parsed.data.kind)
      );
    } catch (error) {
      if (error instanceof SetupError) return setupErrorResponse(error);
      console.error("[/api/attempts/[testId]/violation] failed:", error);
      return NextResponse.json({ error: "Could not record that." }, { status: 500 });
    }
  },
  { roles: ["student"] }
);
