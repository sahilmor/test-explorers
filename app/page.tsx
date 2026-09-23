import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicShell } from "@/components/marketing/public-shell";
import { Button } from "@/components/ui/button";
import { BubbleGrid } from "@/components/brand/bubble-grid";
import { Marker } from "@/components/brand/marker";
import { APP_NAME } from "@/lib/brand";
import { HOME_FOR_ROLE } from "@/lib/auth";
import { getLiveSession } from "@/lib/current-user";
import { ANNUAL_PLAN, TRIAL_DAYS, TRIAL_MAX_STUDENTS, formatPaise } from "@/lib/plans";
import { cn } from "cn";

export const metadata: Metadata = {
  title: "Run your school's tests online",
  description:
    "Set a paper once, send it to every class, and have it marked before the bell. Internal assessments for one school — question bank, scheduled papers, autosaving test screen, instant marking and class analysis.",
  alternates: { canonical: "/" },
  openGraph: {
    title: `${APP_NAME} — run your school's tests online`,
    description:
      "Set a paper once, send it to every class, and have it marked before the bell. Built for one school's own internal assessments.",
    url: "/",
    siteName: APP_NAME,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} — run your school's tests online`,
    description:
      "Set a paper once, send it to every class, and have it marked before the bell.",
  },
};

export const dynamic = "force-dynamic";

/**
 * The landing page.
 *
 * Written for the person who signs the cheque — a principal or an exam
 * coordinator — not for a student looking for practice papers. That changes
 * what leads: the hours a department loses to marking, and the fact that this
 * is *their* school's system rather than a marketplace their students get
 * advertised on.
 */
export default async function Home() {
  // getLiveSession, not getSession: a valid token whose account is gone must
  // not be redirected into a role area that will bounce it straight back.
  const session = await getLiveSession();
  if (session) redirect(HOME_FOR_ROLE[session.role]);

  return (
    <PublicShell>
      {/* ---- hero ---- */}
      <section className="border-b-2 border-ink">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
          <p className="eyebrow text-coral">For schools that still photocopy</p>

          <h1 className="mt-5 max-w-[15ch] text-display-2xl font-extrabold text-ink">
            Run your tests <Marker>online</Marker>
          </h1>

          <p className="mt-7 max-w-[54ch] text-lg leading-relaxed text-ink-soft">
            Set a paper once, send it to every class, and have it marked before
            the bell. One school, its own question bank, its own results — not a
            marketplace, not a course platform, and nobody advertising to your
            students.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Button size="xl" render={<Link href="/signup">Start your school</Link>} />
            <Button
              variant="outline"
              size="xl"
              render={<Link href="/pricing">See pricing</Link>}
            />
          </div>

          <p className="mt-5 text-sm text-ink-soft">
            {TRIAL_DAYS}-day free trial, up to {TRIAL_MAX_STUDENTS} students. No
            card needed to start.
          </p>

          <BubbleGrid rows={3} cols={10} className="mt-14 h-20 w-auto text-ink/25 sm:h-24" />
        </div>
      </section>

      {/* ---- the problem, in their words ---- */}
      <section className="border-b-2 border-ink bg-ink text-paper">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <h2 className="max-w-[20ch] font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            A unit test costs your department a weekend
          </h2>

          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {[
              {
                n: "01",
                title: "Setting it",
                body: "Someone retypes the same twenty questions they typed last year, because last year's file is on a laptop that left with a teacher who did too.",
              },
              {
                n: "02",
                title: "Sitting it",
                body: "Printing, collating, invigilating, collecting. Then a pile of paper that cannot be in two places at once.",
              },
              {
                n: "03",
                title: "Marking it",
                body: "Evenings with a red pen, then a spreadsheet, then the question nobody has time to answer: which questions did the class actually get wrong?",
              },
            ].map((item) => (
              <div key={item.n}>
                <p className="font-display text-sm font-extrabold text-lime">{item.n}</p>
                <h3 className="mt-3 font-display text-xl font-bold tracking-tight">
                  {item.title}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-paper/65">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- what it does ---- */}
      <section className="border-b-2 border-ink">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <p className="eyebrow text-coral">What you get</p>
          <h2 className="mt-3 max-w-[22ch] font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            The whole cycle, in one place
          </h2>

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <Feature
              tone="lime"
              title="A question bank that stays"
              body="Questions belong to the school, not to whoever typed them. Add them by hand or import a CSV, attach a diagram, and reuse them for years. Next year's paper is built from this year's bank in a couple of minutes."
            />
            <Feature
              tone="coral"
              title="Papers, scheduled and assigned"
              body="Pick questions or pull a random set, set a duration and a window, and assign it to the classes sitting it. It appears on their dashboards when it opens and drops off when it closes."
            />
            <Feature
              tone="cobalt"
              title="A test screen that doesn't lose work"
              body="Every answer is written to the database as it is chosen, not held in a tab. A refresh, a flat battery or a closed laptop still ends in a submitted paper with everything the student had answered."
            />
            <Feature
              tone="lime"
              title="Marking that is already done"
              body="Every paper is marked the moment it is handed in. Nothing is visible to anyone — including staff — until the window closes for everyone, then it all appears at once."
            />
            <Feature
              tone="coral"
              title="The question your department actually asks"
              body="Results open on every question sorted worst-first, so the three the class fell apart on are the first thing you see. That is the bit worth taking to a department meeting."
            />
            <Feature
              tone="cobalt"
              title="Your data, separated properly"
              body="Every query is scoped to your school by the signed-in session, never by anything a browser can change. It is the thing this platform was built around first and it is tested on every release."
            />
          </div>
        </div>
      </section>

      {/* ---- students ---- */}
      <section className="border-b-2 border-ink bg-paper-deep">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="eyebrow text-cobalt">For the people sitting it</p>
              <h2 className="mt-3 max-w-[18ch] font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
                It works on the phone in their pocket
              </h2>
              <p className="mt-5 max-w-[52ch] leading-relaxed text-ink-soft">
                Most students will sit these on a phone, so that is what the
                exam screen was designed for first — a question palette that
                shows what is answered and what is flagged, a countdown the
                server owns so nobody gains time by changing their clock, and a
                save indicator that only says &ldquo;Saved&rdquo; when the
                server has actually confirmed it.
              </p>
              <p className="mt-4 max-w-[52ch] leading-relaxed text-ink-soft">
                Afterwards they get their mark, their answers beside the right
                ones, and where they came in their class.
              </p>
            </div>

            <div className="rounded-xl border-2 border-ink bg-paper-pure p-6 shadow-[6px_6px_0_var(--ink)]">
              <div className="flex items-center justify-between gap-3">
                <span className="eyebrow text-ink-soft">Unit 3 — Forces</span>
                <span className="rounded-full border-2 border-ink bg-lime px-2.5 py-0.5 font-display text-xs font-bold text-ink">
                  Saved
                </span>
              </div>

              <div className="mt-5 grid grid-cols-8 gap-1.5" aria-hidden="true">
                {[
                  "a", "a", "a", "f", "a", "n", "n", "n",
                  "a", "a", "f", "a", "n", "n", "n", "n",
                ].map((state, i) => (
                  <span
                    key={i}
                    className={cn(
                      "grid aspect-square place-items-center rounded border-2 border-ink font-display text-[0.65rem] font-bold",
                      state === "a"
                        ? "bg-lime text-ink"
                        : state === "f"
                          ? "bg-cobalt text-white"
                          : "bg-paper-deep text-ink-soft"
                    )}
                  >
                    {i + 1}
                  </span>
                ))}
              </div>

              <p className="mt-5 text-xs text-ink-soft">
                Answered · flagged for review · not yet opened. The same colours
                a student already knows from an OMR sheet.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---- price ---- */}
      <section>
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="overflow-hidden rounded-xl border-2 border-ink bg-lime shadow-[7px_7px_0_var(--coral)]">
            <div className="grid gap-px sm:grid-cols-[1.2fr_1fr]">
              <div className="p-8 sm:p-10">
                <p className="eyebrow text-ink/70">One plan, one price</p>
                <p className="mt-4 font-display text-display-xl font-extrabold leading-none tracking-tight text-ink">
                  {formatPaise(ANNUAL_PLAN.amountPaise)}
                </p>
                <p className="mt-2 font-display text-base font-bold text-ink/80">
                  per school, per year — up to {ANNUAL_PLAN.maxStudents} students
                </p>
                <p className="mt-5 max-w-[44ch] text-sm leading-relaxed text-ink/80">
                  No per-teacher charge, no per-paper charge, no charge for the
                  question bank. Start on a {TRIAL_DAYS}-day trial with{" "}
                  {TRIAL_MAX_STUDENTS} students and no card.
                </p>
              </div>

              <div className="flex flex-col justify-center gap-4 bg-ink p-8 sm:p-10">
                <Button
                  size="lg"
                  render={<Link href="/signup">Start your school</Link>}
                />
                <Button
                  variant="outline"
                  size="lg"
                  render={<Link href="/pricing">What&apos;s included</Link>}
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}

function Feature({
  title,
  body,
  tone,
}: {
  title: string;
  body: string;
  tone: "lime" | "coral" | "cobalt";
}) {
  const bar =
    tone === "lime" ? "bg-lime" : tone === "coral" ? "bg-coral" : "bg-cobalt";

  return (
    <div className="relative overflow-hidden rounded-xl border-2 border-ink bg-paper-pure p-6 shadow-[4px_4px_0_var(--ink)]">
      <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-2", bar)} />
      <h3 className="mt-2 font-display text-lg font-bold tracking-tight text-ink">
        {title}
      </h3>
      <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">{body}</p>
    </div>
  );
}
