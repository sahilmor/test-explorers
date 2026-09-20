import type { TestState } from "@/lib/tests-shared";
import { cn } from "cn";

/**
 * Test state as a colour, the same pattern as the Phase 3 difficulty badge.
 *
 * Draft is deliberately the quietest — a paper nobody can see yet should not
 * shout as loudly as one a class is sitting right now.
 */
export function TestStateBadge({ state }: { state: TestState }) {
  const styles: Record<TestState, string> = {
    draft: "bg-paper-deep text-ink-soft",
    scheduled: "bg-cobalt text-white",
    open: "bg-lime text-ink",
    closed: "bg-coral text-ink",
  };

  const labels: Record<TestState, string> = {
    draft: "Draft",
    scheduled: "Scheduled",
    open: "Open now",
    closed: "Closed",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border-2 border-ink px-2.5 py-0.5 font-display text-xs font-bold",
        styles[state]
      )}
    >
      {labels[state]}
    </span>
  );
}

/** Date + time, in the viewer's own locale. */
export function formatWhen(value: Date | string): string {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
