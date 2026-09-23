import type { Metadata } from "next";
import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { PublicShell } from "@/components/marketing/public-shell";
import { Button } from "@/components/ui/button";
import {
  ANNUAL_PLAN,
  TRIAL_DAYS,
  TRIAL_MAX_STUDENTS,
  formatPaise,
} from "@/lib/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description: `One plan: ${formatPaise(ANNUAL_PLAN.amountPaise)} per school per year, up to ${ANNUAL_PLAN.maxStudents} students. No per-teacher charge and no per-paper charge. Start with a ${TRIAL_DAYS}-day free trial.`,
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "TestManager pricing — one plan, one price",
    description: `${formatPaise(ANNUAL_PLAN.amountPaise)} per school per year, up to ${ANNUAL_PLAN.maxStudents} students. ${TRIAL_DAYS}-day free trial, no card needed.`,
    url: "/pricing",
    siteName: "TestManager",
    type: "website",
  },
};

/**
 * Public pricing.
 *
 * Kept public deliberately even though buying is now sales-led: a school
 * deciding whether to ask still needs to know roughly what it costs, and a
 * pricing page that says "contact us" wastes everybody's afternoon.
 *
 * Every number is imported from lib/plans.ts — the same module the
 * enforcement reads and, if self-serve is ever switched back on, the checkout
 * charges from. A published price that has drifted from the enforced one is
 * an argument waiting to happen.
 */
export default function PricingPage() {
  const included = [
    `Up to ${ANNUAL_PLAN.maxStudents} students`,
    "Unlimited papers, questions and sittings",
    "Unlimited teacher and admin accounts",
    "The question bank, with CSV import and diagrams",
    "Scheduled papers assigned per class",
    "Autosaving exam screen with server-owned timing",
    "Automatic marking the moment a paper is handed in",
    "Per-question class analysis, worst-first",
    "Section leaderboards across every closed paper",
    "Email notifications for assignments and results",
  ];

  const trial = [
    `${TRIAL_DAYS} days`,
    `Up to ${TRIAL_MAX_STUDENTS} students`,
    "Every feature — nothing is held back",
    "No card, no sales call",
  ];

  return (
    <PublicShell>
      <section className="border-b-2 border-ink">
        <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
          <p className="eyebrow text-coral">Pricing</p>
          <h1 className="mt-4 max-w-[18ch] text-display-lg font-extrabold text-ink">
            One plan. One price. Per school.
          </h1>
          <p className="mt-5 max-w-[56ch] text-lg leading-relaxed text-ink-soft">
            Charging per teacher makes schools ration who gets an account, and
            charging per paper makes them ration tests. Neither is a good
            outcome, so we do neither.
          </p>
        </div>
      </section>

      <section className="border-b-2 border-ink">
        <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
          <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
            {/* ---- the paid plan ---- */}
            <div className="overflow-hidden rounded-xl border-2 border-ink bg-ink shadow-[7px_7px_0_var(--coral)]">
              <div className="bg-lime p-8 sm:p-10">
                <p className="eyebrow text-ink/70">{ANNUAL_PLAN.name} plan</p>
                <p className="mt-4 font-display text-display-xl font-extrabold leading-none tracking-tight text-ink">
                  {formatPaise(ANNUAL_PLAN.amountPaise)}
                </p>
                <p className="mt-2 font-display text-base font-bold text-ink/80">
                  per school, per year
                </p>
                <div className="mt-7">
                  <Button
                    variant="ink"
                    size="lg"
                    render={<Link href="/signup">Start your free trial</Link>}
                  />
                </div>
              </div>

              <div className="bg-paper-pure p-8 sm:p-10">
                <p className="eyebrow text-coral">Everything included</p>
                <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                  {included.map((line) => (
                    <li key={line} className="flex gap-3 text-sm leading-relaxed text-ink">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 border-ink bg-lime"
                      >
                        <CheckIcon className="size-3" strokeWidth={3} />
                      </span>
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* ---- the trial ---- */}
            <div className="flex flex-col rounded-xl border-2 border-ink bg-paper-pure p-8 shadow-[4px_4px_0_var(--ink)] sm:p-10">
              <p className="eyebrow text-cobalt">Free trial</p>
              <p className="mt-4 font-display text-4xl font-extrabold leading-none tracking-tight text-ink">
                Free
              </p>
              <p className="mt-2 font-display text-sm font-bold text-ink-soft">
                for {TRIAL_DAYS} days
              </p>

              <ul className="mt-7 space-y-3">
                {trial.map((line) => (
                  <li key={line} className="flex gap-3 text-sm leading-relaxed text-ink">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 border-ink bg-cobalt text-white"
                    >
                      <CheckIcon className="size-3" strokeWidth={3} />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>

              <p className="mt-7 text-sm leading-relaxed text-ink-soft">
                When the trial ends nothing is deleted. Every paper, mark and
                student stays exactly where it is and stays readable — you just
                cannot set new papers or add students until you are on a plan.
              </p>

              <div className="mt-auto pt-7">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full"
                  render={<Link href="/signup">Start your school</Link>}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- questions a principal actually asks ---- */}
      <section>
        <div className="mx-auto w-full max-w-4xl px-5 py-14 sm:px-8 sm:py-20">
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            The questions we actually get asked
          </h2>

          <dl className="mt-9 space-y-8">
            {[
              {
                q: "What happens when we go over " + ANNUAL_PLAN.maxStudents + " students?",
                a: "Get in touch before you do and we will sort out a larger cap. The app will tell you as you approach it — the dashboard shows how many places are left, and an import that would exceed the cap fills what it can and tells you exactly which rows it skipped.",
              },
              {
                q: "Can a student see the answers before everyone has finished?",
                a: "No, and not by accident either. Marks and answer keys are withheld until the paper's window has closed for every class sitting it — including from teachers, because sections often sit the same paper at different times. The mark exists from the moment they hand in; it is simply not handed out.",
              },
              {
                q: "What if a student's laptop dies mid-paper?",
                a: "Their answers are already in the database — every one is written as it is chosen rather than held in the tab. When the deadline passes, their attempt is submitted with everything they had answered, whether or not their browser is still alive.",
              },
              {
                q: "Is our data mixed in with other schools'?",
                a: "It is one database, and every single query is filtered by the school on your signed-in session — never by anything that arrives in a URL or a request body. That rule is the oldest one in the codebase and there is a test suite whose whole job is trying to break it.",
              },
              {
                q: "How do we actually buy it?",
                a: "Start the free trial yourself — no card, no sales call. When you want to continue, talk to us and we will set your school up on a plan directly. There is no checkout to fight with and nothing to expense through a card you may not have.",
              },
            ].map((item) => (
              <div key={item.q} className="border-t-2 border-ink/15 pt-6">
                <dt className="font-display text-lg font-bold tracking-tight text-ink">
                  {item.q}
                </dt>
                <dd className="mt-2.5 max-w-[68ch] leading-relaxed text-ink-soft">
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-12 flex flex-wrap gap-4">
            <Button size="lg" render={<Link href="/signup">Start your school</Link>} />
            <Button
              variant="outline"
              size="lg"
              render={<Link href="/">Back to the overview</Link>}
            />
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
