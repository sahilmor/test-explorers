import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { SetupError } from "@/lib/school-setup";
import { setupErrorResponse } from "@/lib/api-response";
import { createTest, listTests } from "@/lib/tests";
import { sweepSchool } from "@/lib/sweep";
import { fieldErrors, testSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Teachers set papers; admins oversee them. Students never touch this. */
const AUTHORS = ["teacher", "admin"] as const;

export const GET = withAuth(
  async (_request, auth) => {
    await sweepSchool(auth.schoolId);
    return NextResponse.json({ tests: await listTests(auth.schoolId) });
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

    const parsed = testSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Some details need fixing.", fields: fieldErrors(parsed.error) },
        { status: 400 }
      );
    }

    try {
      const test = await createTest(auth.schoolId, auth.userId, parsed.data);
      return NextResponse.json({ test }, { status: 201 });
    } catch (error) {
      if (error instanceof SetupError) {
        return setupErrorResponse(error);
      }
      console.error("[/api/tests POST] failed:", error);
      return NextResponse.json({ error: "Could not save that test." }, { status: 500 });
    }
  },
  { roles: AUTHORS }
);
