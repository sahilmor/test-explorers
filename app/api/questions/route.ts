import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { SetupError } from "@/lib/school-setup";
import {
  DEFAULT_PAGE_SIZE,
  createQuestion,
  listQuestions,
} from "@/lib/question-bank";
import { DIFFICULTIES, type Difficulty } from "@/models/Question";
import { fieldErrors, objectIdSchema, questionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Teachers write the bank; admins oversee it. Students never touch it. */
const AUTHORS = ["teacher", "admin"] as const;

export const GET = withAuth(
  async (request, auth) => {
    const params = new URL(request.url).searchParams;

    // A malformed subjectId is ignored rather than 500-ing on a bad ObjectId.
    // Either way the school filter still applies, so this can only narrow.
    const rawSubject = params.get("subjectId")?.trim();
    const subjectId =
      rawSubject && objectIdSchema.safeParse(rawSubject).success
        ? rawSubject
        : undefined;

    const rawDifficulty = params.get("difficulty")?.trim().toLowerCase();
    const difficulty = (DIFFICULTIES as readonly string[]).includes(
      rawDifficulty ?? ""
    )
      ? (rawDifficulty as Difficulty)
      : undefined;

    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || DEFAULT_PAGE_SIZE;

    return NextResponse.json(
      await listQuestions(auth.schoolId, {
        subjectId,
        difficulty,
        search: params.get("q")?.trim() || undefined,
        page,
        pageSize,
      })
    );
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

    const parsed = questionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Some details need fixing.", fields: fieldErrors(parsed.error) },
        { status: 400 }
      );
    }

    try {
      const question = await createQuestion(auth.schoolId, auth.userId, parsed.data);
      return NextResponse.json({ question }, { status: 201 });
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
      console.error("[/api/questions POST] failed:", error);
      return NextResponse.json({ error: "Could not save that question." }, { status: 500 });
    }
  },
  { roles: AUTHORS }
);
