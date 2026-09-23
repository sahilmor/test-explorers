import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { SetupError } from "@/lib/errors";
import {
  isDayKey,
  periodLabel,
  periodWindow,
  slotState,
  type DayKey,
  type LabTiming,
  type PeriodWindow,
  type SlotState,
} from "@/lib/scheduling-shared";
import Lab from "@/models/Lab";
import Section from "@/models/Section";
import Test from "@/models/Test";
import TestAssignment from "@/models/TestAssignment";
import TestSlot from "@/models/TestSlot";

/**
 * The timetable for a paper.
 *
 * A year group of two hundred and one lab of forty means the same paper runs
 * five times across three days. This is where that gets written down: each
 * class-section gets a lab, a date and a period, and once it has one that slot
 * is what decides when its students may start.
 *
 * Double-booking is prevented by a unique index on
 * `{ schoolId, labId, day, period }` rather than by a check in this file. Two
 * teachers scheduling into the same period at the same moment is exactly the
 * case a read-then-write check loses, and the database does not lose it.
 */

export type ScheduledSlot = {
  id: string;
  testId: string;
  sectionId: string;
  sectionName: string;
  labId: string;
  labName: string;
  day: DayKey;
  period: number;
  periodLabel: string;
  startsAt: string;
  endsAt: string;
  state: SlotState;
  /** Null unless a teacher has opened this session. Never sent to students. */
  accessCode: string | null;
  activatedByName: string | null;
  activatedAt: string | null;
};

export type TestSchedule = {
  test: { id: string; title: string; subjectName: string | null; durationMinutes: number };
  labs: { id: string; name: string; periodsPerDay: number }[];
  /** Every section this paper is assigned to, scheduled or not. */
  sections: {
    id: string;
    name: string;
    studentCount: number;
    slot: ScheduledSlot | null;
  }[];
  slots: ScheduledSlot[];
  /** The days that have anything on them, earliest first. */
  days: DayKey[];
};

function timingOf(lab: { periodsPerDay: number; firstPeriodStartsAt: string; periodMinutes: number }): LabTiming {
  return {
    periodsPerDay: lab.periodsPerDay,
    firstPeriodStartsAt: lab.firstPeriodStartsAt,
    periodMinutes: lab.periodMinutes,
  };
}

function toSlot(
  doc: { _id: unknown; testId: unknown; sectionId: unknown; labId: unknown; day: string; period: number },
  labs: Map<string, { name: string } & LabTiming>,
  sections: Map<string, string>,
  now: Date,
  activatedBy?: Map<string, string>
): ScheduledSlot {
  const lab = labs.get(String(doc.labId));
  const timing: LabTiming = lab ?? { periodsPerDay: 1, firstPeriodStartsAt: "09:00", periodMinutes: 45 };
  const window = periodWindow(doc.day, doc.period, timing);

  return {
    id: String(doc._id),
    testId: String(doc.testId),
    sectionId: String(doc.sectionId),
    sectionName: sections.get(String(doc.sectionId)) ?? "Unknown class",
    labId: String(doc.labId),
    labName: lab?.name ?? "Unknown lab",
    day: doc.day,
    period: doc.period,
    periodLabel: periodLabel(doc.period, timing),
    startsAt: window.startsAt.toISOString(),
    endsAt: window.endsAt.toISOString(),
    state: slotState(window, now),
    accessCode: (doc as { accessCode?: string | null }).accessCode ?? null,
    activatedByName: activatedBy?.get(String((doc as { activatedBy?: unknown }).activatedBy)) ?? null,
    activatedAt:
      (doc as { activatedAt?: Date | null }).activatedAt?.toISOString() ?? null,
  };
}

/** Everything the scheduling screen needs, in one read. */
export async function getTestSchedule(
  schoolId: string,
  testId: string,
  now: Date = new Date()
): Promise<TestSchedule> {
  await connectToDatabase();

  const test = await Test.findOne({ _id: testId, schoolId }).lean();
  if (!test) throw new SetupError("No such test.", 404);

  const [labDocs, assignments, slotDocs, subject] = await Promise.all([
    Lab.find({ schoolId }).sort({ name: 1 }).lean(),
    TestAssignment.find({ schoolId, testId }).select("sectionId").lean(),
    TestSlot.find({ schoolId, testId }).lean(),
    mongoose.models.Subject
      ? mongoose.models.Subject.findOne({ _id: test.subjectId, schoolId }).select("name").lean()
      : null,
  ]);

  const sectionIds = assignments.map((a) => a.sectionId);
  const sectionDocs = await Section.find({ _id: { $in: sectionIds }, schoolId })
    .select("name")
    .sort({ name: 1 })
    .lean();

  const labs = new Map(
    labDocs.map((l) => [String(l._id), { name: l.name, ...timingOf(l) }])
  );
  const sections = new Map(sectionDocs.map((s) => [String(s._id), s.name]));

  const activatorIds = slotDocs
    .map((d) => (d as { activatedBy?: unknown }).activatedBy)
    .filter(Boolean);
  const activators = activatorIds.length
    ? await mongoose.models.User.find({ _id: { $in: activatorIds } })
        .select("name")
        .lean()
    : [];
  const activatedBy = new Map(
    (activators as { _id: unknown; name: string }[]).map((u) => [String(u._id), u.name])
  );

  const slots = slotDocs.map((s) => toSlot(s, labs, sections, now, activatedBy));
  const bySection = new Map(slots.map((s) => [s.sectionId, s]));

  const studentCounts = await mongoose.models.User.aggregate<{ _id: unknown; n: number }>([
    { $match: { schoolId: new mongoose.Types.ObjectId(schoolId), role: "student", sectionId: { $in: sectionIds } } },
    { $group: { _id: "$sectionId", n: { $sum: 1 } } },
  ]);
  const counts = new Map(studentCounts.map((c) => [String(c._id), c.n]));

  return {
    test: {
      id: String(test._id),
      title: test.title,
      subjectName: (subject as { name?: string } | null)?.name ?? null,
      durationMinutes: test.durationMinutes,
    },
    labs: labDocs.map((l) => ({
      id: String(l._id),
      name: l.name,
      periodsPerDay: l.periodsPerDay,
    })),
    sections: sectionDocs.map((s) => ({
      id: String(s._id),
      name: s.name,
      studentCount: counts.get(String(s._id)) ?? 0,
      slot: bySection.get(String(s._id)) ?? null,
    })),
    slots: slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    days: [...new Set(slots.map((s) => s.day))].sort(),
  };
}

export type ScheduleInput = {
  sectionId: string;
  labId: string;
  day: DayKey;
  period: number;
};

/**
 * Puts one section in the timetable, or moves it.
 *
 * An upsert keyed on `{ testId, sectionId }`, so rescheduling is the same
 * operation as scheduling. The lab's own unique index is what refuses a
 * double-booking, and the error it throws is translated here into something a
 * teacher can act on.
 */
export async function scheduleSection(
  schoolId: string,
  testId: string,
  scheduledBy: string,
  input: ScheduleInput
): Promise<ScheduledSlot> {
  await connectToDatabase();

  if (!isDayKey(input.day)) {
    throw new SetupError("Pick a date.", 400, "day");
  }

  const [test, lab, assignment] = await Promise.all([
    Test.findOne({ _id: testId, schoolId }).select("_id status").lean(),
    Lab.findOne({ _id: input.labId, schoolId }).lean(),
    TestAssignment.findOne({ schoolId, testId, sectionId: input.sectionId }).lean(),
  ]);

  if (!test) throw new SetupError("No such test.", 404);
  if (!lab) throw new SetupError("Pick a lab that exists in your school.", 400, "labId");

  // Scheduling a class that was never set the paper would create a sitting
  // nobody can attend.
  if (!assignment) {
    throw new SetupError(
      "That class isn't set this paper. Assign it first, then give it a slot.",
      400,
      "sectionId"
    );
  }

  if (input.period < 1 || input.period > lab.periodsPerDay) {
    throw new SetupError(
      `${lab.name} runs ${lab.periodsPerDay} periods a day.`,
      400,
      "period"
    );
  }

  try {
    const slot = await TestSlot.findOneAndUpdate(
      { testId, sectionId: input.sectionId },
      {
        $set: {
          schoolId,
          testId,
          sectionId: input.sectionId,
          labId: input.labId,
          day: input.day,
          period: input.period,
          scheduledBy,
        },
      },
      { new: true, upsert: true }
    ).lean();

    const schedule = await getTestSchedule(schoolId, testId);
    const created = schedule.slots.find((s) => s.id === String(slot!._id));
    if (!created) throw new SetupError("Could not read that slot back.", 500);
    return created;
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) {
      // The lab is already taken for that period — by this paper or another.
      const clash = await TestSlot.findOne({
        schoolId,
        labId: input.labId,
        day: input.day,
        period: input.period,
      }).lean();

      const [clashSection, clashTest] = await Promise.all([
        clash ? Section.findById(clash.sectionId).select("name").lean() : null,
        clash ? Test.findById(clash.testId).select("title").lean() : null,
      ]);

      throw new SetupError(
        clashSection && clashTest
          ? `${lab.name} is already booked then — ${clashSection.name} is sitting "${clashTest.title}". Pick another period, day or lab.`
          : `${lab.name} is already booked for that period. Pick another period, day or lab.`,
        409,
        "period"
      );
    }
    throw error;
  }
}

export async function unscheduleSection(
  schoolId: string,
  testId: string,
  sectionId: string
): Promise<{ sectionId: string }> {
  await connectToDatabase();

  const result = await TestSlot.deleteOne({ schoolId, testId, sectionId });
  if (result.deletedCount === 0) {
    throw new SetupError("That class isn't scheduled.", 404);
  }

  return { sectionId };
}

export type SlotWindow = {
  slot: ScheduledSlot;
  window: PeriodWindow;
};

/**
 * The slot governing one student's attempt at one paper, if there is one.
 *
 * Returns null when the paper has not been scheduled for that section, which
 * is the ordinary case for a school that does not use labs — those fall back
 * to the paper's own opensAt/closesAt window, exactly as before.
 */
export async function slotFor(
  schoolId: string,
  testId: string,
  sectionId: string,
  now: Date = new Date()
): Promise<SlotWindow | null> {
  await connectToDatabase();

  const doc = await TestSlot.findOne({ schoolId, testId, sectionId }).lean();
  if (!doc) return null;

  const lab = await Lab.findOne({ _id: doc.labId, schoolId }).lean();
  if (!lab) return null;

  const labs = new Map([[String(lab._id), { name: lab.name, ...timingOf(lab) }]]);
  const section = await Section.findById(sectionId).select("name").lean();
  const sections = new Map([[sectionId, section?.name ?? "Your class"]]);

  return {
    slot: toSlot(doc, labs, sections, now),
    window: periodWindow(doc.day, doc.period, timingOf(lab)),
  };
}

/** Everything booked in a school's labs across a range of days. */
export async function labTimetable(
  schoolId: string,
  days: DayKey[],
  now: Date = new Date()
): Promise<ScheduledSlot[]> {
  await connectToDatabase();

  const docs = await TestSlot.find({ schoolId, day: { $in: days } }).lean();
  if (docs.length === 0) return [];

  const [labDocs, sectionDocs] = await Promise.all([
    Lab.find({ schoolId }).lean(),
    Section.find({ schoolId }).select("name").lean(),
  ]);

  const labs = new Map(labDocs.map((l) => [String(l._id), { name: l.name, ...timingOf(l) }]));
  const sections = new Map(sectionDocs.map((s) => [String(s._id), s.name]));

  return docs
    .map((d) => toSlot(d, labs, sections, now))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

// ---------------------------------------------------------------------------
// In-lab access codes
// ---------------------------------------------------------------------------

/**
 * No 0/O or 1/I/L — a code read aloud across a lab has to survive being
 * misheard, and a student mistyping it is a hand up the invigilator does not
 * need.
 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

function newCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

/**
 * Opens a sitting.
 *
 * Only while the slot is actually running: a code that can be generated in
 * advance is a code that can be shared in advance, which is the whole thing
 * this exists to prevent. Re-opening returns the same code rather than a new
 * one, so a teacher who refreshes does not lock out the class who already
 * wrote the first one down.
 *
 * Who opened it is recorded on the slot. That is the accountability log.
 */
export async function activateSlot(
  schoolId: string,
  testId: string,
  sectionId: string,
  activatedBy: string,
  now: Date = new Date()
): Promise<ScheduledSlot> {
  await connectToDatabase();

  const doc = await TestSlot.findOne({ schoolId, testId, sectionId }).lean();
  if (!doc) throw new SetupError("That class isn't scheduled for this paper.", 404);

  const lab = await Lab.findOne({ _id: doc.labId, schoolId }).lean();
  if (!lab) throw new SetupError("That lab no longer exists.", 404);

  const window = periodWindow(doc.day, doc.period, timingOf(lab));
  const state = slotState(window, now);

  if (state === "upcoming") {
    throw new SetupError(
      `Too early. This sitting opens at ${window.startsAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} — the code doesn't exist until then.`,
      409
    );
  }
  if (state === "finished") {
    throw new SetupError("That sitting has finished. The code is no longer valid.", 409);
  }

  if (!doc.accessCode) {
    await TestSlot.updateOne(
      { _id: doc._id, accessCode: null },
      { $set: { accessCode: newCode(), activatedBy, activatedAt: now } }
    );
  }

  const schedule = await getTestSchedule(schoolId, testId, now);
  const slot = schedule.slots.find((s) => s.sectionId === sectionId);
  if (!slot) throw new SetupError("Could not read that slot back.", 500);
  return slot;
}

/**
 * Checks a code a student typed.
 *
 * Scoped to their own section's slot, so another class's live code is no use,
 * and only while that slot is running.
 */
export async function verifyAccessCode(
  schoolId: string,
  testId: string,
  sectionId: string,
  code: string,
  now: Date = new Date()
): Promise<boolean> {
  await connectToDatabase();

  const doc = await TestSlot.findOne({ schoolId, testId, sectionId })
    .select("accessCode labId day period")
    .lean();

  if (!doc?.accessCode) return false;

  const lab = await Lab.findOne({ _id: doc.labId, schoolId }).lean();
  if (!lab) return false;

  if (slotState(periodWindow(doc.day, doc.period, timingOf(lab)), now) !== "live") {
    return false;
  }

  return doc.accessCode.toUpperCase() === code.trim().toUpperCase();
}
