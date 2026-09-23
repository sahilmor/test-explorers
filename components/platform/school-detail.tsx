"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Pill, TableFrame, Td, Th, Tr } from "@/components/ui/data-table";
import { Field, FormError } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SelectInput } from "@/components/admin/admin-page";
import type { SchoolDetail, SchoolPerson } from "@/lib/platform-admin";
import { cn } from "cn";

/**
 * Running one school from the outside.
 *
 * Everything a school would normally do for itself, done for them: add and
 * edit teachers and students, reset a password, and set the plan without a
 * payment step. This is the onboarding tool — a school hands over a roster in
 * whatever form it has one, and it gets typed in here.
 */
export function SchoolDetailScreen({ initial }: { initial: SchoolDetail }) {
  const router = useRouter();
  const [school, setSchool] = useState(initial);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "teacher" | "student">("all");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [planOpen, setPlanOpen] = useState(false);
  const [personDraft, setPersonDraft] = useState<PersonDraft | null>(null);
  const [editing, setEditing] = useState<SchoolPerson | null>(null);
  const [removing, setRemoving] = useState<SchoolPerson | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [credential, setCredential] = useState<{ email: string; password: string } | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/platform/schools/${school.id}`);
    const payload = await res.json().catch(() => null);
    if (res.ok && payload?.school) setSchool(payload.school);
    router.refresh();
  }, [router, school.id]);

  const people = useMemo(() => {
    const q = search.trim().toLowerCase();
    return school.people.filter((p) => {
      if (roleFilter !== "all" && p.role !== roleFilter) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q);
    });
  }, [school.people, search, roleFilter]);

  async function send(url: string, init: RequestInit & { json?: unknown }) {
    setBusy(true);
    setFormError(null);
    setFieldErrors({});

    const headers: HeadersInit = init.json !== undefined ? { "content-type": "application/json" } : {};
    const res = await fetch(url, {
      ...init,
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
    const payload = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setFieldErrors(payload.fields ?? {});
      setFormError(payload.fields ? null : (payload.error ?? "That didn't work."));
      return null;
    }

    return payload;
  }

  return (
    <div className="space-y-9">
      {notice ? (
        <p role="status" className="rounded-xl border-2 border-ink bg-lime-wash px-4 py-3 text-sm text-ink">
          {notice}
        </p>
      ) : null}

      {/* ---- the plan ---- */}
      <section className="rounded-xl border-2 border-ink bg-paper-pure p-5 shadow-[4px_4px_0_var(--ink)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow text-ink-soft">Plan</p>
            <p className="mt-2 flex flex-wrap items-center gap-2 font-display text-xl font-extrabold capitalize text-ink">
              {school.plan}
              {school.plan !== school.storedPlan ? (
                <span className="font-sans text-xs font-normal text-ink-soft">
                  (stored as &ldquo;{school.storedPlan}&rdquo; — the date is what makes it {school.plan})
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              {school.plan === "expired" ? "Ended" : "Runs until"}{" "}
              {new Date(school.planValidUntil).toLocaleDateString(undefined, {
                day: "numeric", month: "long", year: "numeric",
              })}
              {school.plan !== "expired" ? ` · ${school.daysRemaining} days left` : ""}
              {" · "}
              {school.counts.students} / {school.maxStudents} students
            </p>
          </div>

          <Button variant="ink" onClick={() => setPlanOpen(true)}>Change plan</Button>
        </div>

        {school.counts.students > school.maxStudents ? (
          <p className="mt-4 rounded-lg border-2 border-ink bg-coral-wash px-3.5 py-2.5 text-sm text-ink">
            This school is over its cap. Nobody is removed — the school simply
            cannot add more students until the cap is raised.
          </p>
        ) : null}
      </section>

      {/* ---- what's in it ---- */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {([
          ["Admins", school.counts.admins], ["Teachers", school.counts.teachers],
          ["Students", school.counts.students], ["Classes", school.counts.sections],
          ["Subjects", school.counts.subjects], ["Questions", school.counts.questions],
          ["Papers", school.counts.tests], ["Sittings", school.counts.attempts],
        ] as const).map(([label, value]) => (
          <div key={label} className="rounded-lg border-2 border-ink bg-paper-pure px-3 py-2.5">
            <p className="eyebrow text-[0.6rem] text-ink-soft">{label}</p>
            <p className="mt-1 font-display text-lg font-extrabold tabular-nums text-ink">{value}</p>
          </div>
        ))}
      </section>

      {/* ---- people ---- */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-ink">People</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Added here, they can sign in immediately — the school does not
              have to do anything.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => { setPersonDraft(blankDraft("teacher", school)); setCredential(null); }}
            >
              Add teacher
            </Button>
            <Button
              onClick={() => { setPersonDraft(blankDraft("student", school)); setCredential(null); }}
              disabled={school.sections.length === 0}
            >
              Add student
            </Button>
          </div>
        </div>

        {school.sections.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">
            This school has no classes yet, so students have nowhere to go. Sign
            in as its admin to create one first.
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <input
            type="search"
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            aria-label="Search people"
            className="h-11 min-w-0 flex-1 rounded-lg border-2 border-ink bg-paper-pure px-3.5 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cobalt/30 sm:max-w-xs"
          />
          <div className="flex flex-wrap gap-1.5">
            {(["all", "admin", "teacher", "student"] as const).map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setRoleFilter(role)}
                aria-pressed={roleFilter === role}
                className={cn(
                  "min-h-11 rounded-lg border-2 border-ink px-3 font-display text-xs font-bold capitalize transition-colors sm:min-h-0 sm:py-2",
                  roleFilter === role ? "bg-ink text-paper" : "bg-paper-pure text-ink-soft hover:bg-lime-wash hover:text-ink"
                )}
              >
                {role}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <TableFrame
            tone="cobalt"
            head={
              <tr>
                <Th className="text-white">Name</Th>
                <Th className="text-white">Role</Th>
                <Th className="text-white">Class</Th>
                <Th className="text-white text-right">Actions</Th>
              </tr>
            }
          >
            {people.map((person) => (
              <Tr key={person.id}>
                <Td>
                  <span className="font-display font-bold">{person.name}</span>
                  <span className="block text-xs text-ink-soft">{person.email}</span>
                </Td>
                <Td>
                  <Pill tone={person.role === "admin" ? "lime" : person.role === "teacher" ? "coral" : "cobalt"}>
                    {person.role}
                  </Pill>
                </Td>
                <Td className="text-ink-soft">{person.sectionName ?? "—"}</Td>
                <Td className="text-right">
                  <div className="flex flex-wrap justify-end gap-1">
                    <RowButton onClick={() => { setEditing(person); setCredential(null); }}>Edit</RowButton>
                    <RowButton
                      onClick={async () => {
                        const out = await send(`/api/platform/schools/${school.id}/people/${person.id}`, {
                          method: "PATCH", json: { resetPassword: true },
                        });
                        if (out) setCredential({ email: person.email, password: out.temporaryPassword });
                      }}
                    >
                      Reset password
                    </RowButton>
                    <RowButton tone="danger" onClick={() => setRemoving(person)}>Delete</RowButton>
                  </div>
                </Td>
              </Tr>
            ))}
          </TableFrame>

          <p className="mt-3 text-sm text-ink-soft">
            Showing {people.length} of {school.people.length}.
          </p>
        </div>
      </section>

      {credential ? (
        <div className="rounded-xl border-2 border-ink bg-lime-wash px-4 py-3.5">
          <p className="font-display text-sm font-bold text-ink">
            New password for {credential.email}
          </p>
          <p className="mt-1.5 font-mono text-base text-ink">{credential.password}</p>
          <p className="mt-1.5 text-xs text-ink-soft">
            Shown once. Copy it now and pass it on.
          </p>
        </div>
      ) : null}

      {/* ---- plan dialog ---- */}
      <Modal
        open={planOpen}
        onOpenChange={(open: boolean) => setPlanOpen(open)}
        title="Set this school's plan"
        description="There is no payment step. Money changes hands elsewhere; this records the result."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPlanOpen(false)}>Cancel</Button>
            <Button variant="ink" type="submit" form="plan-form" disabled={busy}>
              {busy ? "Saving…" : "Save plan"}
            </Button>
          </>
        }
      >
        <PlanForm
          school={school}
          formError={formError}
          fieldErrors={fieldErrors}
          onSubmit={async (values) => {
            const out = await send(`/api/platform/schools/${school.id}`, {
              method: "PATCH", json: values,
            });
            if (out) {
              setSchool(out.school);
              setPlanOpen(false);
              setNotice(`Plan set to ${values.plan}.`);
              router.refresh();
            }
          }}
        />
      </Modal>

      {/* ---- add person ---- */}
      <Modal
        open={personDraft !== null}
        onOpenChange={(open: boolean) => { if (!open) setPersonDraft(null); }}
        title={personDraft?.role === "teacher" ? "Add a teacher" : "Add a student"}
        description="Leave the password blank and we'll generate one and show it once."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPersonDraft(null)}>Cancel</Button>
            <Button variant="ink" type="submit" form="person-form" disabled={busy}>
              {busy ? "Adding…" : "Add"}
            </Button>
          </>
        }
      >
        {personDraft ? (
          <PersonForm
            id="person-form"
            draft={personDraft}
            setDraft={setPersonDraft}
            sections={school.sections}
            formError={formError}
            fieldErrors={fieldErrors}
            onSubmit={async () => {
              const out = await send(`/api/platform/schools/${school.id}/people`, {
                method: "POST",
                json: {
                  role: personDraft.role,
                  name: personDraft.name,
                  email: personDraft.email,
                  sectionId: personDraft.role === "student" ? personDraft.sectionId : undefined,
                  password: personDraft.password || undefined,
                },
              });
              if (out) {
                setPersonDraft(null);
                if (out.temporaryPassword) {
                  setCredential({ email: out.person.email, password: out.temporaryPassword });
                }
                setNotice(`${out.person.name} added.`);
                await refresh();
              }
            }}
          />
        ) : null}
      </Modal>

      {/* ---- edit person ---- */}
      <Modal
        open={editing !== null}
        onOpenChange={(open: boolean) => { if (!open) setEditing(null); }}
        title="Edit this person"
        description="Only what you change is saved."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="ink" type="submit" form="edit-form" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        {editing ? (
          <PersonForm
            id="edit-form"
            draft={{
              role: editing.role === "admin" ? "teacher" : editing.role,
              name: editing.name,
              email: editing.email,
              sectionId: editing.sectionId ?? "",
              password: "",
            }}
            setDraft={(next) =>
              setEditing((e) =>
                e ? { ...e, name: next.name, email: next.email, sectionId: next.sectionId || null } : e
              )
            }
            sections={school.sections}
            showSection={editing.role === "student"}
            formError={formError}
            fieldErrors={fieldErrors}
            onSubmit={async () => {
              const out = await send(`/api/platform/schools/${school.id}/people/${editing.id}`, {
                method: "PATCH",
                json: {
                  name: editing.name,
                  email: editing.email,
                  ...(editing.role === "student" && editing.sectionId
                    ? { sectionId: editing.sectionId }
                    : {}),
                },
              });
              if (out) {
                setEditing(null);
                setNotice("Saved.");
                await refresh();
              }
            }}
          />
        ) : null}
      </Modal>

      {/* ---- delete ---- */}
      <Modal
        open={removing !== null}
        onOpenChange={(open: boolean) => { if (!open) setRemoving(null); }}
        title={`Remove ${removing?.name ?? ""}?`}
        description="This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (!removing) return;
                const out = await send(
                  `/api/platform/schools/${school.id}/people/${removing.id}`,
                  { method: "DELETE" }
                );
                if (out) {
                  setNotice(
                    out.removedAttempts > 0
                      ? `${removing.name} removed, along with ${out.removedAttempts} sitting(s).`
                      : `${removing.name} removed.`
                  );
                  setRemoving(null);
                  await refresh();
                }
              }}
            >
              {busy ? "Removing…" : "Remove"}
            </Button>
          </>
        }
      >
        {formError ? <FormError>{formError}</FormError> : (
          <p className="text-sm text-ink-soft">
            {removing?.role === "student"
              ? "Their answers and marks go too — a mark belonging to no student is worse than no mark."
              : "Their account is removed. Papers and questions they wrote stay with the school."}
          </p>
        )}
      </Modal>

      <div>
        <Button variant="outline" render={<Link href="/platform">All schools</Link>} />
      </div>
    </div>
  );
}

type PersonDraft = {
  role: "teacher" | "student";
  name: string;
  email: string;
  sectionId: string;
  password: string;
};

function blankDraft(role: "teacher" | "student", school: SchoolDetail): PersonDraft {
  return {
    role,
    name: "",
    email: "",
    sectionId: school.sections.length === 1 ? school.sections[0].id : "",
    password: "",
  };
}

function RowButton({
  children, onClick, tone = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center rounded-md border-2 border-transparent px-2.5 font-display text-xs font-bold tracking-tight transition-colors sm:min-h-0 sm:py-1",
        "focus-visible:border-ink focus-visible:outline-none",
        tone === "danger"
          ? "text-danger hover:border-danger hover:bg-danger-wash"
          : "text-ink-soft hover:border-ink hover:bg-lime-wash hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

function PersonForm({
  id, draft, setDraft, sections, showSection, formError, fieldErrors, onSubmit,
}: {
  id: string;
  draft: PersonDraft;
  setDraft: (next: PersonDraft) => void;
  sections: { id: string; name: string }[];
  showSection?: boolean;
  formError: string | null;
  fieldErrors: Record<string, string>;
  onSubmit: () => void;
}) {
  const wantsSection = showSection ?? draft.role === "student";

  return (
    <form
      id={id}
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
    >
      {formError ? <FormError>{formError}</FormError> : null}

      <Field
        label="Name" required autoFocus placeholder="Aisha Khan"
        value={draft.name}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, name: e.target.value })}
        error={fieldErrors.name}
      />
      <Field
        label="Email" required type="email" placeholder="aisha.khan@school.edu"
        value={draft.email}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, email: e.target.value })}
        error={fieldErrors.email}
      />
      {wantsSection ? (
        <div>
          <SelectInput
            label="Class"
            value={draft.sectionId}
            onChange={(value: string) => setDraft({ ...draft, sectionId: value })}
          >
            <option value="">Choose a class…</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </SelectInput>
          {fieldErrors.sectionId ? (
            <p className="mt-1.5 text-sm text-danger">{fieldErrors.sectionId}</p>
          ) : null}
        </div>
      ) : null}
      {id === "person-form" ? (
        <Field
          label="Password (optional)" type="text" placeholder="Leave blank to generate one"
          value={draft.password}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, password: e.target.value })}
          error={fieldErrors.password}
        />
      ) : null}
    </form>
  );
}

function PlanForm({
  school, formError, fieldErrors, onSubmit,
}: {
  school: SchoolDetail;
  formError: string | null;
  fieldErrors: Record<string, string>;
  onSubmit: (values: { plan: string; planValidUntil: string; maxStudents: number }) => void;
}) {
  const [plan, setPlan] = useState(school.storedPlan);
  const [until, setUntil] = useState(() => toLocalInput(school.planValidUntil));
  const [cap, setCap] = useState(String(school.maxStudents));

  return (
    <form
      id="plan-form"
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          plan,
          planValidUntil: new Date(until).toISOString(),
          maxStudents: Number(cap),
        });
      }}
    >
      {formError ? <FormError>{formError}</FormError> : null}

      <div>
        <SelectInput
          label="Plan"
          value={plan}
          onChange={(value: string) => setPlan(value as typeof plan)}
        >
          <option value="trial">Trial</option>
          <option value="active">Active (paid)</option>
          <option value="expired">Expired</option>
        </SelectInput>
        {fieldErrors.plan ? (
          <p className="mt-1.5 text-sm text-danger">{fieldErrors.plan}</p>
        ) : null}
      </div>

      <div>
        <label className="eyebrow block text-ink-soft" htmlFor="plan-until">
          Runs until
        </label>
        <input
          id="plan-until"
          type="datetime-local"
          value={until}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUntil(e.target.value)}
          className="mt-2 h-11 w-full rounded-lg border-2 border-ink bg-paper-pure px-3.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cobalt/30"
        />
        <p className="mt-1.5 text-xs text-ink-soft">
          The date decides. &ldquo;Active&rdquo; with a date in the past still
          reads as expired everywhere in the app.
        </p>
      </div>

      <Field
        label="Student cap" required type="number" min={0}
        value={cap}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCap(e.target.value)}
        error={fieldErrors.maxStudents}
        hint={`${school.counts.students} students on the roll now.`}
      />
    </form>
  );
}

/** A Date to the value a datetime-local input wants, in local time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
