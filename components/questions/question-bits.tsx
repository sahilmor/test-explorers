import { Pill } from "@/components/ui/data-table";
import type { Difficulty } from "@/lib/questions-shared";
import { cn } from "cn";

/**
 * Difficulty as a colour, not a word in a column — the list is meant to be
 * scanned, and three shades read faster than three words.
 *
 * Lime is the easy end and coral the hard end, matching how the rest of the
 * product uses those two.
 */
export function DifficultyBadge({ value }: { value: Difficulty }) {
  const styles: Record<Difficulty, string> = {
    easy: "bg-lime text-ink",
    medium: "bg-[#FFC93D] text-ink",
    hard: "bg-coral text-ink",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border-2 border-ink px-2.5 py-0.5 font-display text-xs font-bold capitalize",
        styles[value]
      )}
    >
      {value}
    </span>
  );
}

/** Subject as a cobalt tag, so it reads as a different axis from difficulty. */
export function SubjectTag({ name }: { name: string | null }) {
  if (!name) return <span className="text-ink-faint">—</span>;
  return <Pill tone="cobalt">{name}</Pill>;
}

/** A, B, C, D. */
export function OptionLetter({
  index,
  correct,
  className,
}: {
  index: number;
  correct?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full border-2 border-ink font-display text-xs font-extrabold",
        correct ? "bg-lime text-ink" : "bg-paper-deep text-ink-soft",
        className
      )}
    >
      {String.fromCharCode(65 + index)}
    </span>
  );
}
