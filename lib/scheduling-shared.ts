/**
 * When a period actually happens.
 *
 * No Mongoose, so the scheduling screen and the student's dashboard compute
 * the same window from the same function the server enforces. A period that
 * looks like 10:45 on screen and means something else on the server is the
 * kind of bug that only shows up on exam day.
 *
 * A lab defines its day as a start time, a period length and a count. Real
 * timetables have breaks, assemblies and half-days; this does not model them.
 * What it models is enough to say "Grade 9A sits this in Lab 2, third period
 * on the 14th", which is the thing schools actually need to agree on.
 */

/** A local wall-clock time, "HH:MM", as a school would write it. */
export type ClockTime = string;

export const DEFAULT_PERIODS_PER_DAY = 6;
export const DEFAULT_FIRST_PERIOD_STARTS_AT: ClockTime = "09:00";
export const DEFAULT_PERIOD_MINUTES = 45;

export const MAX_PERIODS_PER_DAY = 12;
export const MIN_PERIOD_MINUTES = 15;
export const MAX_PERIOD_MINUTES = 240;

/** A calendar day, "YYYY-MM-DD", with no timezone attached. */
export type DayKey = string;

export function isDayKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isClockTime(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [h, m] = value.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/** "2026-09-23" for a Date, in *local* time rather than UTC. */
export function toDayKey(date: Date): DayKey {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export type LabTiming = {
  periodsPerDay: number;
  firstPeriodStartsAt: ClockTime;
  periodMinutes: number;
};

export type PeriodWindow = { startsAt: Date; endsAt: Date };

/**
 * The window a given period occupies on a given day.
 *
 * Built from local date parts rather than by parsing an ISO string, so a
 * school in IST gets IST and nobody's third period lands at half past four in
 * the morning because the server is in UTC.
 */
export function periodWindow(
  day: DayKey,
  period: number,
  timing: LabTiming
): PeriodWindow {
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = timing.firstPeriodStartsAt.split(":").map(Number);

  const startsAt = new Date(year, month - 1, date, hour, minute, 0, 0);
  startsAt.setMinutes(startsAt.getMinutes() + (period - 1) * timing.periodMinutes);

  const endsAt = new Date(startsAt);
  endsAt.setMinutes(endsAt.getMinutes() + timing.periodMinutes);

  return { startsAt, endsAt };
}

/** "09:00 – 09:45", for a label. */
export function periodLabel(period: number, timing: LabTiming): string {
  const { startsAt, endsAt } = periodWindow("2000-01-01", period, timing);
  const fmt = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${fmt(startsAt)} – ${fmt(endsAt)}`;
}

export type SlotState = "upcoming" | "live" | "finished";

export function slotState(window: PeriodWindow, now: Date = new Date()): SlotState {
  if (now < window.startsAt) return "upcoming";
  if (now >= window.endsAt) return "finished";
  return "live";
}

/** Every period number a lab has, 1-based. */
export function periodsOf(timing: LabTiming): number[] {
  return Array.from({ length: timing.periodsPerDay }, (_, i) => i + 1);
}
