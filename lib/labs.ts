import { connectToDatabase } from "@/lib/db";
import { SetupError } from "@/lib/errors";
import {
  MAX_PERIODS_PER_DAY,
  MAX_PERIOD_MINUTES,
  MIN_PERIOD_MINUTES,
  isClockTime,
  periodLabel,
  periodsOf,
  type LabTiming,
} from "@/lib/scheduling-shared";
import Lab from "@/models/Lab";
import TestSlot from "@/models/TestSlot";

/** Labs, as part of school setup. Same shape as sections and subjects. */

export type LabRow = {
  id: string;
  name: string;
  capacity: number | null;
  periodsPerDay: number;
  firstPeriodStartsAt: string;
  periodMinutes: number;
  /** "09:00 – 09:45" for each period, so the UI need not recompute it. */
  periodLabels: { period: number; label: string }[];
};

function decorate(doc: {
  _id: unknown;
  name: string;
  capacity?: number | null;
  periodsPerDay: number;
  firstPeriodStartsAt: string;
  periodMinutes: number;
}): LabRow {
  const timing: LabTiming = {
    periodsPerDay: doc.periodsPerDay,
    firstPeriodStartsAt: doc.firstPeriodStartsAt,
    periodMinutes: doc.periodMinutes,
  };

  return {
    id: String(doc._id),
    name: doc.name,
    capacity: doc.capacity ?? null,
    periodsPerDay: doc.periodsPerDay,
    firstPeriodStartsAt: doc.firstPeriodStartsAt,
    periodMinutes: doc.periodMinutes,
    periodLabels: periodsOf(timing).map((period) => ({
      period,
      label: periodLabel(period, timing),
    })),
  };
}

export async function listLabs(schoolId: string): Promise<LabRow[]> {
  await connectToDatabase();
  const docs = await Lab.find({ schoolId }).sort({ name: 1 }).lean();
  return docs.map(decorate);
}

export type LabInput = {
  name: string;
  capacity?: number | null;
  periodsPerDay: number;
  firstPeriodStartsAt: string;
  periodMinutes: number;
};

function validate(input: LabInput) {
  if (!isClockTime(input.firstPeriodStartsAt)) {
    throw new SetupError("Use a time like 09:00.", 400, "firstPeriodStartsAt");
  }
  if (input.periodsPerDay < 1 || input.periodsPerDay > MAX_PERIODS_PER_DAY) {
    throw new SetupError(
      `A lab can have between 1 and ${MAX_PERIODS_PER_DAY} periods a day.`,
      400,
      "periodsPerDay"
    );
  }
  if (input.periodMinutes < MIN_PERIOD_MINUTES || input.periodMinutes > MAX_PERIOD_MINUTES) {
    throw new SetupError(
      `A period runs between ${MIN_PERIOD_MINUTES} and ${MAX_PERIOD_MINUTES} minutes.`,
      400,
      "periodMinutes"
    );
  }
}

function duplicateName(error: unknown): boolean {
  return (error as { code?: number })?.code === 11000;
}

export async function createLab(schoolId: string, input: LabInput): Promise<LabRow> {
  await connectToDatabase();
  validate(input);

  try {
    const lab = await Lab.create({ schoolId, ...input });
    return decorate(lab.toObject());
  } catch (error) {
    if (duplicateName(error)) {
      throw new SetupError(`You already have a lab called "${input.name}".`, 409, "name");
    }
    throw error;
  }
}

export async function updateLab(
  schoolId: string,
  id: string,
  input: LabInput
): Promise<LabRow> {
  await connectToDatabase();
  validate(input);

  // Shrinking the day would orphan slots that sit in the periods being
  // removed, and a class turning up to a period that no longer exists is a
  // worse outcome than an awkward error message here.
  const stranded = await TestSlot.countDocuments({
    schoolId,
    labId: id,
    period: { $gt: input.periodsPerDay },
  });

  if (stranded > 0) {
    throw new SetupError(
      `${stranded} scheduled sitting${stranded === 1 ? " is" : "s are"} in a period past ${input.periodsPerDay}. Move ${stranded === 1 ? "it" : "them"} first, then shorten the day.`,
      409,
      "periodsPerDay"
    );
  }

  try {
    const lab = await Lab.findOneAndUpdate({ _id: id, schoolId }, { $set: input }, { new: true }).lean();
    if (!lab) throw new SetupError("No such lab.", 404);
    return decorate(lab);
  } catch (error) {
    if (duplicateName(error)) {
      throw new SetupError(`You already have a lab called "${input.name}".`, 409, "name");
    }
    throw error;
  }
}

export async function deleteLab(schoolId: string, id: string): Promise<{ id: string }> {
  await connectToDatabase();

  const booked = await TestSlot.countDocuments({ schoolId, labId: id });
  if (booked > 0) {
    throw new SetupError(
      `${booked} sitting${booked === 1 ? " is" : "s are"} scheduled in this lab. Cancel ${booked === 1 ? "it" : "them"} before deleting it.`,
      409
    );
  }

  const result = await Lab.deleteOne({ _id: id, schoolId });
  if (result.deletedCount === 0) throw new SetupError("No such lab.", 404);

  return { id };
}

/** The timing a slot's window is computed from. */
export async function labTiming(schoolId: string, labId: string): Promise<LabTiming> {
  await connectToDatabase();

  const lab = await Lab.findOne({ _id: labId, schoolId })
    .select("periodsPerDay firstPeriodStartsAt periodMinutes")
    .lean();

  if (!lab) throw new SetupError("No such lab.", 404);

  return {
    periodsPerDay: lab.periodsPerDay,
    firstPeriodStartsAt: lab.firstPeriodStartsAt,
    periodMinutes: lab.periodMinutes,
  };
}
