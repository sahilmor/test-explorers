import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SittingScreen } from "@/components/sitting/sitting-screen";
import { requireRole } from "@/lib/auth";
import { startOrResumeAttempt } from "@/lib/attempts";
import { SetupError } from "@/lib/school-setup";

export const metadata: Metadata = { title: "Sitting a test" };
export const dynamic = "force-dynamic";

/**
 * Sitting a test.
 *
 * The attempt is created here, on the server, before a single question is
 * rendered — so "started the test but nothing was ever saved" is not a state
 * this app can reach. A refresh, a second tab, or a reopened laptop all call
 * the same function and land on the same attempt.
 */
export default async function SitTestPage({
  params,
}: PageProps<"/student/tests/[id]">) {
  const session = await requireRole("student");
  const { id } = await params;

  // The try/catch wraps the data call only. Building JSX inside it would not
  // catch render errors anyway, and React warns about the pattern.
  let state;
  try {
    state = await startOrResumeAttempt(session.schoolId, session.userId, id);
  } catch (error) {
    if (error instanceof SetupError) {
      // Not assigned, not open yet, already closed, another school's test —
      // all of them are "there is nothing here for you" as far as a student
      // is concerned.
      notFound();
    }
    throw error;
  }

  return <SittingScreen initial={state} />;
}
