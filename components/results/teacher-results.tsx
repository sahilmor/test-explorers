"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill, TableFrame, Td, Th, Tr } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { AdminHeader, SearchInput } from "@/components/admin/admin-page";
import { Stat, formatDuration } from "@/components/results/result-bits";
import type { QuestionAccuracy, StudentRow, TeacherResults } from "@/lib/results";
import { cn } from "cn";

type SortKey = "name" | "score" | "time";

export function TeacherResultsScreen({ results }: { results: TeacherResults }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [ascending, setAscending] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const students = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? results.students.filter(
          (s) =>
            s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
        )
      : results.students;

    const sorted = [...filtered].sort((a, b) => {
      // Students who never sat it always sink to the bottom, whatever the
      // sort — they are a different fact, not the lowest score.
      const aMissing = a.status === "not_attempted";
      const bMissing = b.status === "not_attempted";
      if (aMissing !== bMissing) return aMissing ? 1 : -1;

      let comparison = 0;
      if (sortKey === "name") comparison = a.name.localeCompare(b.name);
      else if (sortKey === "score")
        comparison = (a.percentage ?? -1) - (b.percentage ?? -1);
      else comparison = (a.timeTakenSeconds ?? -1) - (b.timeTakenSeconds ?? -1);

      return ascending ? comparison : -comparison;
    });

    return sorted;
  }, [results.students, search, sortKey, ascending]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setAscending((a) => !a);
    else {
      setSortKey(key);
      setAscending(key === "name");
    }
  }

  const noAttempts = results.summary.submitted === 0;
  const peak = Math.max(1, ...results.distribution.map((d) => d.count));

  return (
    <div className="space-y-10">
      <AdminHeader
        eyebrow={results.test.subjectName ?? "Results"}
        title={results.test.title}
        blurb={`${results.test.totalQuestions} questions · ${results.test.durationMinutes} minutes · closed`}
        action={
          <Button
            variant="outline"
            render={<Link href="/teacher/tests">All tests</Link>}
          />
        }
      />

      {noAttempts ? (
        <EmptyState
          tone="cobalt"
          title="Nobody has sat this yet"
          body={
            results.summary.assigned === 0
              ? "This paper isn't assigned to a section, so no students can see it. Assign it from the tests list."
              : `It's set for ${results.summary.assigned} student${results.summary.assigned === 1 ? "" : "s"}. Results appear here as they hand in.`
          }
        />
      ) : (
        <>
          {/* ---- summary ---- */}
          <section className="grid gap-4 sm:grid-cols-4">
            <Stat
              label="Submitted"
              value={`${results.summary.submitted} / ${results.summary.assigned}`}
              hint={
                results.summary.notAttempted > 0
                  ? `${results.summary.notAttempted} never started`
                  : "everyone sat it"
              }
            />
            <Stat
              label="Class average"
              value={`${results.summary.averagePercentage ?? 0}%`}
            />
            <Stat
              label="Highest"
              value={`${results.summary.highest ?? 0}%`}
              tone="correct"
            />
            <Stat
              label="Lowest"
              value={`${results.summary.lowest ?? 0}%`}
              tone="incorrect"
            />
          </section>

          {/* ---- distribution ---- */}
          <section>
            <h2 className="font-display text-xl font-bold tracking-tight text-ink">
              Score distribution
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              How many students landed in each band.
            </p>

            <div className="mt-5 rounded-xl border-2 border-ink bg-paper-pure p-5">
              {/* The columns stretch to the full 48 so each bar has a definite
                  height to size itself against, and the bar is positioned from
                  the bottom of its own track. Letting the column shrink-wrap
                  its content instead leaves the percentage height resolving
                  against nothing, and every bar collapses to a hairline. */}
              <div className="flex h-48 items-stretch gap-1.5 sm:gap-2">
                {results.distribution.map((bucket) => {
                  // Caps at 88 rather than 100 so the count sitting just above
                  // the tallest bar still has room inside the track.
                  const height =
                    bucket.count > 0
                      ? Math.max(6, (bucket.count / peak) * 88)
                      : 0;

                  // Low bands coral, high bands lime — the same reading as
                  // everywhere else in the app.
                  const tone =
                    bucket.to <= 40
                      ? "bg-coral"
                      : bucket.to <= 70
                        ? "bg-[#FFC93D]"
                        : "bg-lime";

                  return (
                    <div
                      key={bucket.label}
                      className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
                    >
                      <div className="relative w-full flex-1">
                        <span
                          className="absolute inset-x-0 text-center font-display text-xs font-bold text-ink"
                          style={{ bottom: `calc(${height}% + 0.3rem)` }}
                        >
                          {bucket.count > 0 ? bucket.count : ""}
                        </span>
                        <div
                          className={cn(
                            "absolute inset-x-0 bottom-0 rounded-t border-2 border-ink transition-[height] duration-500 motion-reduce:transition-none",
                            bucket.count > 0 ? tone : "bg-paper-deep"
                          )}
                          style={{ height: bucket.count > 0 ? `${height}%` : "4px" }}
                          role="img"
                          aria-label={`${bucket.count} students scored ${bucket.label} percent`}
                        />
                      </div>
                      <span className="w-full truncate text-center text-[0.6rem] text-ink-soft">
                        {bucket.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ---- per-question accuracy, worst first ---- */}
          <section>
            <h2 className="font-display text-xl font-bold tracking-tight text-ink">
              Where the class struggled
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Every question, worst first. The bar is the share of students who
              got it right.
            </p>

            <ol className="mt-5 space-y-2.5">
              {results.questions.map((q, position) => (
                <QuestionRow
                  key={q.id}
                  question={q}
                  worst={position < 3 && q.accuracy < 60}
                  open={expanded === q.id}
                  onToggle={() => setExpanded(expanded === q.id ? null : q.id)}
                  cohort={results.summary.submitted}
                />
              ))}
            </ol>
          </section>

          {/* ---- the table ---- */}
          <section>
            <h2 className="font-display text-xl font-bold tracking-tight text-ink">
              Every student
            </h2>

            <div className="mt-4">
              <SearchInput
                label="Search students"
                placeholder="Search by name or email…"
                value={search}
                onChange={setSearch}
                className="max-w-md"
              />
            </div>

            <div className="mt-4">
              <TableFrame
                head={
                  <tr>
                    <SortableTh
                      label="Student"
                      active={sortKey === "name"}
                      ascending={ascending}
                      onClick={() => toggleSort("name")}
                    />
                    <SortableTh
                      label="Score"
                      active={sortKey === "score"}
                      ascending={ascending}
                      onClick={() => toggleSort("score")}
                    />
                    <Th>Status</Th>
                    <SortableTh
                      label="Time taken"
                      active={sortKey === "time"}
                      ascending={ascending}
                      onClick={() => toggleSort("time")}
                    />
                  </tr>
                }
              >
                {students.map((row) => (
                  <StudentResultRow key={row.studentId} row={row} />
                ))}
              </TableFrame>
            </div>

            <p className="mt-3 text-sm text-ink-soft">
              Showing {students.length} of {results.students.length} student
              {results.students.length === 1 ? "" : "s"}.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

function SortableTh({
  label,
  active,
  ascending,
  onClick,
}: {
  label: string;
  active: boolean;
  ascending: boolean;
  onClick: () => void;
}) {
  return (
    <Th ariaSort={active ? (ascending ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 hover:underline"
      >
        {label}
        {active ? (
          ascending ? (
            <ArrowUpIcon aria-hidden="true" className="size-3" />
          ) : (
            <ArrowDownIcon aria-hidden="true" className="size-3" />
          )
        ) : null}
      </button>
    </Th>
  );
}

function StudentResultRow({ row }: { row: StudentRow }) {
  const missing = row.status === "not_attempted";

  return (
    <Tr className={missing ? "bg-paper-deep/40" : undefined}>
      <Td>
        <span className="font-display font-bold">{row.name}</span>
        <span className="block text-xs text-ink-soft">{row.email}</span>
      </Td>
      <Td>
        {missing ? (
          <span className="text-ink-faint">—</span>
        ) : (
          <span className="font-display font-bold">
            {row.score}/{row.totalQuestions}{" "}
            <span className="text-ink-soft">({row.percentage}%)</span>
          </span>
        )}
      </Td>
      <Td>
        {missing ? (
          <Pill>Not attempted</Pill>
        ) : row.status === "auto_submitted" ? (
          <Pill tone="coral">Auto-submitted</Pill>
        ) : (
          <Pill tone="lime">Submitted</Pill>
        )}
      </Td>
      <Td className="text-ink-soft">{formatDuration(row.timeTakenSeconds)}</Td>
    </Tr>
  );
}

/**
 * One question's accuracy.
 *
 * The three worst under 60% get a coral left edge and a "look here" flag, so
 * the screen reads as a recommendation rather than a sorted list. Everything
 * else stays quiet.
 */
function QuestionRow({
  question,
  worst,
  open,
  onToggle,
  cohort,
}: {
  question: QuestionAccuracy;
  worst: boolean;
  open: boolean;
  onToggle: () => void;
  cohort: number;
}) {
  const bar =
    question.accuracy < 40
      ? "bg-coral"
      : question.accuracy < 70
        ? "bg-[#FFC93D]"
        : "bg-lime";

  return (
    <li
      className={cn(
        "overflow-hidden rounded-xl border-2 bg-paper-pure",
        worst ? "border-coral shadow-[4px_4px_0_var(--coral)]" : "border-ink/25"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-4 p-4 text-left"
      >
        <span
          aria-hidden="true"
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-full border-2 border-ink font-display text-sm font-bold",
            worst ? "bg-coral text-ink" : "bg-paper-deep text-ink-soft"
          )}
        >
          {question.position}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            {worst ? (
              <span className="eyebrow rounded-full border-2 border-ink bg-coral px-2 py-0.5 text-ink">
                Look here first
              </span>
            ) : null}
            <span className="font-display text-sm font-bold text-ink">
              {question.accuracy}% got it right
            </span>
            <span className="text-xs text-ink-soft">
              {question.correct} of {cohort} · {question.unanswered} left blank
            </span>
          </span>

          <span className="mt-1.5 block truncate text-sm text-ink-soft">
            {question.text}
          </span>

          <span className="mt-2 block h-2.5 w-full overflow-hidden rounded-full border-2 border-ink bg-paper-deep">
            <span
              className={cn("block h-full", bar)}
              style={{ width: `${question.accuracy}%` }}
            />
          </span>
        </span>
      </button>

      {open ? (
        <div className="border-t-2 border-ink/15 px-4 pb-4 pt-3">
          <p className="text-sm leading-relaxed text-ink">{question.text}</p>
          <ul className="mt-3 space-y-1.5">
            {question.options.map((option, i) => (
              <li
                key={i}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border-2 px-3 py-2 text-sm",
                  i === question.correctOptionIndex
                    ? "border-[#1E8E3E] bg-[#DCF3E2] text-ink"
                    : "border-ink/15 text-ink-soft"
                )}
              >
                <span className="font-display text-xs font-bold">
                  {String.fromCharCode(65 + i)}
                </span>
                {option}
                {i === question.correctOptionIndex ? (
                  <span className="ml-auto font-display text-xs font-bold text-[#1E8E3E]">
                    Correct answer
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}
