"use client";

import { PlanBlockNotice } from "@/components/billing/plan-banner";
import { useState } from "react";
import { WandSparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormError, ImplicitSubmit } from "@/components/ui/field";
import { SelectInput } from "@/components/admin/admin-page";
import { QuestionPicker } from "@/components/tests/question-picker";
import { DIFFICULTIES } from "@/lib/questions-shared";
import { MAX_DURATION_MINUTES } from "@/lib/tests-shared";
import { cn } from "cn";

export type SubjectOption = { id: string; name: string; questionCount: number };
export type SectionOption = { id: string; name: string };

export type TestDraft = {
  id?: string;
  title: string;
  subjectId: string;
  durationMinutes: string;
  questionIds: string[];
  opensAt: string;
  closesAt: string;
  sectionIds: string[];
};

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in local time, not an ISO string. */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function emptyDraft(): TestDraft {
  const opens = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const closes = new Date(opens.getTime() + 2 * 60 * 60 * 1000);

  return {
    title: "",
    subjectId: "",
    durationMinutes: "45",
    questionIds: [],
    opensAt: toLocalInput(opens),
    closesAt: toLocalInput(closes),
    sectionIds: [],
  };
}

export function TestForm({
  draft,
  setDraft,
  subjects,
  sections,
  fieldErrors,
  formError,
  planBlock,
  formId,
  onSubmit,
}: {
  draft: TestDraft;
  setDraft: (update: (d: TestDraft) => TestDraft) => void;
  subjects: SubjectOption[];
  sections: SectionOption[];
  fieldErrors: Record<string, string>;
  formError: string | null;
  /** A refusal money fixes, rendered as its own notice rather than a form error. */
  planBlock?: string | null;
  formId: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const [autoCount, setAutoCount] = useState("10");
  const [autoDifficulty, setAutoDifficulty] = useState("");
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoNote, setAutoNote] = useState<string | null>(null);

  const subject = subjects.find((s) => s.id === draft.subjectId);
  const bankSize = subject?.questionCount ?? 0;

  async function autoPick() {
    setAutoBusy(true);
    setAutoNote(null);

    const res = await fetch("/api/tests/auto-select", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: draft.subjectId,
        count: Number(autoCount),
        difficulty: autoDifficulty || undefined,
      }),
    });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      setAutoNote(payload.error ?? "Couldn't pick questions.");
      setAutoBusy(false);
      return;
    }

    const ids = payload.questions.map((q: { id: string }) => q.id);
    setDraft((d) => ({ ...d, questionIds: ids }));

    // Say so rather than quietly producing a shorter paper than asked for.
    setAutoNote(
      payload.questions.length < payload.requested
        ? `Picked ${payload.questions.length} — that's all the bank has${autoDifficulty ? ` at ${autoDifficulty}` : ""}. You asked for ${payload.requested}.`
        : `Picked ${payload.questions.length} at random. Adjust them below if you want.`
    );
    setAutoBusy(false);
  }

  return (
    <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <ImplicitSubmit />
      {planBlock ? <PlanBlockNotice message={planBlock} canUpgrade={false} /> : null}
      {formError ? <FormError>{formError}</FormError> : null}

      <Field
        label="Title"
        autoFocus
        required
        placeholder="Unit 3 — Forces and Motion"
        value={draft.title}
        onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        error={fieldErrors.title}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <SelectInput
            id={`${formId}-subject`}
            label="Subject"
            value={draft.subjectId}
            onChange={(value) =>
              // Changing subject clears the picks, because a paper is built
              // from one subject's bank.
              setDraft((d) => ({ ...d, subjectId: value, questionIds: [] }))
            }
          >
            <option value="">Choose a subject…</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.questionCount} in bank)
              </option>
            ))}
          </SelectInput>
          {fieldErrors.subjectId ? (
            <p className="mt-2 text-sm font-medium text-danger">
              ↳ {fieldErrors.subjectId}
            </p>
          ) : null}
        </div>

        <Field
          label="Duration (minutes)"
          type="number"
          min={1}
          max={MAX_DURATION_MINUTES}
          required
          value={draft.durationMinutes}
          onChange={(e) =>
            setDraft((d) => ({ ...d, durationMinutes: e.target.value }))
          }
          error={fieldErrors.durationMinutes}
          hint={`How long a student gets once they start. Up to ${MAX_DURATION_MINUTES}.`}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Opens at"
          type="datetime-local"
          required
          value={draft.opensAt}
          onChange={(e) => setDraft((d) => ({ ...d, opensAt: e.target.value }))}
          error={fieldErrors.opensAt}
        />
        <Field
          label="Closes at"
          type="datetime-local"
          required
          value={draft.closesAt}
          onChange={(e) => setDraft((d) => ({ ...d, closesAt: e.target.value }))}
          error={fieldErrors.closesAt}
        />
      </div>

      {/* ---- sections ---- */}
      <fieldset>
        <legend className="font-display text-[0.8rem] font-bold uppercase tracking-[0.12em] text-ink">
          Assign to sections
        </legend>
        <p className="mt-1 text-xs text-ink-soft">
          Only applied when you publish. A draft is never assigned to anyone.
        </p>

        {sections.length === 0 ? (
          <p className="mt-2 text-sm text-ink-faint">
            Your school has no sections yet — an admin adds them on the Sections
            tab.
          </p>
        ) : (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {sections.map((s) => {
              const on = draft.sectionIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      sectionIds: on
                        ? d.sectionIds.filter((x) => x !== s.id)
                        : [...d.sectionIds, s.id],
                    }))
                  }
                  className={cn(
                    "rounded-full border-2 border-ink px-3 py-1.5 font-display text-xs font-bold transition-all duration-150 ease-[var(--ease-snap)]",
                    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cobalt/40",
                    "motion-reduce:transform-none",
                    on
                      ? "bg-cobalt text-white shadow-[2px_2px_0_var(--ink)]"
                      : "bg-paper-pure text-ink-soft hover:bg-paper-deep hover:text-ink"
                  )}
                >
                  {on ? "✓ " : ""}
                  {s.name}
                </button>
              );
            })}
          </div>
        )}
        {fieldErrors.sectionIds ? (
          <p className="mt-2 text-sm font-medium text-danger">
            ↳ {fieldErrors.sectionIds}
          </p>
        ) : null}
      </fieldset>

      {/* ---- questions ---- */}
      <div>
        <p className="font-display text-[0.8rem] font-bold uppercase tracking-[0.12em] text-ink">
          Questions
        </p>

        {!draft.subjectId ? (
          <p className="mt-2 text-sm text-ink-faint">
            Pick a subject first and its question bank appears here.
          </p>
        ) : (
          <>
            {/* auto-generate */}
            <div className="mt-3 rounded-lg border-2 border-ink bg-paper-deep p-4">
              <p className="font-display text-sm font-bold text-ink">
                Or let us pick them
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                {bankSize} question{bankSize === 1 ? "" : "s"} in{" "}
                {subject?.name ?? "this subject"}&apos;s bank.
              </p>

              <div className="mt-3 flex flex-wrap items-end gap-3">
                <Field
                  label="How many"
                  type="number"
                  min={1}
                  // Cannot ask for more than exist — the Phase 3 count makes
                  // that knowable before the request is even made.
                  max={Math.max(1, bankSize)}
                  value={autoCount}
                  onChange={(e) => setAutoCount(e.target.value)}
                  className="w-28"
                />
                <SelectInput
                  id={`${formId}-auto-difficulty`}
                  label="Difficulty"
                  value={autoDifficulty}
                  onChange={setAutoDifficulty}
                  className="w-40"
                >
                  <option value="">Any</option>
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {d[0].toUpperCase() + d.slice(1)}
                    </option>
                  ))}
                </SelectInput>
                <Button
                  type="button"
                  variant="coral"
                  disabled={autoBusy || bankSize === 0}
                  onClick={autoPick}
                >
                  <WandSparklesIcon className="size-4" />
                  {autoBusy ? "Picking…" : "Pick at random"}
                </Button>
              </div>

              {autoNote ? (
                <p className="mt-3 text-sm font-medium text-ink">{autoNote}</p>
              ) : null}
            </div>

            {fieldErrors.questionIds ? (
              <p className="mt-3 text-sm font-medium text-danger">
                ↳ {fieldErrors.questionIds}
              </p>
            ) : null}

            <div className="mt-4">
              <QuestionPicker
                subjectId={draft.subjectId}
                selected={draft.questionIds}
                onChange={(ids) => setDraft((d) => ({ ...d, questionIds: ids }))}
              />
            </div>
          </>
        )}
      </div>
    </form>
  );
}
