import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { MyTests } from "@/components/tests/my-tests";
import { LeaderboardPanel } from "@/components/results/leaderboard";
import { Pill } from "@/components/ui/data-table";
import { requireRole } from "@/lib/auth";
import { getSectionLeaderboard, listStudentResults } from "@/lib/results";
import { sweepSchool } from "@/lib/sweep";
import { listStudentTests } from "@/lib/tests";

export const metadata: Metadata = { title: "Student" };
export const dynamic = "force-dynamic";

export default async function StudentHome() {
  const session = await requireRole("student");

  // Close out any attempt in this school whose deadline passed while its
  // tab was shut, before showing this student their own list.
  await sweepSchool(session.schoolId);

  // All three come from the verified token and the student's own record —
  // there is no parameter to ask about another class.
  const [tests, results, leaderboard] = await Promise.all([
    listStudentTests(session.schoolId, session.userId),
    listStudentResults(session.schoolId, session.userId),
    getSectionLeaderboard(session.schoolId, session.userId),
  ]);

  const open = tests.filter((t) => t.state === "open").length;

  return (
    <div className="space-y-12">
      <PageHeading
        eyebrow="Student"
        title={
          open > 0
            ? `${open} test${open === 1 ? "" : "s"} waiting for you`
            : "Nothing due. Enjoy it."
        }
        blurb="Papers your teachers set for your class, with the time you have left to sit them."
      />

      <section>
        <h2 className="sr-only">My tests</h2>
        <MyTests
          initial={tests.map((t) => ({
            id: t.id,
            title: t.title,
            subjectName: t.subjectName,
            durationMinutes: t.durationMinutes,
            questionCount: t.questionCount,
            opensAt: t.opensAt.toISOString(),
            closesAt: t.closesAt.toISOString(),
            state: t.state,
          }))}
        />
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* ---- results ---- */}
        <section>
          <h2 className="font-display text-xl font-bold tracking-tight text-ink">
            Your results
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Marks appear once a test has closed for everyone.
          </p>

          {results.length === 0 ? (
            <div className="mt-4 rounded-xl border-2 border-dashed border-ink/40 bg-paper-deep/50 px-5 py-8 text-center">
              <p className="font-display font-bold text-ink">No results yet</p>
              <p className="mx-auto mt-1 max-w-[40ch] text-sm text-ink-soft">
                Sit a test and your mark shows up here once its window shuts.
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {results.map((r) => (
                <li key={r.testId}>
                  <Link
                    href={`/student/tests/${r.testId}/result`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border-2 border-ink bg-paper-pure p-4 shadow-[4px_4px_0_var(--ink)] transition-all duration-150 ease-[var(--ease-snap)] hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[6px_6px_0_var(--ink)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cobalt/40 motion-reduce:transform-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-display font-bold text-ink">
                        {r.title}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        <Pill tone="cobalt">{r.subjectName ?? "Test"}</Pill>
                        {r.status === "auto_submitted" ? (
                          <span className="text-xs text-ink-soft">
                            auto-submitted
                          </span>
                        ) : null}
                      </span>
                    </span>

                    <span className="text-right">
                      <span className="block font-display text-xl font-extrabold tabular-nums text-ink">
                        {r.score}/{r.totalQuestions}
                      </span>
                      <span className="block text-xs text-ink-soft">
                        {r.percentage}%
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---- leaderboard ---- */}
        <section>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-bold tracking-tight text-ink">
              Class standings
            </h2>
            {leaderboard.rows.length > 5 ? (
              <Button
                variant="ghost"
                size="sm"
                render={<Link href="/student/leaderboard">See all</Link>}
              />
            ) : null}
          </div>

          <div className="mt-4">
            <LeaderboardPanel data={leaderboard} limit={5} compact />
          </div>
        </section>
      </div>
    </div>
  );
}
