import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/app/app-shell";
import { NavCard } from "@/components/app/nav-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/data-table";
import { TestStateBadge, formatWhen } from "@/components/tests/test-bits";
import { requireRole } from "@/lib/auth";
import { questionCountsBySubject } from "@/lib/question-bank";
import { sweepSchool } from "@/lib/sweep";
import { listTests, type TestRow } from "@/lib/tests";
import { humanGap } from "@/lib/tests-shared";

export const metadata: Metadata = { title: "Teacher" };
export const dynamic = "force-dynamic";

/** How many recent papers to show before sending them to the full list. */
const RECENT = 5;

export default async function TeacherHome() {
  // The layout lets admins into /teacher so they can reach the question bank.
  // This page is a teacher's own view, so it narrows the gate back down —
  // an admin who lands here is sent to /admin.
  const session = await requireRole("teacher");

  // Close out any attempt whose deadline passed with its tab shut, so a paper
  // listed as closed below really has its marks waiting behind it.
  await sweepSchool(session.schoolId);

  const [tests, bank] = await Promise.all([
    listTests(session.schoolId),
    questionCountsBySubject(session.schoolId),
  ]);

  const open = tests.filter((t) => t.state === "open");
  const closed = tests.filter((t) => t.state === "closed");
  const drafts = tests.filter((t) => t.state === "draft");
  const questionCount = bank.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="space-y-12">
      <PageHeading
        eyebrow="Teacher"
        title={
          open.length > 0
            ? `${open.length} paper${open.length === 1 ? "" : "s"} being sat right now`
            : tests.length === 0
              ? "No papers yet"
              : "Nothing open right now"
        }
        blurb="Your question bank, the papers built from it, and what the class made of them once each one closes."
      />

      <section className="grid gap-5 md:grid-cols-3">
        <h2 className="sr-only">Where to go</h2>

        <NavCard
          href="/teacher/tests"
          tone="coral"
          title="Write a paper"
          body="Pull questions from the bank, set a duration and a window, pick the classes sitting it."
          meta={
            tests.length === 0
              ? "Nothing set yet"
              : `${tests.length} paper${tests.length === 1 ? "" : "s"}${
                  drafts.length > 0 ? ` · ${drafts.length} still draft` : ""
                }`
          }
        />

        <NavCard
          href="/teacher/question-bank"
          tone="lime"
          title="Question bank"
          body="Add questions one at a time or by CSV, with a diagram where one helps. Papers are built from here."
          meta={
            questionCount === 0
              ? "Empty — start here"
              : `${questionCount} question${questionCount === 1 ? "" : "s"} across ${bank.length} subject${bank.length === 1 ? "" : "s"}`
          }
        />

        <NavCard
          href="/teacher/tests"
          tone="cobalt"
          title="Marking"
          body="Every paper is marked the moment it is handed in. Open a closed paper to see which questions the class struggled with."
          meta={
            closed.length === 0
              ? "Nothing closed yet"
              : `${closed.length} paper${closed.length === 1 ? "" : "s"} ready to read`
          }
        />
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-bold tracking-tight text-ink">
            Recent papers
          </h2>
          {tests.length > RECENT ? (
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/teacher/tests">See all {tests.length}</Link>}
            />
          ) : null}
        </div>

        {tests.length === 0 ? (
          <EmptyState
            className="mt-5"
            tone="coral"
            title="No papers yet"
            body={
              questionCount === 0
                ? "A paper is built from the question bank, and yours is empty — so that is the first stop."
                : "You have questions waiting in the bank. Turn some of them into a paper and set it for a class."
            }
            action={
              <Button
                render={
                  <Link href={questionCount === 0 ? "/teacher/question-bank" : "/teacher/tests"}>
                    {questionCount === 0 ? "Fill the question bank" : "Write your first paper"}
                  </Link>
                }
              />
            }
          />
        ) : (
          <ul className="mt-5 space-y-3">
            {tests.slice(0, RECENT).map((test) => (
              <PaperRow key={test.id} test={test} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * One paper, with the one action that makes sense for the state it is in.
 *
 * Results are only linked once a paper has closed, because that is the only
 * point at which there is anything to see — marks stay sealed until the
 * window shuts for everyone, this teacher included.
 */
function PaperRow({ test }: { test: TestRow }) {
  const now = new Date();

  const when =
    test.state === "open"
      ? `closes in ${humanGap(now, test.closesAt)}`
      : test.state === "scheduled"
        ? `opens in ${humanGap(now, test.opensAt)}`
        : test.state === "closed"
          ? `closed ${formatWhen(test.closesAt)}`
          : "not set for anyone yet";

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border-2 border-ink bg-paper-pure p-4 shadow-[4px_4px_0_var(--ink)]">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-display font-bold text-ink">{test.title}</span>
          <TestStateBadge state={test.state} />
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-2">
          <Pill tone="cobalt">{test.subjectName ?? "No subject"}</Pill>
          <span className="text-xs text-ink-soft">
            {test.questionCount} question{test.questionCount === 1 ? "" : "s"} ·{" "}
            {test.durationMinutes} minutes · {when}
          </span>
        </p>
      </div>

      {test.state === "closed" ? (
        <Button
          size="sm"
          render={<Link href={`/teacher/tests/${test.id}/results`}>Results</Link>}
        />
      ) : (
        <span className="text-xs text-ink-faint">
          {test.state === "draft" ? "Not published" : "Results once it closes"}
        </span>
      )}
    </li>
  );
}
