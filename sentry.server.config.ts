import * as Sentry from "@sentry/nextjs";

/**
 * Server-side error reporting.
 *
 * Initialised only when a DSN exists, so a deployment without one makes no
 * network calls, buffers nothing, and has nothing to switch off. It starts
 * reporting the moment SENTRY_DSN is set — there is no other step.
 */
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Errors are the point. Tracing every request on a free tier burns the
    // quota that the errors need.
    tracesSampleRate: 0,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // Student answers and school data have no business leaving the database.
    sendDefaultPii: false,
  });
}
