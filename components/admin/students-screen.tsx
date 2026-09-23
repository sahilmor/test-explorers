"use client";

import { PlanBlockNotice } from "@/components/billing/plan-banner";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FormError, ImplicitSubmit } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Pill, TableFrame, Td, Th, Tr } from "@/components/ui/data-table";
import { EmptyState, NoMatches } from "@/components/ui/empty-state";
import {
  AdminHeader,
  SearchInput,
  SelectInput,
  SuccessNote,
} from "@/components/admin/admin-page";
import { CopyButton } from "@/components/admin/copy-button";
import { CsvImport } from "@/components/admin/csv-import";

export type StudentRow = {
  id: string;
  name: string;
  email: string;
  sectionId: string | null;
  sectionName: string | null;
  grade: number | null;
};

export type SectionOption = { id: string; name: string; grade: number };

type Draft = { name: string; email: string; sectionId: string; password: string };

export function StudentsScreen({
  initial,
  sections,
}: {
  initial: StudentRow[];
  sections: SectionOption[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [importing, setImporting] = useState(false);
  const [created, setCreated] = useState<{
    name: string;
    email: string;
    temporaryPassword: string | null;
  } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  // A refusal that money fixes reads differently from a typo in an email
  // address, so it is held separately and rendered as its own notice.
  const [planBlock, setPlanBlock] = useState<string | null>(null);

  // Both filters run over the loaded list, so a 200-student school filters
  // instantly instead of waiting on a request per keystroke.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((s) => {
      if (sectionFilter && s.sectionId !== sectionFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
      );
    });
  }, [rows, search, sectionFilter]);

  const filtering = Boolean(search.trim() || sectionFilter);

  async function refresh() {
    const res = await fetch("/api/students");
    if (res.ok) setRows((await res.json()).students);
    router.refresh();
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;

    setBusy(true);
    setFieldErrors({});
    setFormError(null);
    setPlanBlock(null);

    const res = await fetch("/api/students", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        email: draft.email,
        sectionId: draft.sectionId,
        password: draft.password || undefined,
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
    setDraft(null);
    setBusy(false);
    setCreated(payload.student);
  }

  const newDraft = (): Draft => ({
    name: "",
    email: "",
    // Pre-select when there's only one section, or reuse the current filter —
    // an admin adding to a section usually adds several in a row.
    sectionId: sectionFilter || (sections.length === 1 ? sections[0].id : ""),
    password: "",
  });

  return (
    <div className="space-y-8">
      <AdminHeader
        eyebrow="School setup"
        title="Students"
        blurb="Everyone who sits papers. Add them one at a time, or import a whole year group from a spreadsheet if you have one."
        action={
          rows.length > 0 ? (
            <>
              <Button variant="outline" onClick={() => setImporting(true)}>
                Import CSV
              </Button>
              <Button onClick={() => setDraft(newDraft())}>Add student</Button>
            </>
          ) : undefined
        }
      />

      {note ? <SuccessNote onDismiss={() => setNote(null)}>{note}</SuccessNote> : null}

      {sections.length === 0 ? (
        <EmptyState
          tone="cobalt"
          title="Add a section first"
          body="Every student sits in exactly one section, so there needs to be at least one before you can add anybody."
          action={
            <Button
              variant="ink"
              size="lg"
              render={<Link href="/admin/sections">Go to sections</Link>}
            />
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          tone="cobalt"
          title="No students yet"
          /*
           * Adding one leads, and the CSV follows.
           *
           * This is the first screen a new school meets, and leading with
           * "Import a CSV" quietly assumes somebody there is comfortable
           * exporting and formatting a spreadsheet. Plenty of schools have
           * nobody like that, and the ones that do can still see the shortcut
           * — it just is not the thing standing in everyone else's way.
           */
          body="Add them one at a time — it takes about fifteen seconds each. If you already have a spreadsheet of your year group, you can import the whole thing instead."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button variant="ink" size="lg" onClick={() => setDraft(newDraft())}>
                Add a student
              </Button>
              <Button variant="outline" size="lg" onClick={() => setImporting(true)}>
                Import a spreadsheet
              </Button>
            </div>
          }
          hint="No spreadsheet needed. The CSV route wants three columns: name, email, section."
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchInput
              label="Search students"
              placeholder="Search by name or email…"
              value={search}
              onChange={setSearch}
              className="flex-1"
            />
            <SelectInput
              id="section-filter"
              label="Filter by section"
              srOnlyLabel
              value={sectionFilter}
              onChange={setSectionFilter}
              className="sm:w-64"
            >
              <option value="">All sections</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectInput>
          </div>

          {visible.length === 0 ? (
            <NoMatches
              what="students"
              onClear={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setSectionFilter("");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <TableFrame
              tone="cobalt"
              head={
                <tr>
                  <Th className="text-white">Student</Th>
                  <Th className="text-white">Section</Th>
                  <Th className="text-white">Grade</Th>
                </tr>
              }
            >
              {visible.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <span className="font-display font-bold">{row.name}</span>
                    <span className="block text-xs text-ink-soft">{row.email}</span>
                  </Td>
                  <Td>
                    {row.sectionName ? (
                      <Pill>{row.sectionName}</Pill>
                    ) : (
                      <span className="text-ink-faint">Unassigned</span>
                    )}
                  </Td>
                  <Td className="text-ink-soft">
                    {row.grade === null ? "—" : `Grade ${row.grade}`}
                  </Td>
                </Tr>
              ))}
            </TableFrame>
          )}

          <p className="text-sm text-ink-soft">
            Showing {visible.length} of {rows.length} student
            {rows.length === 1 ? "" : "s"}
            {filtering ? " (filtered)" : ""}.
          </p>
        </>
      )}

      {/* ---- add one ---- */}
      <Modal
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDraft(null);
            setFieldErrors({});
            setFormError(null);
          }
        }}
        tone="cobalt"
        title="Add a student"
        description="Leave the password blank and we'll generate a temporary one to show you once."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="ink" type="submit" form="student-form" disabled={busy}>
              {busy ? "Adding…" : "Add student"}
            </Button>
          </>
        }
      >
        <form id="student-form" onSubmit={save} noValidate className="flex flex-col gap-5">
          <ImplicitSubmit />
          {planBlock ? <PlanBlockNotice message={planBlock} /> : null}
          {formError ? <FormError>{formError}</FormError> : null}

          <Field
            label="Name"
            autoFocus
            required
            placeholder="Aisha Khan"
            value={draft?.name ?? ""}
            onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
            error={fieldErrors.name}
          />
          <Field
            label="Email"
            type="email"
            required
            placeholder="aisha.khan@riverbend.edu"
            value={draft?.email ?? ""}
            onChange={(e) => setDraft((d) => (d ? { ...d, email: e.target.value } : d))}
            error={fieldErrors.email}
          />
          <SelectInput
            id="student-section"
            label="Section"
            value={draft?.sectionId ?? ""}
            onChange={(value) =>
              setDraft((d) => (d ? { ...d, sectionId: value } : d))
            }
          >
            <option value="">Choose a section…</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} (Grade {s.grade})
              </option>
            ))}
          </SelectInput>
          {fieldErrors.sectionId ? (
            <p className="-mt-3 text-sm font-medium text-danger">
              ↳ {fieldErrors.sectionId}
            </p>
          ) : null}
          <Field
            label="Password (optional)"
            type="password"
            placeholder="Leave blank to generate one"
            value={draft?.password ?? ""}
            onChange={(e) =>
              setDraft((d) => (d ? { ...d, password: e.target.value } : d))
            }
            error={fieldErrors.password}
          />
        </form>
      </Modal>

      {/* ---- the one-time password ---- */}
      <Modal
        open={created !== null}
        onOpenChange={(open) => {
          if (!open) {
            setNote(`Added ${created?.name}.`);
            setCreated(null);
          }
        }}
        tone="cobalt"
        title={`${created?.name} is in`}
        description={
          created?.temporaryPassword
            ? "Copy this password now — it can't be shown again."
            : undefined
        }
        footer={
          <Button
            variant="ink"
            onClick={() => {
              setNote(`Added ${created?.name}.`);
              setCreated(null);
            }}
          >
            Done
          </Button>
        }
      >
        {created?.temporaryPassword ? (
          <div className="space-y-4">
            <div>
              <p className="eyebrow text-ink-soft">Email</p>
              <p className="mt-1 font-mono text-sm text-ink">{created.email}</p>
            </div>
            <div>
              <p className="eyebrow text-ink-soft">Temporary password</p>
              <div className="mt-1.5 flex items-center gap-3">
                <code className="flex-1 rounded-lg border-2 border-ink bg-cobalt-wash px-3 py-2.5 font-mono text-base font-bold tracking-wide text-ink">
                  {created.temporaryPassword}
                </code>
                <CopyButton value={created.temporaryPassword} />
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">
            They can sign in with {created?.email} and the password you set.
          </p>
        )}
      </Modal>

      {/* ---- CSV import ---- */}
      <Modal
        open={importing}
        onOpenChange={setImporting}
        tone="cobalt"
        size="wide"
        title="Import students from a CSV"
        description="Nothing is created until you've seen the rows and confirmed."
      >
        <CsvImport
          sectionNames={sections.map((s) => s.name)}
          onImported={async () => {
            await refresh();
          }}
        />
      </Modal>
    </div>
  );
}
