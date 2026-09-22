import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TeacherResultsScreen } from "@/components/results/teacher-results";
import { requireAnyRole } from "@/lib/auth";
import { getTeacherResults } from "@/lib/results";
import { SetupError } from "@/lib/school-setup";
import { sweepSchool } from "@/lib/sweep";

export const metadata: Metadata = { title: "Results" };
export const dynamic = "force-dynamic";

export default async function TeacherResultsPage({
  params,
}: PageProps<"/teacher/tests/[id]/results">) {
  const session = await requireAnyRole(["teacher", "admin"]);
  const { id } = await params;

  // Close out anyone whose time ran out with their tab shut, so these numbers
  // are not missing a student who simply walked away.
  await sweepSchool(session.schoolId);

  let results;
  try {
    results = await getTeacherResults(session.schoolId, id);
  } catch (error) {
    if (error instanceof SetupError) notFound();
    throw error;
  }

  return <TeacherResultsScreen results={results} />;
}
