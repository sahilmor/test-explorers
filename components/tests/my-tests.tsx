"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClockIcon, LockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatWhen } from "@/components/tests/test-bits";
import { CLOSING_SOON_MS, humanGap } from "@/lib/tests-shared";
import { cn } from "cn";

export type StudentTest = {
  id: string;
  title: string;
  subjectName: string | null;
  durationMinutes: number;
  questionCount: number;
  opensAt: string;
  closesAt: string;
  state: "scheduled" | "open";
};

/**
 * A student's "My Tests".
 *
 * Three states, told apart by colour before you read a word:
 *
 *   scheduled  ink card, locked — you can see it coming, you cannot start it
 *   open       lime card — sit it now
 *   urgent     coral card — open, and closing within a couple of hours
 *
 * The clock is re-read every 30 seconds so a card crosses from "opens in 2
 * minutes" to startable, and from open to gone, without anyone refreshing.
 */
export function MyTests({ initial }: { initial: StudentTest[] }) {
  const [tests, setTests] = useState(initial);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Tick the clock, and re-fetch so a test that has just opened or closed is
    // re-evaluated by the server rather than guessed at here.
    const tick = setInterval(async () => {
      setNow(new Date());
      const res = await fetch("/api/student/tests");
      if (res.ok) setTests((await res.json()).tests);
    }, 30_000);

    return () => clearInterval(tick);
  }, []);

  // Recompute locally between fetches so the countdown does not sit stale for
  // up to 30 seconds.
  const live = tests
    .map((t) => {
      const opens = new Date(t.opensAt);
      const closes = new Date(t.closesAt);
      return {
        ...t,
        opens,
        closes,
        isOpen: now >= opens && now < closes,
        isClosed: now >= closes,
        msUntilClose: closes.getTime() - now.getTime(),
      };
    })
    .filter((t) => !t.isClosed);

  if (live.length === 0) {
    return (
      <EmptyState
        tone="cobalt"
        title="Nothing set right now"
        body="When a teacher sets a paper for your class it shows up here, with the time you have to sit it."
      />
    );
  }

  return (
    <ul className="grid gap-5 md:grid-cols-2">
      {live.map((t) => {
        const urgent = t.isOpen && t.msUntilClose <= CLOSING_SOON_MS;

        return (
          <li key={t.id}>
            <article
              className={cn(
                "flex h-full flex-col rounded-xl border-2 border-ink p-5 shadow-[5px_5px_0_var(--ink)]",
                urgent
                  ? "bg-coral"
                  : t.isOpen
                    ? "bg-lime"
                    : "bg-ink text-paper"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <p
                  className={cn(
                    "eyebrow",
                    t.isOpen ? "text-ink/70" : "text-lime"
                  )}
                >
                  {t.subjectName ?? "Test"}
                </p>

                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border-2 px-2.5 py-0.5 font-display text-xs font-bold",
                    urgent
                      ? "border-ink bg-ink text-coral"
                      : t.isOpen
                        ? "border-ink bg-paper-pure text-ink"
                        : "border-paper/40 bg-transparent text-paper/80"
                  )}
                >
                  {t.isOpen ? (
                    <>
                      <ClockIcon aria-hidden="true" className="size-3" />
                      {urgent ? "Closing soon" : "Open now"}
                    </>
                  ) : (
                    <>
                      <LockIcon aria-hidden="true" className="size-3" />
                      Not open yet
                    </>
                  )}
                </span>
              </div>

              <h3
                className={cn(
                  "mt-2 font-display text-xl font-extrabold tracking-tight",
                  t.isOpen ? "text-ink" : "text-paper"
                )}
              >
                {t.title}
              </h3>

              <p
                className={cn(
                  "mt-1 text-sm",
                  t.isOpen ? "text-ink/75" : "text-paper/70"
                )}
              >
                {t.questionCount} question{t.questionCount === 1 ? "" : "s"} ·{" "}
                {t.durationMinutes} minutes
              </p>

              <p
                className={cn(
                  "mt-4 font-display text-lg font-bold tracking-tight",
                  t.isOpen ? "text-ink" : "text-paper"
                )}
              >
                {t.isOpen
                  ? `Closes in ${humanGap(now, t.closes)}`
                  : `Opens in ${humanGap(now, t.opens)}`}
              </p>
              <p
                className={cn(
                  "text-xs",
                  t.isOpen ? "text-ink/70" : "text-paper/60"
                )}
              >
                {t.isOpen
                  ? `Closes ${formatWhen(t.closes)}`
                  : `Opens ${formatWhen(t.opens)}`}
              </p>

              <div className="mt-5 pt-1">
                {t.isOpen ? (
                  <Button
                    variant="ink"
                    size="lg"
                    className="w-full"
                    render={<Link href={`/student/tests/${t.id}`}>Start test</Link>}
                  />
                ) : (
                  <Button
                    variant="outline"
                    size="lg"
                    disabled
                    className="w-full"
                  >
                    Opens {formatWhen(t.opens)}
                  </Button>
                )}
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
