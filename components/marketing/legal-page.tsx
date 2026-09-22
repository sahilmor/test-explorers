import type { ReactNode } from "react";
import { PublicShell } from "@/components/marketing/public-shell";

/**
 * The frame for the privacy policy and the terms.
 *
 * Long prose in the house type, narrower than the marketing pages because
 * nobody reads a 100-character measure. The "needs your details" callout is
 * deliberately part of the template rather than something to remember to add:
 * these documents describe the software accurately, but only the operator can
 * supply the legal entity behind them.
 */
export function LegalPage({
  title,
  updated,
  summary,
  children,
}: {
  title: string;
  updated: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <PublicShell>
      <article className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
        <p className="eyebrow text-coral">Legal</p>
        <h1 className="mt-4 text-display-lg font-extrabold text-ink">{title}</h1>
        <p className="mt-4 text-sm text-ink-soft">Last updated {updated}</p>
        <p className="mt-6 max-w-[62ch] text-lg leading-relaxed text-ink-soft">
          {summary}
        </p>

        <div className="mt-8 rounded-xl border-2 border-ink bg-cobalt-wash px-5 py-4">
          <p className="text-sm leading-relaxed text-ink">
            <strong className="font-display font-bold">
              Before you take this live:
            </strong>{" "}
            this document accurately describes how the software behaves, but the
            operating company&apos;s name, address and contact details still need
            filling in, and a lawyer in your jurisdiction should read it. Schools
            handling children&apos;s data will ask, and they should.
          </p>
        </div>

        <div className="legal mt-12 space-y-10">{children}</div>
      </article>
    </PublicShell>
  );
}

export function Clause({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
        {heading}
      </h2>
      <div className="mt-3 space-y-3.5 leading-relaxed text-ink-soft [&_a]:text-cobalt [&_a]:underline [&_a]:underline-offset-4 [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-display [&_strong]:font-bold [&_strong]:text-ink [&_ul]:space-y-2">
        {children}
      </div>
    </section>
  );
}

/** A placeholder only the operator can fill in. Visibly unfinished on purpose. */
export function Fill({ children }: { children: ReactNode }) {
  return (
    <mark className="rounded border-2 border-dashed border-coral bg-coral-wash px-1.5 py-0.5 font-display text-[0.85em] font-bold text-ink">
      {children}
    </mark>
  );
}
