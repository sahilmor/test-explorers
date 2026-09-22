import { cn } from "cn";

/*
 * Outcome colours, deliberately the same three the Phase 5 question palette
 * uses — green for right, red for wrong, grey for never touched. A student who
 * has just sat the paper recognises them without a legend.
 */
export type Outcome = "correct" | "incorrect" | "unanswered";

export const OUTCOME_STYLES: Record<Outcome, string> = {
  correct: "bg-[#1E8E3E] text-white border-ink",
  incorrect: "bg-[#E8442E] text-white border-ink",
  unanswered: "bg-paper-deep text-ink-soft border-ink/40",
};

export const OUTCOME_LABELS: Record<Outcome, string> = {
  correct: "Correct",
  incorrect: "Wrong",
  unanswered: "Not answered",
};

export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border-2 px-2.5 py-0.5 font-display text-xs font-bold",
        OUTCOME_STYLES[outcome]
      )}
    >
      {OUTCOME_LABELS[outcome]}
    </span>
  );
}

/** A stat in a bordered box. Used across both result screens. */
export function Stat({
  label,
  value,
  tone = "paper",
  hint,
}: {
  label: string;
  value: string | number;
  tone?: "paper" | "correct" | "incorrect" | "muted";
  hint?: string;
}) {
  const styles = {
    paper: "bg-paper-pure",
    correct: "bg-[#DCF3E2]",
    incorrect: "bg-[#FDE2DE]",
    muted: "bg-paper-deep",
  }[tone];

  return (
    <div className={cn("rounded-xl border-2 border-ink px-4 py-4", styles)}>
      <p className="eyebrow text-ink-soft">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-extrabold tracking-tight text-ink">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-ink-soft">{hint}</p> : null}
    </div>
  );
}

/** "1h 04m" / "12m 30s" — how long a paper took. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** 1st, 2nd, 3rd, 4th… */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
