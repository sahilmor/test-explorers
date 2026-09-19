"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { TableFrame, Td, Th, Tr } from "@/components/ui/data-table";
import { EmptyState, NoMatches } from "@/components/ui/empty-state";
import {
  AdminHeader,
  RowAction,
  SearchInput,
  SelectInput,
  SuccessNote,
} from "@/components/admin/admin-page";
import {
  DifficultyBadge,
  OptionLetter,
  SubjectTag,
} from "@/components/questions/question-bits";
import {
  EMPTY_DRAFT,
  QuestionForm,
  type QuestionDraft,
  type SubjectOption,
} from "@/components/questions/question-form";
import { QuestionCsvImport } from "@/components/questions/question-csv-import";
import { DIFFICULTIES, type Difficulty } from "@/lib/questions-shared";
import { cn } from "cn";

export type QuestionRow = {
  id: string;
  subjectId: string;
  subjectName: string | null;
  text: string;
  imageUrl: string | null;
  options: string[];
  correctOptionIndex: number;
  difficulty: Difficulty;
};

export type SubjectCount = {
  subjectId: string;
  subjectName: string;
  count: number;
};

export type QuestionPage = {
  questions: QuestionRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export function QuestionBankScreen({
  initial,
  subjects,
  initialCounts,
}: {
  initial: QuestionPage;
  subjects: SubjectOption[];
  initialCounts: SubjectCount[];
}) {
  const [data, setData] = useState(initial);
  const [counts, setCounts] = useState(initialCounts);

  const [search, setSearch] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [page, setPage] = useState(1);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [draft, setDraft] = useState<QuestionDraft | null>(null);
  const [deleting, setDeleting] = useState<QuestionRow | null>(null);
  const [importing, setImporting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // The bank can run to thousands of questions, so filtering happens on the
  // server and the list is paged. That means a request per change rather than
  // per keystroke — hence the debounce below.
  const load = useCallback(
    async (opts?: { page?: number }) => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (subjectId) params.set("subjectId", subjectId);
      if (difficulty) params.set("difficulty", difficulty);
      params.set("page", String(opts?.page ?? page));

      setLoading(true);
      const res = await fetch(`/api/questions?${params}`);
      if (res.ok) setData(await res.json());
      setLoading(false);
    },
    [search, subjectId, difficulty, page]
  );

  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  // A filter change starts again from page 1; otherwise a narrow filter can
  // land you on a page that no longer exists.
  function changeFilter(fn: () => void) {
    fn();
    setPage(1);
  }

  async function refreshCounts() {
    const res = await fetch("/api/questions/summary");
    if (res.ok) setCounts((await res.json()).subjects);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;

    setBusy(true);
    setFieldErrors({});
    setFormError(null);

    const editing = Boolean(draft.id);
    const res = await fetch(
      editing ? `/api/questions/${draft.id}` : "/api/questions",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectId: draft.subjectId,
          text: draft.text,
          options: draft.options,
          correctOptionIndex: draft.correctOptionIndex,
          difficulty: draft.difficulty,
          imageUrl: draft.imageUrl ?? undefined,
        }),
      }
    );
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      setFieldErrors(payload.fields ?? {});
      setFormError(payload.fields ? null : (payload.error ?? "That didn't work."));
      setBusy(false);
      return;
    }

    await Promise.all([load(), refreshCounts()]);
    setNote(editing ? "Question saved." : "Question added to the bank.");
    setDraft(null);
    setBusy(false);
  }

  async function confirmDelete() {
    if (!deleting) return;

    setBusy(true);
    setFormError(null);

    const res = await fetch(`/api/questions/${deleting.id}`, { method: "DELETE" });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      setFormError(payload.error ?? "Could not delete that question.");
      setBusy(false);
      return;
    }

    await Promise.all([load(), refreshCounts()]);
    setNote("Question deleted.");
    setDeleting(null);
    setBusy(false);
  }

  const filtering = Boolean(search.trim() || subjectId || difficulty);
  const totalInBank = counts.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="space-y-8">
      <AdminHeader
        eyebrow="Question bank"
        title="Questions"
        blurb="Multiple-choice questions to build papers from. Write them once, reuse them every term."
        action={
          totalInBank > 0 ? (
            <>
              <Button variant="outline" onClick={() => setImporting(true)}>
                Import CSV
              </Button>
              <Button onClick={() => setDraft(EMPTY_DRAFT)}>Add question</Button>
            </>
          ) : undefined
        }
      />

      {/* ---- count per subject ---- */}
      {counts.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {counts.map((c) => {
            const active = subjectId === c.subjectId;
            return (
              <button
                key={c.subjectId}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  changeFilter(() =>
                    setSubjectId(active ? "" : c.subjectId)
                  )
                }
                className={cn(
                  "rounded-full border-2 border-ink px-3 py-1.5 font-display text-xs font-bold transition-all duration-150 ease-[var(--ease-snap)]",
                  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cobalt/40",
                  "motion-reduce:transform-none",
                  active
                    ? "-translate-x-[1px] -translate-y-[1px] bg-cobalt text-white shadow-[3px_3px_0_var(--ink)]"
                    : c.count === 0
                      ? "bg-paper-deep text-ink-faint hover:text-ink-soft"
                      : "bg-paper-pure text-ink hover:bg-lime-wash"
                )}
              >
                {c.subjectName}{" "}
                <span className={active ? "text-white/80" : "text-ink-soft"}>
                  {c.count}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {note ? <SuccessNote onDismiss={() => setNote(null)}>{note}</SuccessNote> : null}

      {subjects.length === 0 ? (
        <EmptyState
          tone="coral"
          title="No subjects yet"
          body="Questions belong to a subject, so your school needs at least one before the bank can hold anything. An admin adds them on the Subjects tab."
        />
      ) : totalInBank === 0 ? (
        <EmptyState
          title="Your question bank is empty"
          body="Import a spreadsheet to fill a subject in one go, or write questions one at a time. Either way you only do it once — papers get built from this later."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button size="lg" onClick={() => setImporting(true)}>
                Import a CSV
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => setDraft(EMPTY_DRAFT)}
              >
                Write one question
              </Button>
            </div>
          }
          hint="The CSV needs subject, question, the four options, the correct letter and a difficulty."
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchInput
              label="Search questions"
              placeholder="Search question text…"
              value={search}
              onChange={(v) => changeFilter(() => setSearch(v))}
              className="flex-1"
            />
            <SelectInput
              id="subject-filter"
              label="Filter by subject"
              srOnlyLabel
              value={subjectId}
              onChange={(v) => changeFilter(() => setSubjectId(v))}
              className="sm:w-52"
            >
              <option value="">All subjects</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectInput>
            <SelectInput
              id="difficulty-filter"
              label="Filter by difficulty"
              srOnlyLabel
              value={difficulty}
              onChange={(v) => changeFilter(() => setDifficulty(v))}
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

          {data.questions.length === 0 ? (
            <NoMatches
              what="questions"
              onClear={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    changeFilter(() => {
                      setSearch("");
                      setSubjectId("");
                      setDifficulty("");
                    })
                  }
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <TableFrame
              className={loading ? "opacity-60 transition-opacity" : undefined}
              head={
                <tr>
                  <Th>Question</Th>
                  <Th>Subject</Th>
                  <Th>Difficulty</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              }
            >
              {data.questions.map((row) => {
                const open = expanded === row.id;

                return (
                  <Tr key={row.id}>
                    <Td className="max-w-[28rem] align-top">
                      <button
                        type="button"
                        onClick={() => setExpanded(open ? null : row.id)}
                        aria-expanded={open}
                        className="group flex w-full items-start gap-2 text-left"
                      >
                        <ChevronDownIcon
                          aria-hidden="true"
                          className={cn(
                            "mt-0.5 size-4 shrink-0 text-ink-soft transition-transform",
                            open && "rotate-180"
                          )}
                        />
                        <span
                          className={cn(
                            "font-display font-bold group-hover:underline",
                            !open && "line-clamp-2"
                          )}
                        >
                          {row.text}
                        </span>
                      </button>

                      {open ? (
                        <div className="mt-3 space-y-2 pl-6">
                          {row.imageUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={row.imageUrl}
                              alt=""
                              className="max-h-40 rounded border-2 border-ink"
                            />
                          ) : null}
                          {row.options.map((option, i) => (
                            <div key={i} className="flex items-start gap-2.5">
                              <OptionLetter
                                index={i}
                                correct={i === row.correctOptionIndex}
                              />
                              <span
                                className={cn(
                                  "pt-1 text-sm",
                                  i === row.correctOptionIndex
                                    ? "font-bold text-ink"
                                    : "text-ink-soft"
                                )}
                              >
                                {option}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </Td>
                    <Td className="align-top">
                      <SubjectTag name={row.subjectName} />
                    </Td>
                    <Td className="align-top">
                      <DifficultyBadge value={row.difficulty} />
                    </Td>
                    <Td className="text-right align-top">
                      <div className="flex justify-end gap-1">
                        <RowAction
                          onClick={() =>
                            setDraft({
                              id: row.id,
                              subjectId: row.subjectId,
                              text: row.text,
                              options: [...row.options],
                              correctOptionIndex: row.correctOptionIndex,
                              difficulty: row.difficulty,
                              imageUrl: row.imageUrl,
                            })
                          }
                        >
                          Edit
                        </RowAction>
                        <RowAction tone="danger" onClick={() => setDeleting(row)}>
                          Delete
                        </RowAction>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </TableFrame>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-ink-soft">
              {data.total === 0
                ? "No questions match."
                : `Showing ${(data.page - 1) * data.pageSize + 1}–${Math.min(
                    data.page * data.pageSize,
                    data.total
                  )} of ${data.total}`}
              {filtering ? " (filtered)" : ""}.
            </p>

            {data.pageCount > 1 ? (
              <div className="flex items-center gap-3">
                <Button
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
            ) : null}
          </div>
        </>
      )}

      {/* ---- add / edit ---- */}
      <Modal
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDraft(null);
            setFieldErrors({});
            setFormError(null);
          }
        }}
        size="wide"
        title={draft?.id ? "Edit question" : "Add a question"}
        description="Four options, one correct. Click the option that's right."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="question-form" disabled={busy}>
              {busy ? "Saving…" : draft?.id ? "Save changes" : "Add question"}
            </Button>
          </>
        }
      >
        {draft ? (
          <QuestionForm
            formId="question-form"
            draft={draft}
            setDraft={(update) => setDraft((d) => (d ? update(d) : d))}
            subjects={subjects}
            fieldErrors={fieldErrors}
            formError={formError}
            onSubmit={save}
          />
        ) : null}
      </Modal>

      {/* ---- delete ---- */}
      <Modal
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            setFormError(null);
          }
        }}
        tone="coral"
        title="Delete this question?"
        description="This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={busy}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
              {busy ? "Deleting…" : "Delete question"}
            </Button>
          </>
        }
      >
        {formError ? (
          <FormError>{formError}</FormError>
        ) : (
          <blockquote className="border-l-4 border-coral pl-4 text-sm text-ink">
            {deleting?.text}
          </blockquote>
        )}
      </Modal>

      {/* ---- CSV import ---- */}
      <Modal
        open={importing}
        onOpenChange={setImporting}
        size="wide"
        title="Import questions from a CSV"
        description="Nothing is created until you've seen the rows and confirmed."
      >
        <QuestionCsvImport
          subjectNames={subjects.map((s) => s.name)}
          onImported={async () => {
            await Promise.all([load({ page: 1 }), refreshCounts()]);
            setPage(1);
          }}
        />
      </Modal>
    </div>
  );
}
