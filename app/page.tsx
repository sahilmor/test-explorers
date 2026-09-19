import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/wordmark";
import { BubbleGrid } from "@/components/brand/bubble-grid";
import { Marker } from "@/components/brand/marker";
import { HOME_FOR_ROLE, getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (session) redirect(HOME_FOR_ROLE[session.role]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b-2 border-ink">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Wordmark href={null} />
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" render={<Link href="/login">Sign in</Link>} />
            <Button size="sm" render={<Link href="/signup">Get started</Link>} />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 py-16 sm:px-8">
        <p className="eyebrow text-coral">For schools that still photocopy</p>

        <h1 className="mt-5 max-w-[16ch] text-display-2xl font-extrabold text-ink">
          Run your tests <Marker>online</Marker>
        </h1>

        <p className="mt-7 max-w-[52ch] text-lg leading-relaxed text-ink-soft">
          Set a paper once, send it to every class, and get the marking back
          before the bell. Built for a single school to run its own internal
          assessments — not a marketplace, not a MOOC.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Button size="xl" render={<Link href="/signup">Start your school</Link>} />
          <Button
            variant="outline"
            size="xl"
            render={<Link href="/login">I already have an account</Link>}
          />
        </div>

        <BubbleGrid rows={3} cols={10} className="mt-16 h-24 w-auto text-ink/30" />
      </main>

      <footer className="border-t-2 border-ink">
        <div className="mx-auto w-full max-w-6xl px-5 py-6 text-sm text-ink-soft sm:px-8">
          Phase 1 — accounts, roles and tenant isolation. Question bank and
          test-taking come next.
        </div>
      </footer>
    </div>
  );
}
