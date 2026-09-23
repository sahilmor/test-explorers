/**
 * Attempt constants and pure helpers, with no Mongoose import.
 *
 * Same split as the other `*-shared` modules: client components import this,
 * the model re-exports it, and Mongoose never reaches the browser bundle.
 */

export const ATTEMPT_STATUSES = [
  "in_progress",
  "submitted",
  "auto_submitted",
] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

/** What the palette shows for each question. */
export type QuestionState =
  | "not_visited"
  | "visited" // seen, no answer chosen
  | "answered"
  | "marked" // flagged for review, no answer
  | "answered_marked"; // flagged for review, answered

/** Under this much time left, the timer escalates. */
export const URGENT_MS = 5 * 60 * 1000;

/** How often the client re-asks the server what the time really is. */
export const RESYNC_INTERVAL_MS = 20_000;

/** How long after a change before the answer is written. */
export const AUTOSAVE_DEBOUNCE_MS = 700;

export function questionState(
  visited: boolean,
  answered: boolean,
  marked: boolean
): QuestionState {
  if (answered && marked) return "answered_marked";
  if (marked) return "marked";
  if (answered) return "answered";
  return visited ? "visited" : "not_visited";
}

/** "1:04:09" or "9:58" — a countdown a student can read at a glance. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const pad = (n: number) => String(n).padStart(2, "0");

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

/**
 * The hard deadline for an attempt.
 *
 * Whichever comes first: the student's own allowance running out, or the test
 * window closing on everybody. Computed on the server and sent to the client —
 * the client never works this out for itself.
 */
export function attemptDeadline(
  startedAt: Date,
  durationMinutes: number,
  testClosesAt: Date
): Date {
  const ownAllowance = new Date(startedAt.getTime() + durationMinutes * 60_000);
  return ownAllowance < testClosesAt ? ownAllowance : testClosesAt;
}

// ---------------------------------------------------------------------------
// Exam integrity
// ---------------------------------------------------------------------------

/**
 * What counts as leaving the test screen.
 *
 * Three signals, because no single one catches everything: the Fullscreen API
 * notices Escape, the Page Visibility API notices a tab switch or a phone
 * being locked, and `blur` notices another window taking focus while this tab
 * stays visible. They overlap, which is why the server de-duplicates bursts.
 */
export const VIOLATION_KINDS = [
  "fullscreen_exit",
  "tab_hidden",
  "window_blur",
] as const;

export type ViolationKind = (typeof VIOLATION_KINDS)[number];

/** Warnings before the paper is taken away. Third strike submits. */
export const MAX_VIOLATIONS = 3;

/**
 * Violations closer together than this count once.
 *
 * Leaving fullscreen fires `fullscreenchange` and often `blur` and
 * `visibilitychange` within the same few hundred milliseconds. Counting all
 * three would burn a student's warnings for one action, so the server collapses
 * anything inside this window into the violation already recorded.
 */
export const VIOLATION_DEBOUNCE_MS = 1500;

export const VIOLATION_LABELS: Record<ViolationKind, string> = {
  fullscreen_exit: "You left fullscreen",
  tab_hidden: "You switched away from the test",
  window_blur: "Another window took focus",
};

/** Why an attempt was submitted without the student pressing the button. */
export const AUTO_SUBMIT_REASONS = ["deadline", "integrity"] as const;
export type AutoSubmitReason = (typeof AUTO_SUBMIT_REASONS)[number];
