import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import {
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  TEST_STATUSES,
} from "@/lib/tests-shared";

// Re-exported so server code has one import for "everything about tests",
// while client components import the Mongoose-free module directly.
export {
  TEST_STATUSES,
  MIN_DURATION_MINUTES,
  MAX_DURATION_MINUTES,
  MAX_AUTO_QUESTIONS,
  CLOSING_SOON_MS,
  testState,
  humanGap,
  type TestStatus,
  type TestState,
} from "@/lib/tests-shared";

const testSchema = new Schema(
  {
    // Tenant boundary. Always set from the verified session, never from input.
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    subjectId: {
      type: Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true,
    },
    durationMinutes: {
      type: Number,
      required: true,
      min: MIN_DURATION_MINUTES,
      max: MAX_DURATION_MINUTES,
    },
    questionIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Question" }],
      default: [],
    },
    opensAt: { type: Date, required: true },
    closesAt: { type: Date, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: TEST_STATUSES, required: true, default: "draft" },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// A window that ends before it starts would make a test permanently invisible,
// so the database refuses it however it was written.
testSchema.pre("validate", async function () {
  if (this.opensAt && this.closesAt && this.closesAt <= this.opensAt) {
    this.invalidate("closesAt", "A test has to close after it opens.");
  }
});

// The teacher's list: this school's tests, newest first.
testSchema.index({ schoolId: 1, createdAt: -1 });

export type TestDoc = InferSchemaType<typeof testSchema>;

export const Test: Model<TestDoc> =
  (mongoose.models.Test as Model<TestDoc>) ??
  mongoose.model<TestDoc>("Test", testSchema);

export default Test;
