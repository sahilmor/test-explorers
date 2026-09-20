import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { listStudentTests } from "@/lib/tests";
import { sweepSchool } from "@/lib/sweep";

export const dynamic = "force-dynamic";

/**
 * The student's own list.
 *
 * Both the school and the section come from the signed-in user's own record,
 * looked up by the token's ids — a student cannot ask for another section's
 * tests because there is no parameter to ask with.
 */
export const GET = withAuth(
  async (_request, auth) => {
    // Close out anyone in this school whose time ran out while their tab was
    // shut. Cheap, scoped and capped — see lib/sweep.ts.
    await sweepSchool(auth.schoolId);

    return NextResponse.json({
      tests: await listStudentTests(auth.schoolId, auth.userId),
    });
  },
  { roles: ["student"] }
);
