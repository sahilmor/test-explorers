import type { ReactNode } from "react";
import { BubbleGrid } from "@/components/brand/bubble-grid";
import { cn } from "cn";

/**
 * A brand-new school lands on four empty screens in a row, so the empty state
 * is the onboarding. Each one names the single next action rather than showing
 * an empty grid with a header.
 */
export function EmptyState({
  title,
  body,
  action,
  hint,
  tone = "lime",
  className,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  hint?: string;
  tone?: "lime" | "coral" | "cobalt";
  className?: string;
}) {
  const band =
    tone === "lime" ? "bg-lime" : tone === "coral" ? "bg-coral" : "bg-cobalt";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border-2 border-ink bg-paper-pure px-6 py-12 text-center shadow-[5px_5px_0_var(--ink)]",
        className
      )}
    >
      <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-2.5", band)} />

      <BubbleGrid
        rows={2}
        cols={5}
        className="mx-auto h-14 w-auto text-ink/25"
      />

      <h3 className="mt-6 font-display text-2xl font-bold tracking-tight text-ink">
        {title}
      </h3>
      <p className="mx-auto mt-2 max-w-[46ch] text-sm leading-relaxed text-ink-soft">
        {body}
      </p>

      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}

      {hint ? (
        <p className="mx-auto mt-4 max-w-[46ch] text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Shown when a search or filter matches nothing — distinct from "you have not
 * added anything yet", because the fix is different.
 */
export function NoMatches({
  what,
  onClear,
}: {
  what: string;
  onClear?: ReactNode;
}) {
  return (
    <div className="rounded-xl border-2 border-dashed border-ink/40 bg-paper-deep/60 px-6 py-10 text-center">
      <p className="font-display text-lg font-bold text-ink">
        No {what} match that.
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        Try a shorter search, or check the spelling.
      </p>
      {onClear ? <div className="mt-4 flex justify-center">{onClear}</div> : null}
    </div>
  );
}
