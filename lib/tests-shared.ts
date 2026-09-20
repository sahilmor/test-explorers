/**
 * Test constants and pure helpers, with no Mongoose import.
 *
 * Same split as `lib/questions-shared.ts`: client components import this, the
 * model re-exports it, and Mongoose never reaches the browser bundle.
 */

/**
 * What is stored on the document.
 *
 * "scheduled" and "published" are both *published* in the sense that matters —
 * the teacher has committed the test and its assignments exist. The difference
 * is only whether `opensAt` had already passed at the moment it was saved.
 *
 * That makes the stored value go stale the instant a scheduled test's opening
 * time arrives, so nothing that matters is ever decided from it. Visibility is
 * computed from the dates by `testState` below, which is always right without
 * a background job to flip rows over.
 */
export const TEST_STATUSES = ["draft", "scheduled", "published"] as const;
export type TestStatus = (typeof TEST_STATUSES)[number];

/** What a test actually is, right now. This is what the UI renders. */
export type TestState = "draft" | "scheduled" | "open" | "closed";

export const MIN_DURATION_MINUTES = 1;
/** Four hours. Longer than any single sitting a school runs. */
export const MAX_DURATION_MINUTES = 240;

/** The most questions one auto-generated paper may pull. */
export const MAX_AUTO_QUESTIONS = 100;

/** A published test is only startable inside its window. */
export function testState(
  status: TestStatus,
  opensAt: Date | string,
  closesAt: Date | string,
  now: Date = new Date()
): TestState {
  if (status === "draft") return "draft";

  const opens = new Date(opensAt);
  const closes = new Date(closesAt);

  if (now < opens) return "scheduled";
  if (now >= closes) return "closed";
  return "open";
}

/**
 * "2 hours", "45 minutes", "3 days" — the gap between two moments, rounded to
 * whatever unit reads best. Used for both "opens in" and "closes in".
 */
export function humanGap(from: Date, to: Date): string {
  const ms = to.getTime() - from.getTime();
  if (ms <= 0) return "now";

  // Rounding to minutes turns the last 29 seconds into "0 minutes", which
  // reads as a bug rather than as urgency.
  if (ms < 60_000) return "under a minute";

  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;

  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/** Under this much time left, a student's card turns urgent. */
export const CLOSING_SOON_MS = 2 * 60 * 60 * 1000;
