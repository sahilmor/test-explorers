/**
 * Next's server startup hook.
 *
 * Loads whichever Sentry config matches the runtime. Both are inert without a
 * DSN, so this costs an install with no error tracking one dynamic import at
 * boot and nothing else.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export { captureRequestError as onRequestError } from "@sentry/nextjs";
