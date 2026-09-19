"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FormError, ImplicitSubmit } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { TableFrame, Td, Th, Tr } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { AdminHeader, RowAction, SuccessNote } from "@/components/admin/admin-page";

export type SubjectRow = { id: string; name: string; teacherCount: number };

type Draft = { id?: string; name: string };

export function SubjectsScreen({ initial }: { initial: SubjectRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<SubjectRow | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/subjects");
    if (res.ok) setRows((await res.json()).subjects);
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
      editing ? `/api/subjects/${draft.id}` : "/api/subjects",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: draft.name }),
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
    setNote(editing ? `Renamed to "${draft.name}".` : `Added "${draft.name}".`);
    setDraft(null);
    setBusy(false);
  }

  async function confirmDelete() {
    if (!deleting) return;

    setBusy(true);
    setFormError(null);

    const res = await fetch(`/api/subjects/${deleting.id}`, { method: "DELETE" });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      setFormError(payload.error ?? "Could not delete that subject.");
      setBusy(false);
      return;
    }

    await refresh();
    const unassigned = payload.unassignedFrom ?? 0;
    setNote(
      unassigned > 0
        ? `Deleted "${deleting.name}" and removed it from ${unassigned} teacher${unassigned === 1 ? "" : "s"}.`
        : `Deleted "${deleting.name}".`
    );
    setDeleting(null);
    setBusy(false);
  }

  return (
    <div className="space-y-8">
      <AdminHeader
        eyebrow="School setup"
        title="Subjects"
        blurb="What gets taught. Teachers are assigned to subjects, and later on so are papers."
        action={
          rows.length > 0 ? (
            <Button variant="coral" onClick={() => setDraft({ name: "" })}>
              Add subject
            </Button>
          ) : undefined
        }
      />

      {note ? <SuccessNote onDismiss={() => setNote(null)}>{note}</SuccessNote> : null}

      {rows.length === 0 ? (
        <EmptyState
          tone="coral"
          title="No subjects yet"
          body="Add the subjects your school teaches — Physics, History, Mathematics. You'll assign teachers to them next."
          action={
            <Button variant="coral" size="lg" onClick={() => setDraft({ name: "" })}>
              Add your first subject
            </Button>
          }
        />
      ) : (
        <TableFrame
          tone="coral"
          head={
            <tr>
              <Th>Subject</Th>
              <Th>Taught by</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          }
        >
          {rows.map((row) => (
            <Tr key={row.id}>
              <Td className="font-display font-bold">{row.name}</Td>
              <Td className="text-ink-soft">
                {row.teacherCount === 0
                  ? "Nobody yet"
                  : `${row.teacherCount} teacher${row.teacherCount === 1 ? "" : "s"}`}
              </Td>
              <Td className="text-right">
                <div className="flex justify-end gap-1">
                  <RowAction onClick={() => setDraft({ id: row.id, name: row.name })}>
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

      <Modal
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDraft(null);
            setFieldErrors({});
            setFormError(null);
          }
        }}
        tone="coral"
        title={draft?.id ? "Edit subject" : "Add a subject"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="coral" type="submit" form="subject-form" disabled={busy}>
              {busy ? "Saving…" : draft?.id ? "Save changes" : "Add subject"}
            </Button>
          </>
        }
      >
        <form id="subject-form" onSubmit={save} noValidate className="flex flex-col gap-5">
          <ImplicitSubmit />
          {formError ? <FormError>{formError}</FormError> : null}

          <Field
            label="Subject name"
            name="name"
            autoFocus
            required
            placeholder="Physics"
            value={draft?.name ?? ""}
            onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
            error={fieldErrors.name}
          />
        </form>
      </Modal>

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
              {busy ? "Deleting…" : "Delete subject"}
            </Button>
          </>
        }
      >
        {formError ? (
          <FormError>{formError}</FormError>
        ) : (
          <p className="text-sm text-ink-soft">
            {deleting && deleting.teacherCount > 0
              ? `${deleting.teacherCount} teacher${deleting.teacherCount === 1 ? " has" : "s have"} this subject. They'll simply stop teaching it — nothing else is affected.`
              : "Nobody is teaching this subject, so it's safe to remove."}
          </p>
        )}
      </Modal>
    </div>
  );
}
