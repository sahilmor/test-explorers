import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/app/app-shell";
import { formatWhen } from "@/components/tests/test-bits";
import { requireRole } from "@/lib/auth";
import { listStudentTests } from "@/lib/tests";

export const metadata: Metadata = { title: "Test" };
export const dynamic = "force-dynamic";

/**
 * Placeholder for the sitting screen, which is Phase 5.
 *
 * It is not a stub route: it re-checks that this test is actually assigned to
 * this student's section and actually open right now, so the URL cannot be
 * used to reach a paper early or after it has closed. Phase 5 replaces the
 * body, not the gate.
 */
export default async function SitTestPage({
  params,
}: PageProps<"/student/tests/[id]">) {
  const session = await requireRole("student");
  const { id } = await params;

  const tests = await listStudentTests(session.schoolId, session.userId);
  const test = tests.find((t) => t.id === id);

  // Not assigned to this student, or outside its window.
  if (!test || test.state !== "open") notFound();

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow={test.subjectName ?? "Test"}
        title={test.title}
        blurb={`${test.questionCount} questions · ${test.durationMinutes} minutes · closes ${formatWhen(test.closesAt)}`}
      />

      <div className="rounded-xl border-2 border-ink bg-paper-pure p-8 text-center shadow-[5px_5px_0_var(--ink)]">
        <p className="font-display text-2xl font-bold tracking-tight text-ink">
          The sitting screen lands in the next phase
        </p>
        <p className="mx-auto mt-2 max-w-[46ch] text-sm text-ink-soft">
          One question at a time, answers saved as you go, and a timer you can
          see. For now this page only proves the paper reached you, and that the
          window is open.
        </p>
        <div className="mt-6 flex justify-center">
          <Button variant="outline" render={<Link href="/student">Back to my tests</Link>} />
        </div>
      </div>
    </div>
  );
}
