"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Pill, TableFrame, Td, Th, Tr } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { AdminHeader, RowAction, SuccessNote } from "@/components/admin/admin-page";
import { SubjectTag } from "@/components/questions/question-bits";
import { TestStateBadge, formatWhen } from "@/components/tests/test-bits";
import {
  emptyDraft,
  TestForm,
  toLocalInput,
  type SectionOption,
  type SubjectOption,
  type TestDraft,
} from "@/components/tests/test-form";
import type { TestState } from "@/lib/tests-shared";
import { cn } from "cn";

export type TestRow = {
  id: string;
  title: string;
  subjectId: string;
  subjectName: string | null;
  durationMinutes: number;
  questionCount: number;
  opensAt: string;
  closesAt: string;
  state: TestState;
  sections: { id: string; name: string }[];
};

export function TestsScreen({
  initial,
  subjects,
  sections,
}: {
  initial: TestRow[];
  subjects: SubjectOption[];
  sections: SectionOption[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [draft, setDraft] = useState<TestDraft | null>(null);
  const [publishIntent, setPublishIntent] = useState(false);
  const [assigning, setAssigning] = useState<TestRow | null>(null);
  const [assignSections, setAssignSections] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<TestRow | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  // An expired plan stops a paper being set. That is not a validation error
  // and should not look like one.
  const [planBlock, setPlanBlock] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/tests");
    if (res.ok) setRows((await res.json()).tests);
    router.refresh();
  }

  function clearErrors() {
    setFieldErrors({});
    setFormError(null);
    setPlanBlock(null);
  }

  async function save(publish: boolean) {
    if (!draft) return;

    setBusy(true);
    clearErrors();

    const editing = Boolean(draft.id);
    const res = await fetch(editing ? `/api/tests/${draft.id}` : "/api/tests", {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: draft.title,
        subjectId: draft.subjectId,
        durationMinutes: draft.durationMinutes,
        questionIds: draft.questionIds,
        opensAt: draft.opensAt,
        closesAt: draft.closesAt,
        sectionIds: draft.sectionIds,
        publish,
      }),
    });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (payload.planBlock) {
        setPlanBlock(payload.error);
        setBusy(false);
        return;
      }
      setFieldErrors(payload.fields ?? {});
      setFormError(payload.fields ? null : (payload.error ?? "That didn't work."));
      setBusy(false);
      return;
    }

    await refresh();
    setNote(
      publish
        ? `"${draft.title}" is published${draft.sectionIds.length > 0 ? ` to ${draft.sectionIds.length} section${draft.sectionIds.length === 1 ? "" : "s"}` : ", but not assigned to any section yet"}.`
        : `"${draft.title}" saved as a draft. Students can't see it.`
    );
    setDraft(null);
    setBusy(false);
  }

  async function saveAssignments() {
    if (!assigning) return;

    setBusy(true);
    clearErrors();

    const res = await fetch(`/api/tests/${assigning.id}/assignments`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sectionIds: assignSections }),
    });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      setFormError(payload.error ?? "Could not save those sections.");
      setBusy(false);
      return;
    }

    await refresh();
    setNote(
      assignSections.length === 0
        ? `"${assigning.title}" is no longer assigned to any section.`
        : `"${assigning.title}" is assigned to ${assignSections.length} section${assignSections.length === 1 ? "" : "s"}.`
    );
    setAssigning(null);
    setBusy(false);
  }

  async function confirmDelete() {
    if (!deleting) return;

    setBusy(true);
    clearErrors();

    const res = await fetch(`/api/tests/${deleting.id}`, { method: "DELETE" });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setFormError(payload.error ?? "Could not delete that test.");
      setBusy(false);
      return;
    }

    await refresh();
    setNote(`Deleted "${deleting.title}".`);
    setDeleting(null);
    setBusy(false);
  }

  async function openForEdit(row: TestRow) {
    clearErrors();
    const res = await fetch(`/api/tests/${row.id}`);
    if (!res.ok) return;
    const { test } = await res.json();

    setDraft({
      id: test.id,
      title: test.title,
      subjectId: test.subjectId,
      durationMinutes: String(test.durationMinutes),
      questionIds: test.questionIds,
      opensAt: toLocalInput(new Date(test.opensAt)),
      closesAt: toLocalInput(new Date(test.closesAt)),
      sectionIds: test.sectionIds,
    });
    setPublishIntent(test.state !== "draft");
  }

  return (
    <div className="space-y-8">
      <AdminHeader
        eyebrow="Tests"
        title="Your papers"
        blurb="Build a paper from the question bank, set the window it's open for, and send it to a class."
        action={
          rows.length > 0 ? (
            <Button
              onClick={() => {
                clearErrors();
                setDraft(emptyDraft());
                setPublishIntent(false);
              }}
            >
              New test
            </Button>
          ) : undefined
        }
      />

      {note ? <SuccessNote onDismiss={() => setNote(null)}>{note}</SuccessNote> : null}

      {subjects.length === 0 ? (
        <EmptyState
          tone="coral"
          title="No subjects yet"
          body="A test belongs to a subject, so your school needs at least one before you can set a paper. An admin adds them on the Subjects tab."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No tests yet"
          body="Build your first paper: pick a subject, choose questions from its bank or let us pick at random, then set when it opens and closes."
          action={
            <Button
              size="lg"
              onClick={() => {
                clearErrors();
                setDraft(emptyDraft());
                setPublishIntent(false);
              }}
            >
              Create your first test
            </Button>
          }
          hint="Save it as a draft while you work on it — students only see published tests."
        />
      ) : (
        <TableFrame
          head={
            <tr>
              <Th>Test</Th>
              <Th>Status</Th>
              <Th>Window</Th>
              <Th>Sections</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          }
        >
          {rows.map((row) => (
            <Tr key={row.id}>
              <Td className="align-top">
                <span className="font-display font-bold">{row.title}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2">
                  <SubjectTag name={row.subjectName} />
                  <span className="text-xs text-ink-soft">
                    {row.questionCount} question
                    {row.questionCount === 1 ? "" : "s"} · {row.durationMinutes} min
                  </span>
                </span>
              </Td>
              <Td className="align-top">
                <TestStateBadge state={row.state} />
              </Td>
              <Td className="align-top text-xs text-ink-soft">
                <span className="block">{formatWhen(row.opensAt)}</span>
                <span className="block">to {formatWhen(row.closesAt)}</span>
              </Td>
              <Td className="align-top">
                {row.sections.length === 0 ? (
                  <span className="text-ink-faint">—</span>
                ) : (
                  <span className="flex flex-wrap gap-1.5">
                    {row.sections.map((s) => (
                      <Pill key={s.id}>{s.name}</Pill>
                    ))}
                  </span>
                )}
              </Td>
              <Td className="text-right align-top">
                <div className="flex justify-end gap-1">
                  <Link
                    href={`/teacher/tests/${row.id}/results`}
                    className="rounded-md border-2 border-transparent px-2 py-1 font-display text-xs font-bold tracking-tight text-cobalt transition-colors hover:border-cobalt hover:bg-cobalt-wash focus-visible:border-ink focus-visible:outline-none"
                  >
                    Results
                  </Link>
                  <RowAction onClick={() => void openForEdit(row)}>Edit</RowAction>
                  <RowAction
                    onClick={() => {
                      clearErrors();
                      setAssigning(row);
                      setAssignSections(row.sections.map((s) => s.id));
                    }}
                  >
                    Assign
                  </RowAction>
                  <RowAction tone="danger" onClick={() => setDeleting(row)}>
                    Delete
                  </RowAction>
                </div>
              </Td>
            </Tr>
          ))}
        </TableFrame>
      )}

      {/* ---- create / edit ---- */}
      <Modal
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDraft(null);
            clearErrors();
          }
        }}
        size="wide"
        title={draft?.id ? "Edit test" : "New test"}
        description="Save it as a draft while you work, or publish it to send it to a class."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void save(false)}
            >
              {busy && !publishIntent ? "Saving…" : "Save as draft"}
            </Button>
            <Button disabled={busy} onClick={() => void save(true)}>
              {busy && publishIntent ? "Publishing…" : "Publish"}
            </Button>
          </>
        }
      >
        {draft ? (
          <TestForm
            formId="test-form"
            draft={draft}
            setDraft={(update) => setDraft((d) => (d ? update(d) : d))}
            subjects={subjects}
            sections={sections}
            fieldErrors={fieldErrors}
            formError={formError}
            planBlock={planBlock}
            // Enter submits as a draft — the safe default. Publishing is a
            // deliberate click.
            onSubmit={(e) => {
              e.preventDefault();
              void save(false);
            }}
          />
        ) : null}
      </Modal>

      {/* ---- assign ---- */}
      <Modal
        open={assigning !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAssigning(null);
            clearErrors();
          }
        }}
        tone="cobalt"
        title={`Assign "${assigning?.title}"`}
        description="Pick the sections that should sit this paper."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAssigning(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="ink" disabled={busy} onClick={saveAssignments}>
              {busy ? "Saving…" : "Save sections"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError ? <FormError>{formError}</FormError> : null}

          {assigning?.state === "draft" ? (
            <FormError>
              This test is still a draft. Publish it first — a draft is never
              visible to students, so assigning it would do nothing.
            </FormError>
          ) : null}

          {sections.length === 0 ? (
            <p className="text-sm text-ink-faint">
              Your school has no sections yet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sections.map((s) => {
                const on = assignSections.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setAssignSections((prev) =>
                        on ? prev.filter((x) => x !== s.id) : [...prev, s.id]
                      )
                    }
                    className={cn(
                      "rounded-full border-2 border-ink px-3.5 py-2 font-display text-sm font-bold transition-all duration-150 ease-[var(--ease-snap)]",
                      "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cobalt/40",
                      "motion-reduce:transform-none",
                      on
                        ? "-translate-x-[1px] -translate-y-[1px] bg-cobalt text-white shadow-[3px_3px_0_var(--ink)]"
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

          <p className="text-xs text-ink-soft">
            {assignSections.length === 0
              ? "No sections selected — saving will withdraw this test from every class."
              : `${assignSections.length} section${assignSections.length === 1 ? "" : "s"} selected.`}
          </p>
        </div>
      </Modal>

      {/* ---- delete ---- */}
      <Modal
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            clearErrors();
          }
        }}
        tone="coral"
        title={`Delete "${deleting?.title}"?`}
        description="This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={busy}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
              {busy ? "Deleting…" : "Delete test"}
            </Button>
          </>
        }
      >
        {formError ? (
          <FormError>{formError}</FormError>
        ) : (
          <p className="text-sm text-ink-soft">
            {deleting && deleting.sections.length > 0
              ? `This paper is assigned to ${deleting.sections.length} section${deleting.sections.length === 1 ? "" : "s"}. Deleting it withdraws it from them.`
              : "Nothing is assigned to this paper."}
          </p>
        )}
      </Modal>
    </div>
  );
}
