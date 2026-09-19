"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FormError, ImplicitSubmit } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Pill, TableFrame, Td, Th, Tr } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AdminHeader,
  RowAction,
  SuccessNote,
} from "@/components/admin/admin-page";

export type SectionRow = {
  id: string;
  name: string;
  grade: number;
  studentCount: number;
};

type Draft = { id?: string; name: string; grade: string };

const EMPTY: Draft = { name: "", grade: "" };

export function SectionsScreen({ initial }: { initial: SectionRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<SectionRow | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/sections");
    if (res.ok) setRows((await res.json()).sections);
    // Keeps the overview's counts honest without a full reload.
    router.refresh();
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;

    setBusy(true);
    setFieldErrors({});
    setFormError(null);

    const editing = Boolean(draft.id);
    const res = await fetch(
      editing ? `/api/sections/${draft.id}` : "/api/sections",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: draft.name, grade: draft.grade }),
      }
    );
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      setFieldErrors(payload.fields ?? {});
      setFormError(payload.fields ? null : (payload.error ?? "That didn't work."));
      setBusy(false);
      return;
    }

    await refresh();
    setNote(
      editing
        ? `Renamed to "${draft.name}".`
        : `Added "${draft.name}". Add another, or move on to subjects.`
    );
    setDraft(null);
    setBusy(false);
  }

  async function confirmDelete() {
    if (!deleting) return;

    setBusy(true);
    setFormError(null);

    const res = await fetch(`/api/sections/${deleting.id}`, { method: "DELETE" });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      setFormError(payload.error ?? "Could not delete that section.");
      setBusy(false);
      return;
    }

    await refresh();
    setNote(`Deleted "${deleting.name}".`);
    setDeleting(null);
    setBusy(false);
  }

  return (
    <div className="space-y-8">
      <AdminHeader
        eyebrow="School setup"
        title="Sections"
        blurb="The classes students sit in — one student belongs to exactly one section."
        action={
          rows.length > 0 ? (
            <Button onClick={() => setDraft(EMPTY)}>Add section</Button>
          ) : undefined
        }
      />

      {note ? (
        <SuccessNote onDismiss={() => setNote(null)}>{note}</SuccessNote>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="Add your first section to get started"
          body="Sections are the classes students belong to, like “Grade 9 - A”. You need at least one before you can add students, because every student sits in exactly one."
          action={
            <Button size="lg" onClick={() => setDraft(EMPTY)}>
              Add your first section
            </Button>
          }
          hint="Most schools add one section per class group, then bulk-import students into them."
        />
      ) : (
        <TableFrame
          head={
            <tr>
              <Th>Section</Th>
              <Th>Grade</Th>
              <Th>Students</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          }
        >
          {rows.map((row) => (
            <Tr key={row.id}>
              <Td className="font-display font-bold">{row.name}</Td>
              <Td>
                <Pill>Grade {row.grade}</Pill>
              </Td>
              <Td className="text-ink-soft">
                {row.studentCount === 0
                  ? "None yet"
                  : `${row.studentCount} student${row.studentCount === 1 ? "" : "s"}`}
              </Td>
              <Td className="text-right">
                <div className="flex justify-end gap-1">
                  <RowAction
                    onClick={() =>
                      setDraft({
                        id: row.id,
                        name: row.name,
                        grade: String(row.grade),
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
          ))}
        </TableFrame>
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
        title={draft?.id ? "Edit section" : "Add a section"}
        description={
          draft?.id
            ? undefined
            : "Name it the way your school says it out loud, like “Grade 9 - A”."
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="section-form" disabled={busy}>
              {busy ? "Saving…" : draft?.id ? "Save changes" : "Add section"}
            </Button>
          </>
        }
      >
        <form id="section-form" onSubmit={save} noValidate className="flex flex-col gap-5">
          <ImplicitSubmit />
          {formError ? <FormError>{formError}</FormError> : null}

          <Field
            label="Section name"
            name="name"
            autoFocus
            required
            placeholder="Grade 9 - A"
            value={draft?.name ?? ""}
            onChange={(e) =>
              setDraft((d) => (d ? { ...d, name: e.target.value } : d))
            }
            error={fieldErrors.name}
          />
          <Field
            label="Grade"
            name="grade"
            type="number"
            min={1}
            max={13}
            required
            placeholder="9"
            value={draft?.grade ?? ""}
            onChange={(e) =>
              setDraft((d) => (d ? { ...d, grade: e.target.value } : d))
            }
            error={fieldErrors.grade}
            hint="A whole number between 1 and 13."
          />
        </form>
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
        title={`Delete "${deleting?.name}"?`}
        description="This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={busy}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
              {busy ? "Deleting…" : "Delete section"}
            </Button>
          </>
        }
      >
        {formError ? (
          <FormError>{formError}</FormError>
        ) : (
          <p className="text-sm text-ink-soft">
            {deleting && deleting.studentCount > 0
              ? `This section has ${deleting.studentCount} student${deleting.studentCount === 1 ? "" : "s"} in it. You'll need to move them somewhere else first.`
              : "Nothing is using this section, so it's safe to remove."}
          </p>
        )}
      </Modal>
    </div>
  );
}
