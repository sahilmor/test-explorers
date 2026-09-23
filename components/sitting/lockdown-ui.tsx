"use client";

import { MaximizeIcon, ShieldAlertIcon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VIOLATION_LABELS, type ViolationKind } from "@/lib/attempts-shared";
import { cn } from "cn";

/**
 * The visible half of lockdown.
 *
 * All three pieces are deliberately calm and explicit. A student being watched
 * by software should be able to see exactly what it is counting and how much
 * room they have left — a rule that only announces itself when it has already
 * cost you the paper is not a rule, it is a trap.
 */

/** The gate before the paper: nothing is shown until fullscreen is granted. */
export function LockdownGate({
  supported,
  onEnter,
  onSkip,
}: {
  supported: boolean;
  onEnter: () => void;
  onSkip: () => void;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-5 py-16">
      <div className="w-full max-w-lg rounded-xl border-2 border-ink bg-paper-pure p-7 shadow-[5px_5px_0_var(--ink)] sm:p-9">
        <p className="eyebrow text-coral">Before you start</p>
        <h1 className="mt-3 font-display text-2xl font-extrabold tracking-tight text-ink">
          This paper runs in fullscreen
        </h1>

        <div className="mt-4 space-y-3 text-sm leading-relaxed text-ink-soft">
          <p>
            Once you begin, leaving the test screen is recorded. That means
            exiting fullscreen, switching tabs or apps, or another window
            taking focus.
          </p>
          <p>
            You get <strong className="font-display font-bold text-ink">two warnings</strong>.
            On the third, the paper is submitted automatically with whatever
            you have answered, and your teacher sees that it ended that way.
          </p>
          <p>
            Your answers save as you go, so if your device dies you can come
            back and carry on — your warnings come back with you too.
          </p>
        </div>

        {supported ? (
          <div className="mt-7">
            <Button size="lg" variant="ink" onClick={onEnter}>
              <MaximizeIcon aria-hidden="true" className="size-4" />
              Enter fullscreen and start
            </Button>
          </div>
        ) : (
          <div className="mt-7 space-y-3">
            <p className="rounded-lg border-2 border-ink bg-coral-wash px-3.5 py-2.5 text-sm text-ink">
              This browser won&apos;t let a page go fullscreen. You can still
              sit the paper, and switching away is still recorded — tell your
              invigilator so they know.
            </p>
            <Button size="lg" variant="ink" onClick={onSkip}>
              Start anyway
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}

/** The always-on status strip. */
export function LockdownBar({
  fullscreen,
  supported,
  violations,
  limit,
  onRefullscreen,
}: {
  fullscreen: boolean;
  supported: boolean;
  violations: number;
  limit: number;
  onRefullscreen: () => void;
}) {
  const spent = violations > 0;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 border-b-2 border-ink px-4 py-2 sm:px-6",
        spent ? "bg-coral-wash" : "bg-paper-deep"
      )}
    >
      <span className="inline-flex items-center gap-1.5 font-display text-xs font-bold text-ink">
        {fullscreen ? (
          <ShieldCheckIcon aria-hidden="true" className="size-3.5" />
        ) : (
          <ShieldAlertIcon aria-hidden="true" className="size-3.5" />
        )}
        Fullscreen: {supported ? (fullscreen ? "on" : "off") : "unavailable"}
      </span>

      <span
        className="font-display text-xs font-bold text-ink"
        aria-live="polite"
      >
        Warnings: {violations} / {limit}
      </span>

      {supported && !fullscreen ? (
        <Button size="sm" variant="ink" className="ml-auto" onClick={onRefullscreen}>
          Back to fullscreen
        </Button>
      ) : (
        <span className="ml-auto text-xs text-ink-soft">
          {spent
            ? `${limit - violations} left before this submits automatically`
            : "Stay on this screen"}
        </span>
      )}
    </div>
  );
}

/** The warning, after a violation is counted. */
export function ViolationWarning({
  count,
  limit,
  kind,
  supported,
  onAcknowledge,
}: {
  count: number;
  limit: number;
  kind: ViolationKind;
  supported: boolean;
  onAcknowledge: () => void;
}) {
  const left = limit - count;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="violation-title"
      className="fixed inset-0 z-50 grid place-items-center bg-ink/80 px-5 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-xl border-2 border-ink bg-paper-pure p-7 shadow-[6px_6px_0_var(--coral)]">
        <p className="eyebrow text-coral">
          Warning {count} of {limit}
        </p>
        <h2
          id="violation-title"
          className="mt-3 font-display text-xl font-extrabold tracking-tight text-ink"
        >
          {VIOLATION_LABELS[kind]}
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Leaving the test screen is recorded.{" "}
          {left === 1
            ? "One more and this paper will be submitted automatically with whatever you've answered."
            : `You have ${left} left before this paper is submitted automatically.`}
        </p>

        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Nothing has been lost — your answers are saved.
        </p>

        <div className="mt-7">
          <Button size="lg" variant="ink" onClick={onAcknowledge}>
            {supported ? "Back to the paper" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
