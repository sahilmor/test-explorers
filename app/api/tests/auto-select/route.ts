import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { SetupError } from "@/lib/school-setup";
import { autoSelectQuestions } from "@/lib/tests";
import { autoSelectSchema, fieldErrors } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * "Pick N random questions from this subject."
 *
 * Returns what it found plus how many exist, so the caller can say "you asked
 * for 20 and the bank holds 18" rather than silently producing a short paper.
 */
export const POST = withAuth(
  async (request, auth) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
    }

    const parsed = autoSelectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Some details need fixing.", fields: fieldErrors(parsed.error) },
        { status: 400 }
      );
    }

    try {
      return NextResponse.json(
        await autoSelectQuestions(
          auth.schoolId,
          parsed.data.subjectId,
          parsed.data.count,
          parsed.data.difficulty
        )
      );
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
      console.error("[/api/tests/auto-select] failed:", error);
      return NextResponse.json({ error: "Could not pick questions." }, { status: 500 });
    }
  },
  { roles: ["teacher", "admin"] }
);
