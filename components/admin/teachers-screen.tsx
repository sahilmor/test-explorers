"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FormError, ImplicitSubmit } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Pill, TableFrame, Td, Th, Tr } from "@/components/ui/data-table";
import { EmptyState, NoMatches } from "@/components/ui/empty-state";
import { AdminHeader, SearchInput, SuccessNote } from "@/components/admin/admin-page";
import { CopyButton } from "@/components/admin/copy-button";
import { cn } from "cn";

export type TeacherRow = {
  id: string;
  name: string;
  email: string;
  subjects: { id: string; name: string }[];
  sections: { id: string; name: string }[];
};

export type Option = { id: string; name: string };

type Draft = {
  name: string;
  email: string;
  password: string;
  subjectIds: string[];
  sectionIds: string[];
};

const EMPTY: Draft = {
  name: "",
  email: "",
  password: "",
  subjectIds: [],
  sectionIds: [],
};

export function TeachersScreen({
  initial,
  subjects,
  sections,
}: {
  initial: TeacherRow[];
  subjects: Option[];
  sections: Option[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [created, setCreated] = useState<{
    name: string;
    email: string;
    temporaryPassword: string | null;
  } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Filtering happens against the loaded list, so typing is instant rather
  // than one request per keystroke.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (t) =>
        t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q)
    );
  }, [rows, search]);

  async function refresh() {
    const res = await fetch("/api/teachers");
    if (res.ok) setRows((await res.json()).teachers);
    router.refresh();
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;

    setBusy(true);
    setFieldErrors({});
    setFormError(null);

    const res = await fetch("/api/teachers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        email: draft.email,
        password: draft.password || undefined,
        subjectIds: draft.subjectIds,
        sectionIds: draft.sectionIds,
      }),
    });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      setFieldErrors(payload.fields ?? {});
      setFormError(payload.fields ? null : (payload.error ?? "That didn't work."));
      setBusy(false);
      return;
    }

    await refresh();
    setDraft(null);
    setBusy(false);
    // Shown once. The password is not stored in readable form anywhere.
    setCreated(payload.teacher);
  }

  function toggle(key: "subjectIds" | "sectionIds", id: string) {
    setDraft((d) => {
      if (!d) return d;
      const has = d[key].includes(id);
      return {
        ...d,
        [key]: has ? d[key].filter((x) => x !== id) : [...d[key], id],
      };
    });
  }

  return (
    <div className="space-y-8">
      <AdminHeader
        eyebrow="School setup"
        title="Teachers"
        blurb="The people who write and mark papers. Assign each one the subjects and sections they teach."
        action={
          rows.length > 0 ? (
            <Button onClick={() => setDraft(EMPTY)}>Add teacher</Button>
          ) : undefined
        }
      />

      {note ? <SuccessNote onDismiss={() => setNote(null)}>{note}</SuccessNote> : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No teachers yet"
          body="Add the staff who'll be setting and marking papers. You can give them a password now, or let us generate a temporary one to pass on."
          action={
            <Button size="lg" onClick={() => setDraft(EMPTY)}>
              Add your first teacher
            </Button>
          }
          hint={
            subjects.length === 0
              ? "Tip: add a few subjects first and you can assign them here in one go."
              : undefined
          }
        />
      ) : (
        <>
          <SearchInput
            label="Search teachers"
            placeholder="Search by name or email…"
            value={search}
            onChange={setSearch}
            className="max-w-md"
          />

          {visible.length === 0 ? (
            <NoMatches
              what="teachers"
              onClear={
                <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <TableFrame
              head={
                <tr>
                  <Th>Teacher</Th>
                  <Th>Subjects</Th>
                  <Th>Sections</Th>
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
                    {row.subjects.length === 0 ? (
                      <span className="text-ink-faint">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-1.5">
                        {row.subjects.map((s) => (
                          <Pill key={s.id} tone="coral">
                            {s.name}
                          </Pill>
                        ))}
                      </span>
                    )}
                  </Td>
                  <Td>
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
                </Tr>
              ))}
            </TableFrame>
          )}

          <p className="text-sm text-ink-soft">
            Showing {visible.length} of {rows.length} teacher
            {rows.length === 1 ? "" : "s"}.
          </p>
        </>
      )}

      {/* ---- add ---- */}
      <Modal
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDraft(null);
            setFieldErrors({});
            setFormError(null);
          }
        }}
        title="Add a teacher"
        description="Leave the password blank and we'll generate a temporary one to show you once."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="teacher-form" disabled={busy}>
              {busy ? "Adding…" : "Add teacher"}
            </Button>
          </>
        }
      >
        <form id="teacher-form" onSubmit={save} noValidate className="flex flex-col gap-5">
          <ImplicitSubmit />
          {formError ? <FormError>{formError}</FormError> : null}

          <Field
            label="Name"
            autoFocus
            required
            placeholder="Dana Mehta"
            value={draft?.name ?? ""}
            onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
            error={fieldErrors.name}
          />
          <Field
            label="Email"
            type="email"
            required
            placeholder="dana@riverbend.edu"
            value={draft?.email ?? ""}
            onChange={(e) => setDraft((d) => (d ? { ...d, email: e.target.value } : d))}
            error={fieldErrors.email}
          />
          <Field
            label="Password (optional)"
            type="password"
            placeholder="Leave blank to generate one"
            value={draft?.password ?? ""}
            onChange={(e) =>
              setDraft((d) => (d ? { ...d, password: e.target.value } : d))
            }
            error={fieldErrors.password}
            hint="At least 8 characters if you set one yourself."
          />

          <ChipPicker
            legend="Subjects they teach"
            options={subjects}
            selected={draft?.subjectIds ?? []}
            onToggle={(id) => toggle("subjectIds", id)}
            emptyHint="No subjects yet — add some on the Subjects tab."
            tone="coral"
          />
          <ChipPicker
            legend="Sections they teach"
            options={sections}
            selected={draft?.sectionIds ?? []}
            onToggle={(id) => toggle("sectionIds", id)}
            emptyHint="No sections yet — add some on the Sections tab."
            tone="lime"
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
            <p className="text-xs leading-relaxed text-ink-soft">
              We only store a hash of this, so there&apos;s no way to look it
              up later. If it gets lost, you&apos;ll need to set a new one.
            </p>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">
            They can sign in with {created?.email} and the password you set.
          </p>
        )}
      </Modal>
    </div>
  );
}

/** Multi-select as toggleable chips — faster to scan and click than a listbox. */
function ChipPicker({
  legend,
  options,
  selected,
  onToggle,
  emptyHint,
  tone,
}: {
  legend: string;
  options: Option[];
  selected: string[];
  onToggle: (id: string) => void;
  emptyHint: string;
  tone: "lime" | "coral";
}) {
  return (
    <fieldset>
      <legend className="font-display text-[0.8rem] font-bold uppercase tracking-[0.12em] text-ink">
        {legend}
      </legend>

      {options.length === 0 ? (
        <p className="mt-2 text-sm text-ink-faint">{emptyHint}</p>
      ) : (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {options.map((option) => {
            const on = selected.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(option.id)}
                className={cn(
                  "rounded-full border-2 border-ink px-3 py-1.5 font-display text-xs font-bold transition-all duration-150 ease-[var(--ease-snap)]",
                  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cobalt/40",
                  on
                    ? cn(
                        "shadow-[2px_2px_0_var(--ink)]",
                        tone === "coral" ? "bg-coral text-ink" : "bg-lime text-ink"
                      )
                    : "bg-paper-pure text-ink-soft hover:bg-paper-deep hover:text-ink"
                )}
              >
                {on ? "✓ " : ""}
                {option.name}
              </button>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
