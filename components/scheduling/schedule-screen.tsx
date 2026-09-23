"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { Pill } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { AdminHeader } from "@/components/admin/admin-page";
import { SelectInput } from "@/components/admin/admin-page";
import { toDayKey } from "@/lib/scheduling-shared";
import type { TestSchedule } from "@/lib/scheduling";
import { cn } from "cn";

/**
 * The rollout of one paper across however many days it takes.
 *
 * Two halves. Above, a row per class-section with a lab, a date and a period
 * to fill in — the thing a teacher actually does. Below, the timetable those
 * choices produce, with periods down the side and labs across, so the whole
 * rollout is visible at once rather than inferred from a list.
 */
export function ScheduleScreen({ initial }: { initial: TestSchedule }) {
  const router = useRouter();
  const [schedule, setSchedule] = useState(initial);
  const [busySection, setBusySection] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewDay, setViewDay] = useState<string>(
    () => initial.days[0] ?? toDayKey(new Date())
  );

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/tests/${schedule.test.id}/schedule`);
    const payload = await res.json().catch(() => null);
    if (res.ok && payload?.schedule) setSchedule(payload.schedule);
    router.refresh();
  }, [router, schedule.test.id]);

  async function book(sectionId: string, values: { labId: string; day: string; period: number }) {
    setBusySection(sectionId);
    setError(null);

    const res = await fetch(`/api/tests/${schedule.test.id}/schedule`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sectionId, ...values }),
    });
    const payload = await res.json().catch(() => ({}));
    setBusySection(null);

    if (!res.ok) {
      setError(payload.error ?? "Could not book that slot.");
      return;
    }

    setViewDay(values.day);
    await refresh();
  }

  async function cancel(sectionId: string) {
    setBusySection(sectionId);
    setError(null);

    const res = await fetch(
      `/api/tests/${schedule.test.id}/schedule?sectionId=${sectionId}`,
      { method: "DELETE" }
    );
    setBusySection(null);

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error ?? "Could not cancel that slot.");
      return;
    }

    await refresh();
  }

  const scheduledCount = schedule.sections.filter((s) => s.slot).length;

  return (
    <div className="space-y-9">
      <AdminHeader
        eyebrow={schedule.test.subjectName ?? "Scheduling"}
        title={schedule.test.title}
        blurb={`${schedule.test.durationMinutes} minutes per sitting. Give each class a lab, a date and a period — once a class has a slot, that is the only time its students can start.`}
        action={
          <Button variant="outline" render={<Link href="/teacher/tests">All tests</Link>} />
        }
      />

      {error ? <FormError>{error}</FormError> : null}

      {schedule.labs.length === 0 ? (
        <EmptyState
          tone="coral"
          title="No labs to schedule into"
          body="A sitting happens in a lab at a period, so your school needs at least one lab before this paper can be timetabled. An admin adds them on the Labs tab."
        />
      ) : schedule.sections.length === 0 ? (
        <EmptyState
          tone="cobalt"
          title="This paper isn't set for any class yet"
          body="Assign it to the classes sitting it first, then come back and give each one a lab and a period."
          action={
            <Button variant="ink" render={<Link href="/teacher/tests">Go to the tests list</Link>} />
          }
        />
      ) : (
        <>
          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-display text-xl font-bold tracking-tight text-ink">
                Who sits it when
              </h2>
              <p className="text-sm text-ink-soft">
                {scheduledCount} of {schedule.sections.length} classes scheduled
              </p>
            </div>

            <ul className="mt-4 space-y-3">
              {schedule.sections.map((section) => (
                <SectionRow
                  key={section.id}
                  section={section}
                  labs={schedule.labs}
                  busy={busySection === section.id}
                  onBook={(values) => void book(section.id, values)}
                  onCancel={() => void cancel(section.id)}
                />
              ))}
            </ul>
          </section>

          {schedule.days.length > 0 ? (
            <section>
              <h2 className="font-display text-xl font-bold tracking-tight text-ink">
                The timetable
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                Periods down the side, labs across. This is the whole rollout.
              </p>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {schedule.days.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setViewDay(day)}
                    aria-pressed={viewDay === day}
                    className={cn(
                      "min-h-11 rounded-lg border-2 border-ink px-3.5 font-display text-sm font-bold transition-colors sm:min-h-0 sm:py-2",
                      viewDay === day
                        ? "bg-ink text-paper"
                        : "bg-paper-pure text-ink-soft hover:bg-lime-wash hover:text-ink"
                    )}
                  >
                    {new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
                      weekday: "short", day: "numeric", month: "short",
                    })}
                  </button>
                ))}
              </div>

              <Timetable schedule={schedule} day={viewDay} />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function SectionRow({
  section, labs, busy, onBook, onCancel,
}: {
  section: TestSchedule["sections"][number];
  labs: TestSchedule["labs"];
  busy: boolean;
  onBook: (values: { labId: string; day: string; period: number }) => void;
  onCancel: () => void;
}) {
  const [labId, setLabId] = useState(section.slot?.labId ?? labs[0]?.id ?? "");
  const [day, setDay] = useState(section.slot?.day ?? toDayKey(new Date()));
  const [period, setPeriod] = useState(String(section.slot?.period ?? 1));

  const lab = labs.find((l) => l.id === labId);
  const periods = Array.from({ length: lab?.periodsPerDay ?? 0 }, (_, i) => i + 1);

  return (
    <li className="rounded-xl border-2 border-ink bg-paper-pure p-4 shadow-[3px_3px_0_var(--ink)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display font-bold text-ink">{section.name}</p>
          <p className="text-xs text-ink-soft">
            {section.studentCount} student{section.studentCount === 1 ? "" : "s"}
          </p>
        </div>

        {section.slot ? (
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={section.slot.state === "live" ? "lime" : section.slot.state === "finished" ? "coral" : "cobalt"}>
              {section.slot.state === "live" ? "Sitting now" : section.slot.state === "finished" ? "Finished" : "Scheduled"}
            </Pill>
            <span className="text-sm text-ink">
              {section.slot.labName} · period {section.slot.period} · {section.slot.periodLabel}
              {" · "}
              {new Date(`${section.slot.day}T00:00:00`).toLocaleDateString(undefined, {
                weekday: "short", day: "numeric", month: "short",
              })}
            </span>
          </div>
        ) : (
          <Pill>Not scheduled</Pill>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <SelectInput label="Lab" value={labId} onChange={setLabId}>
          {labs.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </SelectInput>

        <div className="flex flex-col gap-2">
          <label
            htmlFor={`day-${section.id}`}
            className="font-display text-[0.8rem] font-bold uppercase tracking-[0.12em] text-ink"
          >
            Date
          </label>
          <input
            id={`day-${section.id}`}
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="h-11 rounded-lg border-2 border-ink bg-paper-pure px-3.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cobalt/30"
          />
        </div>

        <SelectInput label="Period" value={period} onChange={setPeriod}>
          {periods.map((p) => (
            <option key={p} value={String(p)}>Period {p}</option>
          ))}
        </SelectInput>

        <div className="flex gap-2">
          <Button
            disabled={busy || !labId}
            onClick={() => onBook({ labId, day, period: Number(period) })}
          >
            {busy ? "Saving…" : section.slot ? "Move" : "Book"}
          </Button>
          {section.slot ? (
            <Button variant="outline" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * One day's grid.
 *
 * Shows every lab the school has, not just the booked ones — an empty column
 * is the answer to "where else could this go?", which is the question a
 * teacher has after a clash.
 */
function Timetable({ schedule, day }: { schedule: TestSchedule; day: string }) {
  const onThisDay = useMemo(
    () => schedule.slots.filter((s) => s.day === day),
    [schedule.slots, day]
  );

  const maxPeriods = Math.max(1, ...schedule.labs.map((l) => l.periodsPerDay));
  const periods = Array.from({ length: maxPeriods }, (_, i) => i + 1);

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border-2 border-ink bg-paper-pure shadow-[5px_5px_0_var(--ink)]">
      <table className="w-full border-collapse text-left">
        <thead className="border-b-2 border-ink bg-lime">
          <tr>
            <th scope="col" className="eyebrow w-24 px-4 py-3 text-ink">Period</th>
            {schedule.labs.map((lab) => (
              <th key={lab.id} scope="col" className="eyebrow px-4 py-3 text-ink">
                {lab.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y-2 divide-ink/15">
          {periods.map((period) => (
            <tr key={period}>
              <th scope="row" className="whitespace-nowrap px-4 py-3 text-left align-top font-display text-sm font-bold text-ink">
                {period}
              </th>
              {schedule.labs.map((lab) => {
                const booked = onThisDay.find(
                  (s) => s.labId === lab.id && s.period === period
                );
                const beyond = period > lab.periodsPerDay;

                return (
                  <td key={lab.id} className="px-3 py-2.5 align-top">
                    {beyond ? (
                      <span className="text-xs text-ink-faint">—</span>
                    ) : booked ? (
                      <div
                        className={cn(
                          "rounded-lg border-2 border-ink px-3 py-2",
                          booked.state === "live"
                            ? "bg-lime"
                            : booked.state === "finished"
                              ? "bg-paper-deep"
                              : "bg-cobalt-wash"
                        )}
                      >
                        <p className="font-display text-sm font-bold text-ink">
                          {booked.sectionName}
                        </p>
                        <p className="text-xs text-ink-soft">{booked.periodLabel}</p>
                      </div>
                    ) : (
                      <span className="text-xs text-ink-faint">free</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
