import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { cn } from "cn";

/**
 * A card that is a link into another screen.
 *
 * The house slab with a coloured top bar, but it goes somewhere. `.tactile`
 * supplies the border, the hard shadow and the lift-on-hover /
 * slam-on-press, so a card behaves like every other control in the app
 * rather than inventing its own motion.
 */
export function NavCard({
  href,
  title,
  body,
  meta,
  tone = "lime",
}: {
  href: string;
  title: string;
  body: string;
  /** A number worth knowing before clicking — "12 papers", "0 questions". */
  meta?: ReactNode;
  tone?: "lime" | "coral" | "cobalt";
}) {
  const bar =
    tone === "lime" ? "bg-lime" : tone === "coral" ? "bg-coral" : "bg-cobalt";

  return (
    <Link
      href={href}
      className={cn(
        "tactile group relative block overflow-hidden rounded-xl bg-paper-pure p-6",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cobalt/40"
      )}
    >
      <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-2", bar)} />

      <h3 className="mt-2 flex items-center gap-2 font-display text-lg font-bold tracking-tight text-ink">
        {title}
        <ArrowRightIcon
          aria-hidden="true"
          className="size-4 transition-transform duration-150 ease-[var(--ease-snap)] group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
        />
      </h3>

      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{body}</p>

      {meta ? (
        <p className="eyebrow mt-4 inline-block rounded-full border-2 border-ink bg-paper-deep px-2.5 py-1 text-ink">
          {meta}
        </p>
      ) : null}
    </Link>
  );
}
