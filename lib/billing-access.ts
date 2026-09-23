/**
 * Whether a school may buy its own plan.
 *
 * The business is sales-led: plans are agreed and paid for outside the app,
 * and a super-admin sets them on the school afterwards. So no school-facing
 * route reaches a checkout.
 *
 * The Razorpay integration is deliberately left intact rather than deleted —
 * it is tested, it works, and self-serve may well come back. This flag is the
 * single switch that would turn it on again, and it is off unless somebody
 * explicitly sets it.
 */
export function selfServeBillingEnabled(): boolean {
  return process.env.SELF_SERVE_BILLING?.trim().toLowerCase() === "true";
}

/**
 * Who a school should talk to about its plan, now that it cannot click a
 * button. Optional: without it the copy stays generic rather than inventing
 * an address that bounces.
 */
export function supportEmail(): string | null {
  return process.env.SUPPORT_EMAIL?.trim() || null;
}
