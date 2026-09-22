import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { SetupError } from "@/lib/school-setup";
import { getTeacherResults } from "@/lib/results";
import { sweepSchool } from "@/lib/sweep";
import { objectIdSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The class's results for one test.
 *
 * Behind the same gate as a student's own result: 403 until the window has
 * closed for everyone. A teacher is not exempt — sections often sit the same
 * paper at different times, and a mark read out early is a mark that can be
 * passed on.
 */
export const GET = withAuth<Ctx>(
  async (_request, auth, context) => {
    const { id } = await context.params;
    if (!objectIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "No such test." }, { status: 404 });
    }

    // Close out anyone whose time ran out with their tab shut, so the numbers
    // on this screen are not missing a student who simply walked away.
    await sweepSchool(auth.schoolId);

    try {
      return NextResponse.json(await getTeacherResults(auth.schoolId, id), {
        headers: { "cache-control": "no-store" },
      });
    } catch (error) {
      if (error instanceof SetupError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      console.error("[/api/tests/[id]/results] failed:", error);
      return NextResponse.json({ error: "Could not load those results." }, { status: 500 });
    }
  },
  { roles: ["teacher", "admin"] }
);
