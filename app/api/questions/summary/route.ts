import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { questionCountsBySubject } from "@/lib/question-bank";

export const dynamic = "force-dynamic";

/**
 * How many questions each subject has, zeroes included — the zeroes are the
 * point, since they show a teacher where the bank is thin.
 */
export const GET = withAuth(
  async (_request, auth) => {
    return NextResponse.json({
      subjects: await questionCountsBySubject(auth.schoolId),
    });
  },
  { roles: ["teacher", "admin"] }
);
