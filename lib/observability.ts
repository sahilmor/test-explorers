/**
 * Error reporting.
 *
 * Wrapped in one module so the rest of the app never imports Sentry directly,
 * and so every call is a no-op on an install that has no DSN. Nothing is sent
 * anywhere unless somebody configured somewhere to send it.
 *
 * The rule for what gets reported: anything that means a person is stuck or
 * money is in doubt. Ordinary refusals — a wrong password, a validation
 * error, a plan that has expired — are the app working, not breaking, and
 * paging over those is how alerting gets ignored.
 */

export function sentryDsn(): string | null {
  return (
    process.env.SENTRY_DSN?.trim() ||
    process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() ||
    null
  );
}

export function observabilityEnabled(): boolean {
  return sentryDsn() !== null;
}

/**
 * Reports an error, with context, and never throws while doing it.
 *
 * An error inside the error reporter would be a poor way to take a site down,
 * so the import is dynamic and the whole thing is wrapped.
 */
export async function reportError(
  error: unknown,
  context: { where: string; extra?: Record<string, unknown> }
): Promise<void> {
  // Always logged, whether or not Sentry is configured. Vercel's function
  // logs are the fallback and cost nothing.
  console.error(`[${context.where}]`, error, context.extra ?? "");

  if (!observabilityEnabled()) return;

  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(error, {
      tags: { where: context.where },
      extra: context.extra,
    });
  } catch (reportingError) {
    console.error("[observability] could not report an error:", reportingError);
  }
}

/**
 * Reports something that is not an exception but still wants attention —
 * a payment that failed verification, a webhook signed with the wrong secret.
 * These are the two things most worth being told about without waiting for a
 * customer to complain.
 */
export async function reportAlert(
  message: string,
  context: { where: string; level?: "warning" | "error"; extra?: Record<string, unknown> }
): Promise<void> {
  const level = context.level ?? "error";

  if (level === "warning") console.warn(`[${context.where}] ${message}`, context.extra ?? "");
  else console.error(`[${context.where}] ${message}`, context.extra ?? "");

  if (!observabilityEnabled()) return;

  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureMessage(message, {
      level,
      tags: { where: context.where },
      extra: context.extra,
    });
  } catch (reportingError) {
    console.error("[observability] could not report an alert:", reportingError);
  }
}
