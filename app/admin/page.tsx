import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/data-table";
import { requireRole } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { listSections } from "@/lib/school-setup";
import School from "@/models/School";
import Subject from "@/models/Subject";
import User from "@/models/User";
import { cn } from "cn";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

/**
 * The admin home doubles as the setup checklist. A brand-new school lands
 * here, so it has to say what to do first rather than show four empty counters.
 */
export default async function AdminHome() {
  const session = await requireRole("admin");

  await connectToDatabase();

  // Every query is filtered by the token's schoolId. Nothing here can be
  // pointed at another school.
  const [school, sections, subjectCount, teacherCount, studentCount] =
    await Promise.all([
      School.findById(session.schoolId).select("name plan planValidUntil").lean(),
      listSections(session.schoolId),
      Subject.countDocuments({ schoolId: session.schoolId }),
      User.countDocuments({ schoolId: session.schoolId, role: "teacher" }),
      User.countDocuments({ schoolId: session.schoolId, role: "student" }),
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
      count: studentCount,
      noun: "student",
      tone: "cobalt" as const,
    },
  ];

  const remaining = steps.filter((s) => s.count === 0);
  const nextStep = remaining[0];

  const trialEnds = school?.planValidUntil
    ? new Date(school.planValidUntil).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";

  return (
    <div className="space-y-10">
      <PageHeading
        eyebrow="Admin"
        title={school?.name ?? "Your school"}
        blurb={
          nextStep
            ? "Four steps to a school that's ready to run papers. Here's where you are."
            : "Your school is set up. Question banks and papers arrive in the next phase."
        }
      />

      {nextStep ? (
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
      ) : null}

      <section>
        <h2 className="font-display text-xl font-bold tracking-tight text-ink">
          Setup checklist
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
                      done
                        ? "bg-lime text-ink"
                        : "bg-paper-deep text-ink-soft"
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

      <section className="flex flex-wrap gap-4">
        <div className="min-w-[10rem] flex-1 rounded-xl border-2 border-ink bg-paper-deep px-5 py-4">
          <p className="eyebrow text-ink-soft">Plan</p>
          <p className="mt-1.5 font-display text-lg font-extrabold capitalize text-ink">
            {school?.plan ?? "trial"}
          </p>
        </div>
        <div className="min-w-[10rem] flex-1 rounded-xl border-2 border-ink bg-paper-deep px-5 py-4">
          <p className="eyebrow text-ink-soft">Trial ends</p>
          <p className="mt-1.5 font-display text-lg font-extrabold text-ink">
            {trialEnds}
          </p>
        </div>
        <div className="min-w-[10rem] flex-1 rounded-xl border-2 border-ink bg-paper-deep px-5 py-4">
          <p className="eyebrow text-ink-soft">People</p>
          <p className="mt-1.5 font-display text-lg font-extrabold text-ink">
            {teacherCount + studentCount + 1}
          </p>
        </div>
      </section>
    </div>
  );
}
