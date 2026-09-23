import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import {
  DEFAULT_FIRST_PERIOD_STARTS_AT,
  DEFAULT_PERIODS_PER_DAY,
  DEFAULT_PERIOD_MINUTES,
  MAX_PERIODS_PER_DAY,
  MAX_PERIOD_MINUTES,
  MIN_PERIOD_MINUTES,
} from "@/lib/scheduling-shared";

/**
 * A room with computers in it.
 *
 * Most schools running tests online have one lab and a queue of classes
 * waiting for it, which is the whole reason scheduling exists: a year group of
 * 200 and 40 machines means the same paper runs five times over three days.
 * Schools with several labs can run them in parallel, so a lab is a model
 * rather than a setting.
 *
 * The timetable lives on the lab because labs differ — the old lab does 45
 * minute periods, the new one an hour.
 */
const labSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    /** Roughly how many machines. Not enforced — it is there to plan with. */
    capacity: { type: Number, default: null, min: 0, max: 10_000 },
    periodsPerDay: {
      type: Number,
      required: true,
      min: 1,
      max: MAX_PERIODS_PER_DAY,
      default: DEFAULT_PERIODS_PER_DAY,
    },
    /** Local wall-clock "HH:MM" at the school, not UTC. */
    firstPeriodStartsAt: {
      type: String,
      required: true,
      default: DEFAULT_FIRST_PERIOD_STARTS_AT,
      match: /^\d{2}:\d{2}$/,
    },
    periodMinutes: {
      type: Number,
      required: true,
      min: MIN_PERIOD_MINUTES,
      max: MAX_PERIOD_MINUTES,
      default: DEFAULT_PERIOD_MINUTES,
    },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// Two labs in one school cannot share a name; the timetable would be unreadable.
labSchema.index({ schoolId: 1, name: 1 }, { unique: true });

export type LabDoc = InferSchemaType<typeof labSchema>;

export const Lab: Model<LabDoc> =
  (mongoose.models.Lab as Model<LabDoc>) ?? mongoose.model<LabDoc>("Lab", labSchema);

export default Lab;
