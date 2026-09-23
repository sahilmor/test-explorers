import { NUDGE_DAYS } from "@/lib/plans";
import { supportEmail } from "@/lib/billing-access";
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
 *
 * There is no button. Plans are sold and paid for outside the app and set by
 * a super-admin afterwards, so a "Renew now" here would lead nowhere — this
 * tells the school where it stands and who to talk to, which is the honest
 * version of the same card.
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

  const contact = supportEmail();
  const talkToUs = contact
    ? `Get in touch at ${contact} and we'll sort it out.`
    : "Get in touch with us and we'll sort it out.";

  const copy =
    plan === "expired"
      ? {
          band: "bg-coral",
          eyebrow: "Plan expired",
          title: "Your plan has ended",
          body: `Everything you've built is still here and still readable — every paper, every mark, every student. What's paused is new work: setting papers, adding students, and students starting a sitting. ${talkToUs}`,
        }
      : plan === "active"
        ? {
            band: "bg-cobalt",
            eyebrow: "Renewing soon",
            title: `Your plan runs out on ${renewsOn}`,
            body: `${daysRemaining === 0 ? "It expires today" : `That's ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} away`}. ${talkToUs}`,
          }
        : daysRemaining <= NUDGE_DAYS
          ? {
              band: "bg-coral",
              eyebrow: "Trial ending",
              title:
                daysRemaining === 0
                  ? "Your trial ends today"
                  : `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left of your trial`,
              body: `After that you keep everything you've got and can still read all of it — you just can't set new papers or add students. ${talkToUs}`,
            }
          : {
              band: "bg-lime",
              eyebrow: "Free trial",
              title: `${daysRemaining} days left, ${studentCount} of ${maxStudents} students`,
              body: `Your trial runs to ${renewsOn}. Everything works — this is the whole product, not a cut-down version of it.`,
            };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border-2 border-ink bg-paper-pure p-6 shadow-[5px_5px_0_var(--ink)]",
        className
      )}
    >
      <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-2.5", copy.band)} />

      <div className="mt-2 min-w-0 max-w-2xl">
        <p className="eyebrow text-coral">{copy.eyebrow}</p>
        <h2 className="mt-2 font-display text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
          {copy.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{copy.body}</p>
      </div>
    </div>
  );
}

/**
 * The inline version, shown at the point of a blocked action rather than at
 * the top of a page — a form that refuses should explain itself where the
 * person is looking, not somewhere they have to scroll back to.
 */
export function PlanBlockNotice({ message }: { message: string }) {
  const contact = supportEmail();

  return (
    <div
      role="status"
      className="rounded-xl border-2 border-ink bg-coral-wash px-4 py-3.5"
    >
      <p className="text-sm leading-relaxed text-ink">{message}</p>
      {contact ? (
        <p className="mt-1.5 text-sm text-ink">
          Get in touch at{" "}
          <a href={`mailto:${contact}`} className="font-display font-bold underline underline-offset-4">
            {contact}
          </a>
          .
        </p>
      ) : null}
    </div>
  );
}
