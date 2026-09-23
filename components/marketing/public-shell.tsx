import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/wordmark";
import { APP_NAME } from "@/lib/brand";

const NAV = [
  { href: "/pricing", label: "Pricing" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;

/**
 * The frame every public page shares.
 *
 * Separate from `AppShell`, which carries a role badge and a sign-out button
 * that make no sense to someone who has never signed in — but built from the
 * same border, the same wordmark and the same buttons, so crossing from the
 * marketing site into the product does not feel like changing products.
 */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-paper/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 py-3.5 sm:px-8">
          <Wordmark />

          <nav aria-label="Site" className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 font-display text-sm font-bold tracking-tight text-ink-soft transition-colors hover:bg-lime-wash hover:text-ink focus-visible:bg-lime-wash focus-visible:outline-none"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="sm" render={<Link href="/login">Sign in</Link>} />
            <Button size="sm" render={<Link href="/signup">Get started</Link>} />
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t-2 border-ink bg-ink text-paper">
        <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-8">
            <div className="max-w-sm">
              <Wordmark href="/" tone="paper" />
              <p className="mt-4 text-sm leading-relaxed text-paper/60">
                Internal assessments for one school, run online. Not a
                marketplace, not a course platform, not a proctoring company.
              </p>
            </div>

            <nav aria-label="Footer" className="flex flex-wrap gap-x-10 gap-y-6">
              <FooterColumn
                title="Product"
                links={[
                  { href: "/pricing", label: "Pricing" },
                  { href: "/signup", label: "Start a school" },
                  { href: "/login", label: "Sign in" },
                ]}
              />
              <FooterColumn
                title="Legal"
                links={[
                  { href: "/privacy", label: "Privacy policy" },
                  { href: "/terms", label: "Terms of service" },
                ]}
              />
            </nav>
          </div>

          <p className="mt-10 border-t-2 border-paper/15 pt-6 text-xs text-paper/45">
            © {new Date().getFullYear()} {APP_NAME}. Built for schools that
            would rather not photocopy another answer sheet.
          </p>
        </div>
      </footer>
    </div>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <p className="eyebrow text-lime">{title}</p>
      <ul className="mt-3 space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="rounded text-sm text-paper/75 underline-offset-4 transition-colors hover:text-paper hover:underline focus-visible:text-paper focus-visible:underline focus-visible:outline-none"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
