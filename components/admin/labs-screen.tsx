"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FormError, ImplicitSubmit } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Pill, TableFrame, Td, Th, Tr } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { AdminHeader, RowAction } from "@/components/admin/admin-page";
import type { LabRow } from "@/lib/labs";
import {
  DEFAULT_FIRST_PERIOD_STARTS_AT,
  DEFAULT_PERIODS_PER_DAY,
  DEFAULT_PERIOD_MINUTES,
} from "@/lib/scheduling-shared";

type Draft = {
  id: string | null;
  name: string;
  capacity: string;
  periodsPerDay: string;
  firstPeriodStartsAt: string;
  periodMinutes: string;
};

const BLANK: Draft = {
  id: null,
  name: "",
  capacity: "",
  periodsPerDay: String(DEFAULT_PERIODS_PER_DAY),
  firstPeriodStartsAt: DEFAULT_FIRST_PERIOD_STARTS_AT,
  periodMinutes: String(DEFAULT_PERIOD_MINUTES),
};

/**
 * The rooms tests get sat in.
 *
 * A school with one lab and two hundred students runs the same paper five
 * times, so a lab is not a setting — it is the thing the timetable is built
 * out of. Its day is defined here once and every slot's window is computed
 * from it.
 */
export function LabsScreen({ initial }: { initial: LabRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<LabRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function refresh() {
    const res = await fetch("/api/labs");
    const payload = await res.json().catch(() => null);
    if (res.ok && payload?.labs) setRows(payload.labs);
    router.refresh();
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setFormError(null);
    setFieldErrors({});

    const body = {
      name: draft.name,
      capacity: draft.capacity === "" ? null : Number(draft.capacity),
      periodsPerDay: Number(draft.periodsPerDay),
      firstPeriodStartsAt: draft.firstPeriodStartsAt,
      periodMinutes: Number(draft.periodMinutes),
    };

    const res = await fetch(draft.id ? `/api/labs/${draft.id}` : "/api/labs", {
      method: draft.id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setFieldErrors(payload.fields ?? {});
      setFormError(payload.fields ? null : (payload.error ?? "That didn't work."));
      return;
    }

    setDraft(null);
    await refresh();
  }

  return (
    <div className="space-y-8">
      <AdminHeader
        eyebrow="School setup"
        title="Labs"
        blurb="The rooms your tests get sat in. Each one defines its own school day, and the test timetable is built out of these."
        action={<Button onClick={() => setDraft(BLANK)}>Add a lab</Button>}
      />

      {rows.length === 0 ? (
        <EmptyState
          tone="cobalt"
          title="No labs yet"
          body="Add the room your students sit tests in. Most schools start with one — you only need more than one if you can run classes in parallel."
          action={
            <Button variant="ink" size="lg" onClick={() => setDraft(BLANK)}>
              Add your first lab
            </Button>
          }
          hint="Without a lab you can still run tests on their own open/close window — labs are for scheduling class by class."
        />
      ) : (
        <TableFrame
          head={
            <tr>
              <Th>Lab</Th>
              <Th>School day</Th>
              <Th>Periods</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          }
        >
          {rows.map((lab) => (
            <Tr key={lab.id}>
              <Td>
                <span className="font-display font-bold">{lab.name}</span>
                {lab.capacity ? (
                  <span className="block text-xs text-ink-soft">
                    about {lab.capacity} machines
                  </span>
                ) : null}
              </Td>
              <Td className="text-ink-soft">
                {lab.periodsPerDay} × {lab.periodMinutes} min from {lab.firstPeriodStartsAt}
              </Td>
              <Td>
                <span className="flex flex-wrap gap-1.5">
                  {lab.periodLabels.map((p) => (
                    <Pill key={p.period}>
                      {p.period}. {p.label}
                    </Pill>
                  ))}
                </span>
              </Td>
              <Td className="text-right">
                <div className="flex justify-end gap-1">
                  <RowAction
                    onClick={() =>
                      setDraft({
                        id: lab.id,
                        name: lab.name,
                        capacity: lab.capacity === null ? "" : String(lab.capacity),
                        periodsPerDay: String(lab.periodsPerDay),
                        firstPeriodStartsAt: lab.firstPeriodStartsAt,
                        periodMinutes: String(lab.periodMinutes),
                      })
                    }
                  >
                    Edit
                  </RowAction>
                  <RowAction tone="danger" onClick={() => setRemoving(lab)}>
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
        onOpenChange={(open) => { if (!open) setDraft(null); }}
        title={draft?.id ? "Edit this lab" : "Add a lab"}
        description="The school day defined here is what every scheduled sitting in this lab is timed against."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            <Button variant="ink" type="submit" form="lab-form" disabled={busy}>
              {busy ? "Saving…" : draft?.id ? "Save lab" : "Add lab"}
            </Button>
          </>
        }
      >
        <form
          id="lab-form"
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(e) => { e.preventDefault(); void save(); }}
        >
          <ImplicitSubmit />
          {formError ? <FormError>{formError}</FormError> : null}

          <Field
            label="Name" required autoFocus placeholder="Computer Lab 1"
            value={draft?.name ?? ""}
            onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
            error={fieldErrors.name}
          />
          <Field
            label="Machines (optional)" type="number" min={0} placeholder="40"
            hint="Only used to help you plan how many sittings a year group needs."
            value={draft?.capacity ?? ""}
            onChange={(e) => setDraft((d) => (d ? { ...d, capacity: e.target.value } : d))}
            error={fieldErrors.capacity}
          />

          <div className="grid gap-5 sm:grid-cols-3">
            <Field
              label="First period at" required type="time"
              value={draft?.firstPeriodStartsAt ?? ""}
              onChange={(e) => setDraft((d) => (d ? { ...d, firstPeriodStartsAt: e.target.value } : d))}
              error={fieldErrors.firstPeriodStartsAt}
            />
            <Field
              label="Period length" required type="number" min={15} max={240}
              hint="minutes"
              value={draft?.periodMinutes ?? ""}
              onChange={(e) => setDraft((d) => (d ? { ...d, periodMinutes: e.target.value } : d))}
              error={fieldErrors.periodMinutes}
            />
            <Field
              label="Periods a day" required type="number" min={1} max={12}
              value={draft?.periodsPerDay ?? ""}
              onChange={(e) => setDraft((d) => (d ? { ...d, periodsPerDay: e.target.value } : d))}
              error={fieldErrors.periodsPerDay}
            />
          </div>

          <p className="text-xs leading-relaxed text-ink-soft">
            Periods run back to back from the start time. Breaks and assemblies
            aren&apos;t modelled — pick the period that best covers when the
            class will actually be sitting.
          </p>
        </form>
      </Modal>

      <Modal
        open={removing !== null}
        onOpenChange={(open) => { if (!open) setRemoving(null); }}
        title={`Delete ${removing?.name ?? ""}?`}
        description="This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (!removing) return;
                setBusy(true);
                setFormError(null);
                const res = await fetch(`/api/labs/${removing.id}`, { method: "DELETE" });
                const payload = await res.json().catch(() => ({}));
                setBusy(false);
                if (!res.ok) {
                  setFormError(payload.error ?? "Could not delete that lab.");
                  return;
                }
                setRemoving(null);
                await refresh();
              }}
            >
              {busy ? "Deleting…" : "Delete lab"}
            </Button>
          </>
        }
      >
        {formError ? (
          <FormError>{formError}</FormError>
        ) : (
          <p className="text-sm text-ink-soft">
            A lab with sittings already scheduled in it can&apos;t be deleted —
            cancel those first.
          </p>
        )}
      </Modal>
    </div>
  );
}
