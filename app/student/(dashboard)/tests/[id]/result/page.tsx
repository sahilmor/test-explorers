import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StudentResultScreen } from "@/components/results/student-result";
import { requireRole } from "@/lib/auth";
import { getStudentResult } from "@/lib/results";
import { SetupError } from "@/lib/school-setup";

export const metadata: Metadata = { title: "Result" };
export const dynamic = "force-dynamic";

/**
 * A student's result.
 *
 * `getStudentResult` refuses until the test has closed for everyone, so a fast
 * finisher cannot read the answer key while classmates are still sitting. The
 * refusal is shown as a plain explanation rather than an error page — "not
 * yet" and "you didn't sit this" are ordinary situations, not failures.
 */
export default async function ResultPage({
  params,
}: PageProps<"/student/tests/[id]/result">) {
  const session = await requireRole("student");
  const { id } = await params;

  let result;
  try {
    result = await getStudentResult(session.schoolId, session.userId, id);
  } catch (error) {
    if (error instanceof SetupError) {
      return <NotYet message={error.message} />;
    }
    throw error;
  }

  return <StudentResultScreen result={result} />;
}

function NotYet({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border-2 border-ink bg-paper-pure p-8 text-center shadow-[5px_5px_0_var(--ink)]">
      <p className="font-display text-xl font-bold tracking-tight text-ink">
        Nothing to show yet
      </p>
      <p className="mx-auto mt-2 max-w-[42ch] text-sm text-ink-soft">{message}</p>
      <div className="mt-6">
        <Button variant="outline" render={<Link href="/student">Back to my tests</Link>} />
      </div>
    </div>
  );
}
