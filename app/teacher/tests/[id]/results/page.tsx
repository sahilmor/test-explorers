import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TeacherResultsScreen } from "@/components/results/teacher-results";
import { AdminHeader } from "@/components/admin/admin-page";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatWhen } from "@/components/tests/test-bits";
import { requireAnyRole } from "@/lib/auth";
import { getTeacherResults, teacherResultsAvailability } from "@/lib/results";
import { SetupError } from "@/lib/school-setup";
import { sweepSchool } from "@/lib/sweep";
import { humanGap } from "@/lib/tests-shared";

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

  // Asked before the results themselves, so a paper that is still open gets a
  // screen explaining when it unlocks rather than an error page.
  const availability = await teacherResultsAvailability(session.schoolId, id);
  if (!availability.available) {
    if (!availability.found) notFound();
    return <SealedResults {...availability} />;
  }

  let results;
  try {
    results = await getTeacherResults(session.schoolId, id);
  } catch (error) {
    if (error instanceof SetupError) notFound();
    throw error;
  }

  return <TeacherResultsScreen results={results} />;
}

/**
 * Results exist for this paper — they were worked out the moment each student
 * handed in — but nobody sees them until the window shuts for everyone.
 */
function SealedResults({
  title,
  subjectName,
  closesAt,
}: {
  title: string;
  subjectName: string | null;
  closesAt: Date;
}) {
  return (
    <div className="space-y-10">
      <AdminHeader
        eyebrow={subjectName ?? "Results"}
        title={title}
        blurb="Marking is already done. It stays sealed until the paper closes."
        action={
          <Button variant="outline" render={<Link href="/teacher/tests">All tests</Link>} />
        }
      />

      <EmptyState
        tone="cobalt"
        title="Sealed until the paper closes"
        body={`This paper is still open, so nobody sees a mark yet — not the class, not you. Every paper handed in has already been marked and is waiting here. Results unlock in ${humanGap(new Date(), new Date(closesAt))}, at ${formatWhen(closesAt)}.`}
        hint="Closing the paper early in its settings releases them straight away."
      />
    </div>
  );
}
