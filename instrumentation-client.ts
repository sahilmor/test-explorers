import * as Sentry from "@sentry/nextjs";

/**
 * Browser-side error reporting.
 *
 * The DSN has to be NEXT_PUBLIC_ to reach the browser at all — that is by
 * design and a DSN is not a secret, it is a write-only endpoint. Without one
 * this file initialises nothing.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
    sendDefaultPii: false,
    // A student halfway through a paper does not need their answers
    // replayed to a third party.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
