import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SittingScreen } from "@/components/sitting/sitting-screen";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { startOrResumeAttempt } from "@/lib/attempts";
import { PlanError } from "@/lib/entitlements";
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
    // A lapsed school plan is the one refusal a student deserves an
    // explanation for. It is not their doing and there is nothing wrong with
    // the link they followed, so 404ing them would be both wrong and rude.
    if (error instanceof PlanError) {
      return <PlanClosed message={error.message} />;
    }
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

/**
 * Shown when the school's plan stops a new sitting.
 *
 * Same route group as the paper itself, so there is still no app chrome —
 * just the reason and the way back. Anything already submitted is untouched,
 * and the copy says so, because that is the first thing a student will worry
 * about.
 */
function PlanClosed({ message }: { message: string }) {
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-16">
      <div className="w-full max-w-lg rounded-xl border-2 border-ink bg-paper-pure p-7 text-center shadow-[5px_5px_0_var(--ink)] sm:p-9">
        <p className="eyebrow text-coral">Can&apos;t start this one</p>
        <h1 className="mt-3 font-display text-2xl font-extrabold tracking-tight text-ink">
          This paper isn&apos;t open to start
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">{message}</p>

        <div className="mt-7 flex justify-center">
          <Button variant="outline" render={<Link href="/student">Back to my tests</Link>} />
        </div>
      </div>
    </main>
  );
}
