import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/app/app-shell";
import { NavCard } from "@/components/app/nav-card";
import { PlanBanner } from "@/components/billing/plan-banner";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/data-table";
import { Stat } from "@/components/results/result-bits";
import { requireRole } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { getAdminStats } from "@/lib/dashboard";
import { getEntitlement } from "@/lib/entitlements";
import { listSections } from "@/lib/school-setup";
import { sweepSchool } from "@/lib/sweep";
import Subject from "@/models/Subject";
import User from "@/models/User";
import { cn } from "cn";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

/**
 * The admin overview.
 *
 * Two jobs, and which one leads depends on where the school is. A brand-new
 * school has nothing to count, so the setup checklist comes first and the
 * stats would only be four zeroes. Once it is running, the numbers lead and
 * the checklist drops away.
 *
 * Every figure below is a query in lib/dashboard.ts, and every one carries the
 * sentence that defines it. Nothing here is illustrative.
 */
export default async function AdminHome() {
  const session = await requireRole("admin");

  await connectToDatabase();

  // So "open right now" does not include a paper whose deadline quietly passed.
  await sweepSchool(session.schoolId);

  const [entitlement, stats, sections, subjectCount, teacherCount] =
    await Promise.all([
      getEntitlement(session.schoolId),
      getAdminStats(session.schoolId),
      listSections(session.schoolId),
      Subject.countDocuments({ schoolId: session.schoolId }),
      User.countDocuments({ schoolId: session.schoolId, role: "teacher" }),
    ]);

  const steps = [
    {
      href: "/admin/sections",
      label: "Create your sections",
      blurb: "The classes students sit in. Everything else hangs off these.",
      count: sections.length,
      noun: "section",
      tone: "lime" as const,
    },
    {
      href: "/admin/subjects",
      label: "Add your subjects",
      blurb: "What gets taught, and later what papers get written for.",
      count: subjectCount,
      noun: "subject",
      tone: "coral" as const,
    },
    {
      href: "/admin/teachers",
      label: "Invite your teachers",
      blurb: "Assign each one the subjects and sections they teach.",
      count: teacherCount,
      noun: "teacher",
      tone: "lime" as const,
    },
    {
      href: "/admin/students",
      label: "Import your students",
      blurb: "A CSV with name, email and section does a whole year group at once.",
      count: entitlement.studentCount,
      noun: "student",
      tone: "cobalt" as const,
    },
  ];

  const nextStep = steps.find((s) => s.count === 0);
  const setUp = !nextStep;

  return (
    <div className="space-y-10">
      <PageHeading
        eyebrow="Admin"
        title={entitlement.schoolName}
        blurb={
          setUp
            ? "What's happening across your school right now."
            : "Four steps to a school that's ready to run papers. Here's where you are."
        }
      />

      <PlanBanner entitlement={entitlement} />

      {setUp ? (
        <section>
          <h2 className="sr-only">This school at a glance</h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Tests conducted"
              value={stats.testsConducted}
              hint="closed papers that someone sat"
            />
            <Stat
              label="Open right now"
              value={stats.openNow}
              tone={stats.openNow > 0 ? "correct" : "paper"}
              hint={stats.openNow > 0 ? "being sat as you read this" : "nothing live"}
            />
            <Stat
              label={`Next ${stats.upcomingWindowDays} days`}
              value={stats.upcoming}
              hint="papers scheduled to open"
            />
            <Stat
              label="Active students"
              value={stats.activeStudents}
              hint={`of ${stats.studentsOnRoll} on the roll have sat a paper`}
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <StudentCapCard
              studentCount={entitlement.studentCount}
              maxStudents={entitlement.maxStudents}
            />

            <NavCard
              href="/admin/billing"
              tone="cobalt"
              title="Plan and billing"
              body="What you're on, what it covers, and every payment you've made."
              meta={
                entitlement.plan === "active"
                  ? `Active · renews in ${entitlement.daysRemaining} days`
                  : entitlement.plan === "trial"
                    ? `Trial · ${entitlement.daysRemaining} days left`
                    : "Expired · renew to continue"
              }
            />
          </div>
        </section>
      ) : (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-xl border-2 border-ink bg-lime px-5 py-5 shadow-[5px_5px_0_var(--ink)]">
          <div className="min-w-0 flex-1">
            <p className="eyebrow text-ink/70">Next up</p>
            <p className="mt-1.5 font-display text-xl font-extrabold tracking-tight text-ink">
              {nextStep.label}
            </p>
            <p className="mt-1 text-sm text-ink/80">{nextStep.blurb}</p>
          </div>
          <Button
            variant="ink"
            size="lg"
            render={<Link href={nextStep.href}>Let&apos;s go</Link>}
          />
        </div>
      )}

      <section>
        <h2 className="font-display text-xl font-bold tracking-tight text-ink">
          {setUp ? "Your school" : "Setup checklist"}
        </h2>

        <ol className="mt-5 grid gap-4 sm:grid-cols-2">
          {steps.map((step, index) => {
            const done = step.count > 0;

            return (
              <li key={step.href}>
                <Link
                  href={step.href}
                  className={cn(
                    "group flex h-full gap-4 rounded-xl border-2 border-ink bg-paper-pure p-5",
                    "shadow-[4px_4px_0_var(--ink)] transition-all duration-150 ease-[var(--ease-snap)]",
                    "hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[6px_6px_0_var(--ink)]",
                    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cobalt/40",
                    "motion-reduce:transform-none"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-full border-2 border-ink font-display text-sm font-extrabold",
                      done ? "bg-lime text-ink" : "bg-paper-deep text-ink-soft"
                    )}
                  >
                    {done ? "✓" : index + 1}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-display font-bold text-ink">
                        {step.label}
                      </span>
                      {done ? (
                        <Pill tone={step.tone}>
                          {step.count} {step.noun}
                          {step.count === 1 ? "" : "s"}
                        </Pill>
                      ) : (
                        <Pill>Not started</Pill>
                      )}
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-ink-soft">
                      {step.blurb}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

/**
 * The student cap as a bar.
 *
 * Shown always rather than only when close, because the number that stops an
 * import at 3pm on a Tuesday should not be a surprise.
 */
function StudentCapCard({
  studentCount,
  maxStudents,
}: {
  studentCount: number;
  maxStudents: number;
}) {
  const pct =
    maxStudents > 0 ? Math.min(100, Math.round((studentCount / maxStudents) * 100)) : 0;
  const full = studentCount >= maxStudents;

  return (
    <div className="rounded-xl border-2 border-ink bg-paper-pure p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="eyebrow text-ink-soft">Students on your plan</p>
        <p className="font-display text-sm font-bold text-ink tabular-nums">
          {studentCount} / {maxStudents}
        </p>
      </div>

      <div
        className="mt-3 h-3.5 w-full overflow-hidden rounded-full border-2 border-ink bg-paper-deep"
        role="img"
        aria-label={`${studentCount} of ${maxStudents} student places used`}
      >
        <div
          className={cn(
            "h-full transition-[width] duration-500 motion-reduce:transition-none",
            full ? "bg-coral" : pct >= 80 ? "bg-[#FFC93D]" : "bg-lime"
          )}
          style={{ width: `${Math.max(pct, studentCount > 0 ? 4 : 0)}%` }}
        />
      </div>

      <p className="mt-2.5 text-sm text-ink-soft">
        {full
          ? "You're at the cap — upgrading raises it."
          : `${maxStudents - studentCount} place${maxStudents - studentCount === 1 ? "" : "s"} left.`}
      </p>
    </div>
  );
}
