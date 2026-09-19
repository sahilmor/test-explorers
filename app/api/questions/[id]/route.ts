import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { SetupError } from "@/lib/school-setup";
import { deleteQuestion, updateQuestion } from "@/lib/question-bank";
import { fieldErrors, objectIdSchema, questionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const AUTHORS = ["teacher", "admin"] as const;

type Ctx = { params: Promise<{ id: string }> };

/**
 * The id comes from the URL, which is attacker-controlled, so it is only ever
 * used alongside the school filter inside `lib/question-bank`. A question
 * belonging to another school matches nothing and returns 404 — the same
 * answer as an id that exists nowhere.
 */
export const PATCH = withAuth<Ctx>(
  async (request, auth, context) => {
    const { id } = await context.params;
    if (!objectIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "No such question." }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
    }

    const parsed = questionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Some details need fixing.", fields: fieldErrors(parsed.error) },
        { status: 400 }
      );
    }

    try {
      const question = await updateQuestion(auth.schoolId, id, parsed.data);
      return NextResponse.json({ question });
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
      console.error("[/api/questions/[id] PATCH] failed:", error);
      return NextResponse.json({ error: "Could not save that change." }, { status: 500 });
    }
  },
  { roles: AUTHORS }
);

export const DELETE = withAuth<Ctx>(
  async (_request, auth, context) => {
    const { id } = await context.params;
    if (!objectIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "No such question." }, { status: 404 });
    }

    try {
      return NextResponse.json(await deleteQuestion(auth.schoolId, id));
    } catch (error) {
      if (error instanceof SetupError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      console.error("[/api/questions/[id] DELETE] failed:", error);
      return NextResponse.json({ error: "Could not delete that question." }, { status: 500 });
    }
  },
  { roles: AUTHORS }
);
