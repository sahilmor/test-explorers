import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * One class-section sitting one paper, in one lab, at one period.
 *
 * Separate from TestAssignment, which says only *that* a section has been set
 * a paper. A slot says when and where, and once one exists it is what decides
 * whether a student may start — not the paper's own window.
 *
 * Two unique indexes carry the rules, rather than a check somewhere above
 * them:
 *
 *  - `{ schoolId, labId, day, period }` — a lab cannot hold two classes at
 *    once. This is the double-booking rule, and it is enforced by the
 *    database, so two teachers scheduling at the same moment cannot both win.
 *  - `{ testId, sectionId }` — a section sits a given paper once. Rescheduling
 *    updates the slot rather than adding a second one.
 */
const testSlotSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    testId: { type: Schema.Types.ObjectId, ref: "Test", required: true, index: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", required: true },
    labId: { type: Schema.Types.ObjectId, ref: "Lab", required: true },

    /** "YYYY-MM-DD" in the school's own local time. */
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    /** 1-based, within the lab's periodsPerDay. */
    period: { type: Number, required: true, min: 1, max: 12 },

    /** Who put it in the timetable. */
    scheduledBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

testSlotSchema.index({ schoolId: 1, labId: 1, day: 1, period: 1 }, { unique: true });
testSlotSchema.index({ testId: 1, sectionId: 1 }, { unique: true });
// The student's question — "is there a slot for me right now?"
testSlotSchema.index({ schoolId: 1, sectionId: 1, day: 1 });

export type TestSlotDoc = InferSchemaType<typeof testSlotSchema>;

export const TestSlot: Model<TestSlotDoc> =
  (mongoose.models.TestSlot as Model<TestSlotDoc>) ??
  mongoose.model<TestSlotDoc>("TestSlot", testSlotSchema);

export default TestSlot;
