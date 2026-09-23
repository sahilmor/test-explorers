"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/data-table";
import {
  OutcomeBadge,
  Stat,
  formatDuration,
  ordinal,
} from "@/components/results/result-bits";
import type { StudentResult } from "@/lib/results";
import { cn } from "cn";

/**
 * A student's result.
 *
 * The score leads, because that is the thing they came for, and it counts up
 * on arrival — a small reveal rather than a number that was simply already
 * there. Everything else is underneath in the order they will want it:
 * breakdown, standing, then the paper itself with the answer key.
 */
export function StudentResultScreen({ result }: { result: StudentResult }) {
  // Starts at 0 and counts up. A score of 0 is already correct, so the effect
  // below simply does not run for it.
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (result.score === 0) return;

    // Roughly 700ms whatever the score, so a 40-mark paper does not crawl.
    const steps = Math.min(result.score, 40);
    const stepMs = Math.max(20, Math.round(700 / steps));
    let current = 0;

    const id = setInterval(() => {
      current += Math.max(1, Math.round(result.score / steps));
      if (current >= result.score) {
        setShown(result.score);
        clearInterval(id);
      } else {
        setShown(current);
      }
    }, stepMs);

    return () => clearInterval(id);
  }, [result.score]);

  const pct = result.percentage;

  return (
    <div className="space-y-10">
      {/* ---- the score ---- */}
      <section className="rounded-xl border-2 border-ink bg-paper-pure p-6 shadow-[5px_5px_0_var(--ink)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow text-coral">
              {result.test.subjectName ?? "Result"}
            </p>
            <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
              {result.test.title}
            </h1>
          </div>

          {result.attempt.autoSubmitReason === "integrity" ? (
            <Pill tone="danger">Submitted automatically</Pill>
          ) : result.attempt.status === "auto_submitted" ? (
            <Pill tone="coral">Ran out of time</Pill>
          ) : (
            <Pill tone="lime">Submitted</Pill>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-4">
          <p className="font-display text-display-2xl font-extrabold leading-none tracking-tight text-ink tabular-nums">
            {shown}
            <span className="text-ink-soft">/{result.totalQuestions}</span>
          </p>

          <div className="pb-2">
            <p className="font-display text-3xl font-extrabold tracking-tight text-ink">
              {pct}%
            </p>
            <p className="text-sm text-ink-soft">
              {ordinal(result.rank)} of {result.cohortSize} in{" "}
              {result.sectionName ?? "your class"}
            </p>
          </div>
        </div>

        {/* A bar rather than a ring: it reads at a glance and matches the
            teacher's histogram. */}
        <div
          className="mt-6 h-4 w-full overflow-hidden rounded-full border-2 border-ink bg-paper-deep"
          role="img"
          aria-label={`${pct} percent`}
        >
          <div
            className="h-full bg-lime transition-[width] duration-700 ease-out motion-reduce:transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>
      </section>

      {/* ---- breakdown ---- */}
      <section className="grid gap-4 sm:grid-cols-4">
        <Stat label="Correct" value={result.correctCount} tone="correct" />
        <Stat label="Wrong" value={result.incorrectCount} tone="incorrect" />
        <Stat label="Not answered" value={result.unansweredCount} tone="muted" />
        <Stat
          label="Time taken"
          value={formatDuration(result.attempt.timeTakenSeconds)}
        />
      </section>

      {/* ---- the paper ---- */}
      <section>
        <h2 className="font-display text-xl font-bold tracking-tight text-ink">
          Every question
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Your answer and the right one, side by side. This is the part worth
          reading.
        </p>

        <ol className="mt-5 space-y-4">
          {result.questions.map((q, index) => (
            <li
              key={q.id}
              className="rounded-xl border-2 border-ink bg-paper-pure p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="eyebrow text-ink-soft">Question {index + 1}</p>
                <OutcomeBadge outcome={q.outcome} />
              </div>

              <p className="mt-3 text-base leading-relaxed text-ink">{q.text}</p>

              {q.imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={q.imageUrl}
                  alt=""
                  className="mt-3 max-h-56 rounded-lg border-2 border-ink"
                />
              ) : null}

              <ul className="mt-4 space-y-2">
                {q.options.map((option, i) => {
                  const isCorrect = i === q.correctOptionIndex;
                  const isChosen = i === q.selectedOptionIndex;

                  return (
                    <li
                      key={i}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border-2 px-3 py-2.5",
                        isCorrect
                          ? "border-[#1E8E3E] bg-[#DCF3E2]"
                          : isChosen
                            ? "border-[#E8442E] bg-[#FDE2DE]"
                            : "border-ink/15 bg-paper-pure"
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "grid size-7 shrink-0 place-items-center rounded-full border-2 border-ink font-display text-xs font-extrabold",
                          isCorrect
                            ? "bg-[#1E8E3E] text-white"
                            : isChosen
                              ? "bg-[#E8442E] text-white"
                              : "bg-paper-deep text-ink-soft"
                        )}
                      >
                        {String.fromCharCode(65 + i)}
                      </span>

                      <span className="min-w-0 flex-1 text-sm text-ink">
                        {option}
                      </span>

                      {/* Labels as well as colour, so this reads correctly
                          without seeing the colours at all. */}
                      {isCorrect ? (
                        <span className="shrink-0 font-display text-xs font-bold text-[#1E8E3E]">
                          Correct answer
                        </span>
                      ) : null}
                      {isChosen && !isCorrect ? (
                        <span className="shrink-0 font-display text-xs font-bold text-[#E8442E]">
                          You chose this
                        </span>
                      ) : null}
                      {isChosen && isCorrect ? (
                        <span className="shrink-0 font-display text-xs font-bold text-[#1E8E3E]">
                          You chose this
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              {q.outcome === "unanswered" ? (
                <p className="mt-3 text-xs text-ink-soft">
                  You left this one blank.
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <div>
        <Button variant="outline" render={<Link href="/student">Back to my tests</Link>} />
      </div>
    </div>
  );
}
