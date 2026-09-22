import type { Metadata } from "next";
import { CheckIcon } from "lucide-react";
import { PageHeading } from "@/components/app/app-shell";
import { UpgradeButton } from "@/components/billing/upgrade-button";
import { Pill, TableFrame, Td, Th, Tr } from "@/components/ui/data-table";
import { requireRole } from "@/lib/auth";
import { listPayments } from "@/lib/billing";
import { connectToDatabase } from "@/lib/db";
import { getEntitlement } from "@/lib/entitlements";
import {
  ANNUAL_PLAN,
  TRIAL_MAX_STUDENTS,
  formatPaise,
} from "@/lib/plans";
import { razorpayConfig } from "@/lib/razorpay";
import User from "@/models/User";

export const metadata: Metadata = { title: "Plan and billing" };
export const dynamic = "force-dynamic";

/**
 * The one page in the dashboard allowed to behave like a landing page.
 *
 * This is the moment someone is asked for money, so the plan gets the full
 * ink slab, the lime block and the display type at a size nothing else in the
 * admin area uses. Below it, the payment history in the house table — because
 * the other half of asking for money is showing exactly what was taken.
 */
export default async function BillingPage() {
  const session = await requireRole("admin");

  await connectToDatabase();

  const [entitlement, payments, admin] = await Promise.all([
    getEntitlement(session.schoolId),
    listPayments(session.schoolId),
    User.findById(session.userId).select("name email").lean(),
  ]);

  const config = razorpayConfig();

  const renewsOn = new Date(entitlement.planValidUntil).toLocaleDateString(
    undefined,
    { day: "numeric", month: "long", year: "numeric" }
  );

  const included = [
    `Up to ${ANNUAL_PLAN.maxStudents} students — you're on ${entitlement.studentCount}`,
    "Unlimited papers, questions and sittings",
    "The whole question bank, CSV import included",
    "Results, per-question analysis and class leaderboards",
    "Every teacher account you need, at no extra cost",
  ];

  return (
    <div className="space-y-10">
      <PageHeading
        eyebrow="Billing"
        title="Your plan"
        blurb="One plan, billed once a year. No per-teacher charge and no per-paper charge."
      />

      {/* ---- where they stand ---- */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border-2 border-ink bg-paper-pure px-5 py-4">
          <p className="eyebrow text-ink-soft">Current plan</p>
          <p className="mt-1.5 flex items-center gap-2 font-display text-xl font-extrabold capitalize text-ink">
            {entitlement.plan}
            {entitlement.plan === "active" ? (
              <Pill tone="lime">Paid</Pill>
            ) : entitlement.plan === "trial" ? (
              <Pill tone="cobalt">Free</Pill>
            ) : (
              <Pill tone="coral">Lapsed</Pill>
            )}
          </p>
        </div>
        <div className="rounded-xl border-2 border-ink bg-paper-pure px-5 py-4">
          <p className="eyebrow text-ink-soft">
            {entitlement.plan === "expired" ? "Expired on" : "Runs until"}
          </p>
          <p className="mt-1.5 font-display text-xl font-extrabold text-ink">
            {renewsOn}
          </p>
        </div>
        <div className="rounded-xl border-2 border-ink bg-paper-pure px-5 py-4">
          <p className="eyebrow text-ink-soft">Student cap</p>
          <p className="mt-1.5 font-display text-xl font-extrabold text-ink tabular-nums">
            {entitlement.studentCount} / {entitlement.maxStudents}
          </p>
        </div>
      </section>

      {/* ---- the plan itself ---- */}
      <section className="overflow-hidden rounded-xl border-2 border-ink bg-ink shadow-[7px_7px_0_var(--coral)]">
        <div className="grid gap-px sm:grid-cols-[1.1fr_1fr]">
          <div className="bg-lime p-7 sm:p-9">
            <p className="eyebrow text-ink/70">{ANNUAL_PLAN.name} plan</p>

            <p className="mt-4 font-display text-display-xl font-extrabold leading-none tracking-tight text-ink">
              {formatPaise(ANNUAL_PLAN.amountPaise)}
            </p>
            <p className="mt-2 font-display text-base font-bold text-ink/80">
              per school, per year
            </p>

            <p className="mt-5 max-w-sm text-sm leading-relaxed text-ink/80">
              Everything the platform does, for a whole school, for a whole
              year. Your trial was not a cut-down version — this is the same
              product with the cap lifted from {TRIAL_MAX_STUDENTS} students to{" "}
              {ANNUAL_PLAN.maxStudents}.
            </p>

            <div className="mt-7">
              {config ? (
                <UpgradeButton
                  label={entitlement.plan === "active" ? "Renew for another year" : "Upgrade now"}
                  prefill={{ name: admin?.name, email: admin?.email }}
                />
              ) : (
                <p className="rounded-lg border-2 border-ink bg-paper-pure px-4 py-3 text-sm text-ink">
                  Payments aren&apos;t switched on for this deployment yet. Add{" "}
                  <code className="font-display text-xs font-bold">RAZORPAY_KEY_ID</code>{" "}
                  and{" "}
                  <code className="font-display text-xs font-bold">
                    RAZORPAY_KEY_SECRET
                  </code>{" "}
                  and this becomes a live checkout — see docs/setup.md.
                </p>
              )}
            </div>

            {config?.keyId.startsWith("rzp_test_") ? (
              <p className="mt-3 text-xs font-bold text-ink/70">
                Test mode — no real money moves.
              </p>
            ) : null}
          </div>

          <div className="bg-paper-pure p-7 sm:p-9">
            <p className="eyebrow text-coral">What you get</p>
            <ul className="mt-4 space-y-3">
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

            <p className="mt-6 text-xs leading-relaxed text-ink-soft">
              Renewing early never wastes what&apos;s left — whatever time
              remains is added to the new year. If a plan lapses, nothing is
              deleted: every paper, mark and student stays exactly where it is
              and stays readable.
            </p>
          </div>
        </div>
      </section>

      {/* ---- receipts ---- */}
      <section>
        <h2 className="font-display text-xl font-bold tracking-tight text-ink">
          Payment history
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Every attempt, including the ones that didn&apos;t go through.
        </p>

        {payments.length === 0 ? (
          <div className="mt-4 rounded-xl border-2 border-dashed border-ink/40 bg-paper-deep/50 px-5 py-8 text-center">
            <p className="font-display font-bold text-ink">Nothing yet</p>
            <p className="mx-auto mt-1 max-w-[46ch] text-sm text-ink-soft">
              You haven&apos;t been charged for anything. Payments show up here
              the moment one clears.
            </p>
          </div>
        ) : (
          <div className="mt-4">
            <TableFrame
              tone="cobalt"
              head={
                <tr>
                  <Th className="text-white">When</Th>
                  <Th className="text-white">Amount</Th>
                  <Th className="text-white">Status</Th>
                  <Th className="text-white">Reference</Th>
                </tr>
              }
            >
              {payments.map((payment) => (
                <Tr key={payment.id}>
                  <Td className="whitespace-nowrap">
                    {new Date(payment.createdAt).toLocaleString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Td>
                  <Td className="font-display font-bold tabular-nums">
                    {formatPaise(payment.amount)}
                  </Td>
                  <Td>
                    {payment.status === "captured" ? (
                      <Pill tone="lime">Paid</Pill>
                    ) : payment.status === "failed" ? (
                      <Pill tone="danger">Didn&apos;t go through</Pill>
                    ) : (
                      <Pill>Started</Pill>
                    )}
                    {payment.failureReason ? (
                      <span className="mt-1 block text-xs text-ink-soft">
                        {payment.failureReason}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="font-mono text-xs text-ink-soft">
                    {payment.razorpayPaymentId ?? payment.razorpayOrderId}
                  </Td>
                </Tr>
              ))}
            </TableFrame>
          </div>
        )}
      </section>
    </div>
  );
}
