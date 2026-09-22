/**
 * What a school is allowed to do, and what it costs.
 *
 * No Mongoose in here, so the pricing page and the plan banner can import the
 * same numbers the server enforces. A price shown to a customer and a price
 * charged to a card must come from one place.
 */

export const PLANS = ["trial", "active", "expired"] as const;
export type Plan = (typeof PLANS)[number];

/** How long a new school's trial runs for. */
export const TRIAL_DAYS = 30;

/** What a trial school gets. Enough to run a real year group, not a whole school. */
export const TRIAL_MAX_STUDENTS = 50;

/**
 * The one paid plan. One is enough for v1 — tiers can come later, and a
 * pricing page with three columns and no customers is a waste of a decision.
 */
export const ANNUAL_PLAN = {
  id: "annual",
  name: "Annual",
  /**
   * In paise, because that is the unit Razorpay charges in. Storing rupees
   * anywhere near a payment is how rounding errors become refunds.
   */
  amountPaise: 999_900,
  currency: "INR",
  months: 12,
  maxStudents: 500,
} as const;

/** ₹9,999 — for display only. Never send this to Razorpay. */
export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: rupees % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * What the plan actually is right now.
 *
 * The stored `plan` goes stale the moment `planValidUntil` passes, exactly as
 * `Test.status` goes stale when a window closes. Phases 4 and 6 solved that by
 * recomputing from the dates on every read rather than trusting a field a cron
 * was supposed to have updated, and billing gets the same treatment: a trial
 * that ran out overnight is expired on the next request, with nothing having
 * had to run in between.
 */
export function effectivePlan(
  stored: Plan,
  planValidUntil: Date | string,
  now: Date = new Date()
): Plan {
  if (stored === "expired") return "expired";
  return now >= new Date(planValidUntil) ? "expired" : stored;
}

/** Whole days left, floored, never negative. */
export function daysLeft(planValidUntil: Date | string, now: Date = new Date()): number {
  const ms = new Date(planValidUntil).getTime() - now.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

/** Under this much trial left, the dashboard starts asking for money. */
export const NUDGE_DAYS = 7;

/** A date one plan-length from now, used when a payment clears. */
export function addMonths(from: Date, months: number): Date {
  const out = new Date(from);
  out.setMonth(out.getMonth() + months);
  return out;
}

/**
 * Renewing early should add to the time left, not throw it away — a school
 * that pays with a week of trial remaining would otherwise be buying 51 weeks.
 */
export function renewalFrom(
  currentValidUntil: Date | string | null | undefined,
  now: Date = new Date()
): Date {
  const current = currentValidUntil ? new Date(currentValidUntil) : now;
  return current > now ? current : now;
}
