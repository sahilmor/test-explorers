import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { SetupError } from "@/lib/school-setup";
import { deleteTest, getTest, updateTest } from "@/lib/tests";
import { fieldErrors, objectIdSchema, testSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const AUTHORS = ["teacher", "admin"] as const;

type Ctx = { params: Promise<{ id: string }> };

/**
 * The id comes from the URL, which is attacker-controlled, so it is only ever
 * used alongside the school filter inside `lib/tests`. A test belonging to
 * another school matches nothing and returns 404 — the same answer as an id
 * that exists nowhere.
 */
export const GET = withAuth<Ctx>(
  async (_request, auth, context) => {
    const { id } = await context.params;
    if (!objectIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "No such test." }, { status: 404 });
    }

    try {
      return NextResponse.json({ test: await getTest(auth.schoolId, id) });
    } catch (error) {
      if (error instanceof SetupError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
  },
  { roles: AUTHORS }
);

export const PATCH = withAuth<Ctx>(
  async (request, auth, context) => {
    const { id } = await context.params;
    if (!objectIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "No such test." }, { status: 404 });
    }

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
      const test = await updateTest(auth.schoolId, id, parsed.data);
      return NextResponse.json({ test });
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
      console.error("[/api/tests/[id] PATCH] failed:", error);
      return NextResponse.json({ error: "Could not save that change." }, { status: 500 });
    }
  },
  { roles: AUTHORS }
);

export const DELETE = withAuth<Ctx>(
  async (_request, auth, context) => {
    const { id } = await context.params;
    if (!objectIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "No such test." }, { status: 404 });
    }

    try {
      return NextResponse.json(await deleteTest(auth.schoolId, id));
    } catch (error) {
      if (error instanceof SetupError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      console.error("[/api/tests/[id] DELETE] failed:", error);
      return NextResponse.json({ error: "Could not delete that test." }, { status: 500 });
    }
  },
  { roles: AUTHORS }
);
