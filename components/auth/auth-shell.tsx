import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { BubbleGrid } from "@/components/brand/bubble-grid";
import { Marker } from "@/components/brand/marker";

/**
 * The two-panel auth layout.
 *
 * Left: a solid ink slab carrying the identity — oversized display headline
 * with a lime marker block behind one word, the answer-sheet motif, and three
 * plain-spoken proof points.
 *
 * Right: the form on warm paper.
 *
 * On phones the slab collapses to a short banner above the form so the
 * identity still lands without pushing the inputs below the fold.
 */
export function AuthShell({
  eyebrow,
  headline,
  highlight,
  blurb,
  points,
  accent = "lime",
  children,
}: {
  eyebrow: string;
  headline: string;
  highlight: string;
  blurb: string;
  points: string[];
  accent?: "lime" | "coral";
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ---------------- brand slab ---------------- */}
      <aside className="relative isolate overflow-hidden bg-ink px-6 py-8 text-paper sm:px-10 sm:py-10 lg:flex lg:min-h-dvh lg:flex-col lg:justify-between lg:py-14 xl:px-16">
        {/* Decorative shapes, kept mostly off-canvas so only an edge shows and
            nothing crosses the headline. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-44 -top-28 hidden size-80 rotate-12 rounded-[3rem] border-2 border-coral lg:block"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-20 bottom-[-5rem] hidden size-64 rounded-full bg-cobalt/25 lg:block"
        />

        <div className="relative flex items-center justify-between gap-4">
          <Wordmark tone="paper" />
          <BubbleGrid
            rows={2}
            cols={4}
            className="h-10 w-auto text-paper/70 lg:hidden"
          />
        </div>

        <div className="relative mt-7 lg:mt-0">
          <p className="eyebrow text-lime">{eyebrow}</p>

          <h1 className="mt-4 max-w-[13ch] text-display-xl font-extrabold text-paper">
            {headline} <Marker tone={accent}>{highlight}</Marker>
          </h1>

          <p className="mt-5 max-w-[42ch] text-base leading-relaxed text-paper/75 sm:mt-6 sm:text-lg">
            {blurb}
          </p>
        </div>

        <div className="relative mt-10 hidden lg:block">
          <ul className="space-y-3">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-[0.35rem] grid size-4 shrink-0 place-items-center rounded-full border-2 border-lime"
                >
                  <span className="size-1.5 rounded-full bg-lime" />
                </span>
                <span className="text-sm text-paper/80">{point}</span>
              </li>
            ))}
          </ul>

          <BubbleGrid
            rows={4}
            cols={7}
            className="mt-10 h-28 w-auto text-paper/45"
          />
        </div>
      </aside>

      {/* ---------------- form panel ---------------- */}
      <main className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10 lg:min-h-dvh lg:py-16">
        <div className="w-full max-w-[26rem]">{children}</div>
      </main>
    </div>
  );
}

/** Shared footer line under the auth forms. */
export function AuthSwitch({
  prompt,
  href,
  label,
}: {
  prompt: string;
  href: string;
  label: string;
}) {
  return (
    <p className="mt-8 text-sm text-ink-soft">
      {prompt}{" "}
      <Link
        href={href}
        className="font-display font-bold text-ink underline decoration-lime decoration-[3px] underline-offset-4 transition-colors hover:decoration-coral"
      >
        {label}
      </Link>
    </p>
  );
}
