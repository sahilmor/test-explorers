import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * One document per section a test is assigned to.
 *
 * A join collection rather than an array on Test, because the student
 * dashboard's question is "which tests are assigned to my section?" — which is
 * an indexed lookup here, and a collection scan the other way round.
 */
const testAssignmentSchema = new Schema(
  {
    testId: {
      type: Schema.Types.ObjectId,
      ref: "Test",
      required: true,
      index: true,
    },
    sectionId: {
      type: Schema.Types.ObjectId,
      ref: "Section",
      required: true,
      index: true,
    },
    // Denormalised from the test so the student dashboard can filter by school
    // without a join. Set from the verified session, never from input.
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// Assigning the same test to the same section twice is a no-op, not an error
// — the unique index makes that true at the database level.
testAssignmentSchema.index({ testId: 1, sectionId: 1 }, { unique: true });

// The student dashboard's lookup: "tests for my section, in my school".
testAssignmentSchema.index({ schoolId: 1, sectionId: 1 });

export type TestAssignmentDoc = InferSchemaType<typeof testAssignmentSchema>;

export const TestAssignment: Model<TestAssignmentDoc> =
  (mongoose.models.TestAssignment as Model<TestAssignmentDoc>) ??
  mongoose.model<TestAssignmentDoc>("TestAssignment", testAssignmentSchema);

export default TestAssignment;
