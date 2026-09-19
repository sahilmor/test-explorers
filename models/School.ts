import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const PLANS = ["trial"] as const;
export type Plan = (typeof PLANS)[number];

/** How long a new school's trial runs for. */
export const TRIAL_DAYS = 30;

const schoolSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
    plan: { type: String, enum: PLANS, required: true, default: "trial" },
    planValidUntil: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

export type SchoolDoc = InferSchemaType<typeof schoolSchema>;

export const School: Model<SchoolDoc> =
  (mongoose.models.School as Model<SchoolDoc>) ??
  mongoose.model<SchoolDoc>("School", schoolSchema);

export default School;

/**
 * Turns a school name into a URL-safe slug. Uniqueness is enforced by the
 * index, not here — callers handle the duplicate-key error.
 */
export function slugifySchoolName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
