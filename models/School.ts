import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { PLANS, TRIAL_MAX_STUDENTS } from "@/lib/plans";

export { PLANS, TRIAL_DAYS, TRIAL_MAX_STUDENTS } from "@/lib/plans";
export type { Plan } from "@/lib/plans";

/** Razorpay's own words for where a payment got to. */
export const PAYMENT_STATUSES = [
  "created",
  "captured",
  "failed",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * One attempt at paying, successful or not.
 *
 * Failures are kept as well as captures. A school that says "I paid and
 * nothing happened" is answerable from this array alone, and a row that never
 * reached `captured` is the evidence that nothing was charged.
 */
const paymentSchema = new Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: "INR" },
    razorpayOrderId: { type: String, required: true },
    razorpayPaymentId: { type: String, default: null },
    status: { type: String, enum: PAYMENT_STATUSES, required: true },
    /** Why it failed, in Razorpay's words, for the rare support conversation. */
    failureReason: { type: String, default: null },
    createdAt: { type: Date, required: true, default: () => new Date() },
  },
  { _id: true }
);

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

    // --- billing ---------------------------------------------------------
    // `plan` is what was last set; `planValidUntil` is what makes it true.
    // Read them through `effectivePlan` in lib/plans.ts rather than trusting
    // `plan` on its own, because nothing runs to flip it when a date passes.
    plan: { type: String, enum: PLANS, required: true, default: "trial" },
    planValidUntil: { type: Date, required: true },
    maxStudents: {
      type: Number,
      required: true,
      min: 0,
      default: TRIAL_MAX_STUDENTS,
    },
    razorpayCustomerId: { type: String, default: null },
    subscriptionHistory: { type: [paymentSchema], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// The owner view sorts by plan and by when a school signed up; the platform
// will have every school in one collection, so it is worth an index early.
schoolSchema.index({ plan: 1, planValidUntil: 1 });

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
