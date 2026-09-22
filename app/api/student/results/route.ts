import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { listStudentResults } from "@/lib/results";

export const dynamic = "force-dynamic";

/** The papers this student has sat that now have results to look at. */
export const GET = withAuth(
  async (_request, auth) => {
    return NextResponse.json({
      results: await listStudentResults(auth.schoolId, auth.userId),
    });
  },
  { roles: ["student"] }
);
