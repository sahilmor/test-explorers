import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * Highlighter block behind a word or phrase in a headline.
 *
 * Implemented as a background on the inline text with `box-decoration-break:
 * clone` rather than an absolutely-positioned rectangle, so the block always
 * hugs the glyphs — including when the phrase wraps onto a second line or the
 * headline sits in a narrow column. An absolute block cannot do either.
 */
export function Marker({
  children,
  tone = "lime",
  className,
}: {
  children: ReactNode;
  tone?: "lime" | "coral" | "cobalt";
  className?: string;
}) {
  const bg =
    tone === "lime"
      ? "bg-lime text-ink"
      : tone === "coral"
        ? "bg-coral text-ink"
        : "bg-cobalt text-white";

  return (
    <span
      className={cn(
        "box-decoration-clone rounded-md px-[0.14em] py-[0.02em]",
        bg,
        className
      )}
    >
      {children}
    </span>
  );
}
