"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { SearchInput, SelectInput } from "@/components/admin/admin-page";
import { DifficultyBadge } from "@/components/questions/question-bits";
import { DIFFICULTIES, type Difficulty } from "@/lib/questions-shared";
import { cn } from "cn";

type PickableQuestion = {
  id: string;
  text: string;
  difficulty: Difficulty;
  options: string[];
  correctOptionIndex: number;
};

type Page = {
  questions: PickableQuestion[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

/**
 * Multi-select over the question bank.
 *
 * The Phase 3 list, with the row's edit/delete actions replaced by a selection
 * state. The whole row is the control — clicking anywhere on it toggles — and
 * a selected row goes lime with a hard shadow and a filled tick, matching how
 * the "correct option" affordance works on the question form.
 *
 * The running count sits above the list and stays put while you scroll, so the
 * answer to "how many have I got?" is never more than a glance away.
 */
export function QuestionPicker({
  subjectId,
  selected,
  onChange,
  disabledReason,
}: {
  subjectId: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  disabledReason?: string;
}) {
  const [data, setData] = useState<Page | null>(null);
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (opts?: { page?: number }) => {
      if (!subjectId) {
        setData(null);
        return;
      }

      const params = new URLSearchParams({ subjectId, pageSize: "10" });
      if (search.trim()) params.set("q", search.trim());
      if (difficulty) params.set("difficulty", difficulty);
      params.set("page", String(opts?.page ?? page));

      setLoading(true);
      const res = await fetch(`/api/questions?${params}`);
      if (res.ok) setData(await res.json());
      setLoading(false);
    },
    [subjectId, search, difficulty, page]
  );

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      void load();
      return;
    }
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  // Changing the subject invalidates the whole selection, because a paper is
  // built from one subject's bank.
  const lastSubject = useRef(subjectId);
  useEffect(() => {
    if (lastSubject.current !== subjectId) {
      lastSubject.current = subjectId;
      setPage(1);
      setSearch("");
      setDifficulty("");
    }
  }, [subjectId]);

  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id]
    );
  }

  function selectAllOnPage() {
    const ids = (data?.questions ?? []).map((q) => q.id);
    const merged = new Set([...selected, ...ids]);
    onChange([...merged]);
  }

  if (disabledReason) {
    return <FormError>{disabledReason}</FormError>;
  }

  return (
    <div className="space-y-4">
      {/* ---- running count ---- */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border-2 border-ink bg-lime-wash px-4 py-3 shadow-[3px_3px_0_var(--ink)]">
        <p className="font-display text-lg font-extrabold tracking-tight text-ink">
          {selected.length} of {data?.total ?? 0} selected
        </p>
        {selected.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange([])}
          >
            Clear selection
          </Button>
        ) : null}
        {(data?.questions.length ?? 0) > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={selectAllOnPage}
          >
            Select all on this page
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchInput
          label="Search questions"
          placeholder="Search question text…"
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          className="flex-1"
        />
        <SelectInput
          id="picker-difficulty"
          label="Filter by difficulty"
          srOnlyLabel
          value={difficulty}
          onChange={(v) => {
            setDifficulty(v);
            setPage(1);
          }}
          className="sm:w-44"
        >
          <option value="">Any difficulty</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {d[0].toUpperCase() + d.slice(1)}
            </option>
          ))}
        </SelectInput>
      </div>

      {data && data.questions.length === 0 ? (
        <p className="rounded-lg border-2 border-dashed border-ink/40 bg-paper-deep/60 px-4 py-6 text-center text-sm text-ink-soft">
          {search || difficulty
            ? "No questions match that. Try a broader filter."
            : "This subject's bank is empty. Add questions to it first."}
        </p>
      ) : null}

      <ul
        className={cn(
          "flex flex-col gap-2",
          loading && "opacity-60 transition-opacity"
        )}
      >
        {(data?.questions ?? []).map((q) => {
          const on = selected.includes(q.id);

          return (
            <li key={q.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3",
                  "transition-all duration-150 ease-[var(--ease-snap)]",
                  "motion-reduce:transform-none",
                  on
                    ? "-translate-x-[2px] -translate-y-[2px] border-ink bg-lime-wash shadow-[4px_4px_0_var(--ink)]"
                    : "border-ink/25 bg-paper-pure hover:border-ink/60 hover:bg-paper-deep/40",
                  "has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-cobalt/40"
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(q.id)}
                  className="sr-only"
                />

                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border-2 border-ink transition-colors",
                    on ? "bg-lime text-ink" : "bg-paper-pure text-transparent"
                  )}
                >
                  <CheckIcon className="size-4" strokeWidth={3} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block font-display font-bold text-ink">
                    {q.text}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-2">
                    <DifficultyBadge value={q.difficulty} />
                    <span className="text-xs text-ink-soft">
                      Answer:{" "}
                      {String.fromCharCode(65 + q.correctOptionIndex)} —{" "}
                      {q.options[q.correctOptionIndex]}
                    </span>
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {data && data.pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink-soft">
            Showing {(data.page - 1) * data.pageSize + 1}–
            {Math.min(data.page * data.pageSize, data.total)} of {data.total}
          </p>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={data.page <= 1 || loading}
              onClick={() => {
                const next = data.page - 1;
                setPage(next);
                void load({ page: next });
              }}
            >
              Previous
            </Button>
            <span className="font-display text-sm font-bold text-ink">
              {data.page} / {data.pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={data.page >= data.pageCount || loading}
              onClick={() => {
                const next = data.page + 1;
                setPage(next);
                void load({ page: next });
              }}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
