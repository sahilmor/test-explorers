import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Pill, TableFrame, Td, Th, Tr } from "@/components/ui/data-table";
import { Wordmark } from "@/components/brand/wordmark";
import { Stat } from "@/components/results/result-bits";
import { SetupError } from "@/lib/errors";
import { formatPaise } from "@/lib/plans";
import { getPlatformOverview, requirePlatformOwner } from "@/lib/platform";
import { auditConfig, type ConfigCheck } from "@/lib/config-audit";

export const metadata: Metadata = { title: "Platform" };
export const dynamic = "force-dynamic";

/**
 * The owner's view of the business.
 *
 * Outside the tenant app entirely — its own layout, no AppShell, no school
 * nav — because it does not belong to a school and should never look like it
 * does. The gate is `requirePlatformOwner`, which 404s rather than 403s: there
 * is no reason to confirm this page exists to whoever guessed the URL.
 */
export default async function PlatformPage() {
  try {
    await requirePlatformOwner();
  } catch (error) {
    if (error instanceof SetupError) notFound();
    throw error;
  }

  const { schools, totals } = await getPlatformOverview();
  const config = auditConfig();

  return (
    <div className="min-h-dvh bg-ink px-5 py-10 text-paper sm:px-8 sm:py-14">
      <div className="mx-auto w-full max-w-6xl space-y-10">
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div>
            <Wordmark href={null} tone="paper" />
            <p className="eyebrow mt-4 text-lime">Platform</p>
            <h1 className="mt-2 font-display text-display-lg font-extrabold tracking-tight text-paper">
              Every school
            </h1>
          </div>

          <p className="max-w-sm text-sm leading-relaxed text-paper/60">
            The only screen in this app that reads across tenants. Revenue
            counts captured payments and nothing else — an order that was
            opened and abandoned is not money.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Revenue"
            value={formatPaise(totals.revenuePaise)}
            tone="correct"
            hint={`${totals.payingSchools} school${totals.payingSchools === 1 ? "" : "s"} have paid`}
          />
          <Stat label="Schools" value={totals.schools} hint="signed up all time" />
          <Stat
            label="Paying now"
            value={totals.active}
            hint={`${totals.trial} on trial, ${totals.expired} lapsed`}
          />
          <Stat
            label="Students"
            value={totals.students}
            hint="across every school"
          />
        </section>

        {/* ---- is this deployment actually wired up? ---- */}
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-bold tracking-tight text-paper">
              Configuration
            </h2>
            <p className="text-sm text-paper/55">
              {config.environment} · {config.summary.ok} ok
              {config.summary.warn > 0 ? `, ${config.summary.warn} to look at` : ""}
              {config.summary.missing > 0 ? `, ${config.summary.missing} missing` : ""}
            </p>
          </div>

          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {config.checks.map((check) => (
              <ConfigRow key={check.key} check={check} />
            ))}
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold tracking-tight text-paper">
            Schools
          </h2>

          {schools.length === 0 ? (
            <p className="mt-4 rounded-xl border-2 border-paper/25 px-5 py-8 text-center text-sm text-paper/60">
              Nobody has signed up yet.
            </p>
          ) : (
            <div className="mt-4">
              <TableFrame
                tone="lime"
                head={
                  <tr>
                    <Th>School</Th>
                    <Th>Plan</Th>
                    <Th>Valid until</Th>
                    <Th>Students</Th>
                    <Th>Papers</Th>
                    <Th>Sittings</Th>
                    <Th>Revenue</Th>
                  </tr>
                }
              >
                {schools.map((school) => (
                  <Tr key={school.id}>
                    <Td>
                      <span className="font-display font-bold">{school.name}</span>
                      <span className="block text-xs text-ink-soft">
                        joined{" "}
                        {new Date(school.createdAt).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </Td>
                    <Td>
                      {school.plan === "active" ? (
                        <Pill tone="lime">Active</Pill>
                      ) : school.plan === "trial" ? (
                        <Pill tone="cobalt">Trial</Pill>
                      ) : (
                        <Pill tone="coral">Expired</Pill>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-ink-soft">
                      {new Date(school.planValidUntil).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </Td>
                    <Td className="tabular-nums">
                      {school.studentCount}
                      <span className="text-ink-soft"> / {school.maxStudents}</span>
                    </Td>
                    <Td className="tabular-nums">{school.testCount}</Td>
                    <Td className="tabular-nums">{school.attemptCount}</Td>
                    <Td className="font-display font-bold tabular-nums">
                      {school.revenuePaise > 0 ? (
                        formatPaise(school.revenuePaise)
                      ) : (
                        <span className="font-normal text-ink-faint">—</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </TableFrame>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * One configuration check.
 *
 * Deliberately not a red/green light: "warn" is the common and interesting
 * state — email not set up yet, test keys still in place — and it needs to
 * read as something to decide about rather than something broken.
 */
function ConfigRow({ check }: { check: ConfigCheck }) {
  const tone =
    check.status === "ok"
      ? "border-lime/40 bg-lime/10"
      : check.status === "warn"
        ? "border-[#FFC93D]/45 bg-[#FFC93D]/10"
        : "border-coral/50 bg-coral/10";

  const dot =
    check.status === "ok" ? "bg-lime" : check.status === "warn" ? "bg-[#FFC93D]" : "bg-coral";

  return (
    <li className={`rounded-xl border-2 px-4 py-3 ${tone}`}>
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${dot}`} />
        <p className="font-display text-sm font-bold text-paper">{check.label}</p>
        {check.required && check.status !== "ok" ? (
          <span className="ml-auto rounded-full border border-coral px-2 py-0.5 font-display text-[0.65rem] font-bold text-coral">
            blocking
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-paper/65">{check.detail}</p>
      <p className="mt-1 font-mono text-[0.65rem] text-paper/35">{check.key}</p>
    </li>
  );
}
