import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { getSectionLeaderboard } from "@/lib/results";

export const dynamic = "force-dynamic";

/**
 * Cumulative standing inside the student's own section.
 *
 * No parameters: the section comes from the signed-in student's record, so
 * there is no other class to ask about.
 */
export const GET = withAuth(
  async (_request, auth) => {
    return NextResponse.json(
      await getSectionLeaderboard(auth.schoolId, auth.userId),
      { headers: { "cache-control": "no-store" } }
    );
  },
  { roles: ["student"] }
);
