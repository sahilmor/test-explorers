import Link from "next/link";
import { cn } from "cn";

/**
 * The lockup: a filled answer bubble followed by the name. The bubble is the
 * product's one repeated motif — an OMR mark, because that is what this
 * replaces.
 */
export function Wordmark({
  tone = "ink",
  href = "/",
  className,
}: {
  tone?: "ink" | "paper";
  href?: string | null;
  className?: string;
}) {
  const content = (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 font-display font-extrabold tracking-[-0.03em]",
        tone === "paper" ? "text-paper" : "text-ink",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full border-2",
          tone === "paper" ? "border-paper" : "border-ink"
        )}
      >
        <span className="size-3 rounded-full bg-lime" />
      </span>
      <span className="text-lg leading-none">
        Test<span className="text-coral">Manager</span>
      </span>
    </span>
  );

  if (!href) return content;

  return (
    <Link
      href={href}
      className="rounded-md outline-none focus-visible:ring-4 focus-visible:ring-cobalt/40"
    >
      {content}
    </Link>
  );
}
