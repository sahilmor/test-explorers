import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { SetupError } from "@/lib/school-setup";
import { saveResponses } from "@/lib/attempts";
import { fieldErrors, objectIdSchema, saveResponsesSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ testId: string }> };

/**
 * The autosave endpoint.
 *
 * Takes a batch and is idempotent by question id, which is what makes a retry
 * after a dropped connection safe — replaying the same answers changes
 * nothing. The response carries the server's clock so every save doubles as a
 * timer re-sync.
 */
export const PATCH = withAuth<Ctx>(
  async (request, auth, context) => {
    const { testId } = await context.params;
    if (!objectIdSchema.safeParse(testId).success) {
      return NextResponse.json({ error: "No such test." }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
    }

    const parsed = saveResponsesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "That answer couldn't be read.", fields: fieldErrors(parsed.error) },
        { status: 400 }
      );
    }

    try {
      const result = await saveResponses(
        auth.schoolId,
        auth.userId,
        testId,
        parsed.data.responses
      );

      // A save that arrived after the deadline is reported as such rather
      // than pretending it was stored.
      return NextResponse.json(result, {
        status: result.expired ? 409 : 200,
        headers: { "cache-control": "no-store" },
      });
    } catch (error) {
      if (error instanceof SetupError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      console.error("[/api/attempts/[testId]/responses] failed:", error);
      return NextResponse.json({ error: "Could not save that answer." }, { status: 500 });
    }
  },
  { roles: ["student"] }
);
