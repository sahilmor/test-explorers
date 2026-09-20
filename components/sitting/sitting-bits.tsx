"use client";

import { CheckIcon, CloudOffIcon, LoaderIcon } from "lucide-react";
import { URGENT_MS, formatCountdown, type QuestionState } from "@/lib/attempts-shared";
import type { SaveStatus } from "@/components/sitting/use-autosave";
import { cn } from "cn";

/**
 * The countdown.
 *
 * Deliberately the loudest thing on the page. Under five minutes it goes coral
 * and the label changes — escalation a student catches out of the corner of
 * their eye, without anything flashing or jumping.
 */
export function Countdown({ msLeft }: { msLeft: number }) {
  const urgent = msLeft <= URGENT_MS;

  return (
    <div
      className={cn(
        "flex items-baseline gap-2 rounded-lg border-2 border-ink px-3 py-1.5",
        urgent ? "bg-coral" : "bg-paper-pure"
      )}
      role="timer"
      aria-live="off"
    >
      <span
        className={cn(
          "eyebrow",
          urgent ? "text-ink" : "text-ink-soft"
        )}
      >
        {urgent ? "Time left" : "Time left"}
      </span>
      <span
        className="font-mono text-xl font-bold tabular-nums text-ink"
        // Announced on its own schedule rather than every second.
        aria-label={`${formatCountdown(msLeft)} remaining`}
      >
        {formatCountdown(msLeft)}
      </span>
    </div>
  );
}

/**
 * The save indicator.
 *
 * It says "Saved" only when the server has confirmed the write. Anything else
 * — queued, in flight, retrying, refused — says so plainly. Telling a student
 * their work is safe when it is not is the one failure this screen must never
 * have.
 */
export function SaveIndicator({
  status,
  lastSavedAt,
}: {
  status: SaveStatus;
  lastSavedAt: Date | null;
}) {
  const styles: Record<SaveStatus, string> = {
    idle: "bg-paper-deep text-ink-soft",
    saving: "bg-paper-deep text-ink",
    saved: "bg-lime-wash text-ink",
    retrying: "bg-coral-wash text-danger",
    expired: "bg-coral text-ink",
  };

  const labels: Record<SaveStatus, string> = {
    idle: "Ready",
    saving: "Saving…",
    saved: "Saved",
    retrying: "Reconnecting…",
    expired: "Time up",
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 rounded-lg border-2 border-ink px-3 py-1.5",
        styles[status]
      )}
    >
      {status === "retrying" ? (
        <CloudOffIcon aria-hidden="true" className="size-4" />
      ) : status === "saving" ? (
        <LoaderIcon aria-hidden="true" className="size-4 animate-spin" />
      ) : (
        <CheckIcon aria-hidden="true" className="size-4" />
      )}

      <span className="font-display text-sm font-bold">{labels[status]}</span>

      {status === "saved" && lastSavedAt ? (
        <span className="hidden text-xs text-ink-soft sm:inline">
          {lastSavedAt.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </span>
      ) : null}

      {status === "retrying" ? (
        <span className="hidden text-xs sm:inline">your answers are kept</span>
      ) : null}
    </div>
  );
}

/*
 * Palette colours follow the convention students already know from NTA-style
 * exam software. Familiarity is the feature here: nobody should have to learn
 * a new legend under time pressure.
 *
 *   grey    not visited
 *   red     visited, left blank
 *   green   answered
 *   purple  marked for review
 */
const PALETTE_STYLES: Record<QuestionState, string> = {
  not_visited: "bg-paper-pure text-ink-soft border-ink/40",
  visited: "bg-[#E8442E] text-white border-ink",
  answered: "bg-[#1E8E3E] text-white border-ink",
  marked: "bg-[#6B34C9] text-white border-ink",
  answered_marked: "bg-[#6B34C9] text-white border-ink",
};

export const PALETTE_LEGEND: { state: QuestionState; label: string }[] = [
  { state: "answered", label: "Answered" },
  { state: "visited", label: "Not answered" },
  { state: "marked", label: "Marked for review" },
  { state: "not_visited", label: "Not visited" },
];

export function PaletteButton({
  index,
  state,
  current,
  onClick,
}: {
  index: number;
  state: QuestionState;
  current: boolean;
  onClick: () => void;
}) {
  const answeredAndMarked = state === "answered_marked";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={current ? "true" : undefined}
      aria-label={`Question ${index + 1}, ${state.replace(/_/g, " ")}`}
      className={cn(
        "relative grid size-10 place-items-center rounded-md border-2 font-display text-sm font-bold",
        "transition-transform duration-100",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cobalt/40",
        PALETTE_STYLES[state],
        current && "ring-4 ring-ink ring-offset-1 ring-offset-paper"
      )}
    >
      {index + 1}
      {answeredAndMarked ? (
        // A question can be both answered and flagged. The dot says so without
        // needing a fifth colour nobody would recognise.
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-ink bg-[#1E8E3E]"
        />
      ) : null}
    </button>
  );
}

export function PaletteSwatch({ state }: { state: QuestionState }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-4 rounded border-2", PALETTE_STYLES[state])}
    />
  );
}
