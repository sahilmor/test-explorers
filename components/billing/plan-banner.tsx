import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ANNUAL_PLAN, NUDGE_DAYS, formatPaise } from "@/lib/plans";
import type { Entitlement } from "@/lib/entitlements";
import { cn } from "cn";

/**
 * Where a school stands, in one calm card.
 *
 * Deliberately built like the Phase 5 save indicator rather than like an
 * alert: the same slab, the same ink border, a colour band that shifts rather
 * than a red box that shouts. Expiry is a billing fact, not a fault — this is
 * someone who has been paying attention to their students and not to their
 * invoice, and the screen should read as a reminder rather than a telling-off.
 *
 * It only appears when it has something to say: a trial, a trial running out,
 * or a lapsed plan. A school eleven months into a paid year sees nothing.
 */
export function PlanBanner({
  entitlement,
  className,
}: {
  entitlement: Entitlement;
  className?: string;
}) {
  const { plan, daysRemaining, studentCount, maxStudents } = entitlement;

  const renewsOn = new Date(entitlement.planValidUntil).toLocaleDateString(
    undefined,
    { day: "numeric", month: "long", year: "numeric" }
  );

  // An active plan is only worth a card when it is nearly up.
  if (plan === "active" && daysRemaining > NUDGE_DAYS) return null;

  const copy =
    plan === "expired"
      ? {
          band: "bg-coral",
          eyebrow: "Plan expired",
          title: "Renew to start setting papers again",
          body: `Everything you've built is still here and still readable — every paper, every mark, every student. What's paused is new work: setting papers, adding students, and students starting a sitting. ${formatPaise(ANNUAL_PLAN.amountPaise)} puts it all back.`,
          cta: "Renew now",
        }
      : plan === "active"
        ? {
            band: "bg-cobalt",
            eyebrow: "Renewing soon",
            title: `Your plan runs out on ${renewsOn}`,
            body: `${daysRemaining === 0 ? "It expires today" : `That's ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} away`}. Renewing early doesn't waste what's left — the time you've paid for gets added on.`,
            cta: "Renew",
          }
        : daysRemaining <= NUDGE_DAYS
          ? {
              band: "bg-coral",
              eyebrow: "Trial ending",
              title:
                daysRemaining === 0
                  ? "Your trial ends today"
                  : `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left of your trial`,
              body: `After that you keep everything you've got and can still read all of it — you just can't set new papers or add students until you're on a plan. ${formatPaise(ANNUAL_PLAN.amountPaise)} a year covers up to ${ANNUAL_PLAN.maxStudents} students.`,
              cta: "See the plan",
            }
          : {
              band: "bg-lime",
              eyebrow: "Free trial",
              title: `${daysRemaining} days left, ${studentCount} of ${maxStudents} students`,
              body: `Your trial runs to ${renewsOn}. Everything works — this is the whole product, not a cut-down version of it.`,
              cta: "See the plan",
            };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border-2 border-ink bg-paper-pure p-6 shadow-[5px_5px_0_var(--ink)]",
        className
      )}
    >
      <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-2.5", copy.band)} />

      <div className="mt-2 flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 max-w-2xl">
          <p className="eyebrow text-coral">{copy.eyebrow}</p>
          <h2 className="mt-2 font-display text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
            {copy.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">{copy.body}</p>
        </div>

        <Button
          size="lg"
          variant={plan === "expired" ? "ink" : "default"}
          render={<Link href="/admin/billing">{copy.cta}</Link>}
        />
      </div>
    </div>
  );
}

/**
 * The inline version, shown at the point of a blocked action rather than at
 * the top of a page — a form that refuses should explain itself where the
 * person is looking, not somewhere they have to scroll back to.
 */
export function PlanBlockNotice({
  message,
  upgradeHref = "/admin/billing",
  canUpgrade = true,
}: {
  message: string;
  upgradeHref?: string;
  /** Teachers see the explanation but not a Pay button — it isn't their call. */
  canUpgrade?: boolean;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border-2 border-ink bg-coral-wash px-4 py-3.5"
    >
      <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink">{message}</p>
      {canUpgrade ? (
        <Button size="sm" variant="ink" render={<Link href={upgradeHref}>Renew</Link>} />
      ) : null}
    </div>
  );
}
