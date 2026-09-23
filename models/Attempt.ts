import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import {
  ATTEMPT_STATUSES,
  AUTO_SUBMIT_REASONS,
  VIOLATION_KINDS,
} from "@/lib/attempts-shared";
import { OPTION_COUNT } from "@/lib/questions-shared";

// Re-exported so server code has one import for "everything about attempts",
// while client components import the Mongoose-free module directly.
export {
  ATTEMPT_STATUSES,
  URGENT_MS,
  RESYNC_INTERVAL_MS,
  AUTOSAVE_DEBOUNCE_MS,
  questionState,
  formatCountdown,
  attemptDeadline,
  type AttemptStatus,
  type QuestionState,
} from "@/lib/attempts-shared";

/**
 * One response. Embedded in the attempt rather than kept in its own
 * collection: a student's answers are only ever read and written together, as
 * one document, which makes an autosave a single indexed update.
 */
const responseSchema = new Schema(
  {
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },
    // null means "visited but not answered" — which is different from the
    // question not appearing here at all, which means "never opened".
    selectedOptionIndex: {
      type: Number,
      required: false,
      default: null,
      min: 0,
      max: OPTION_COUNT - 1,
    },
    markedForReview: { type: Boolean, required: true, default: false },
  },
  { _id: false }
);

const attemptSchema = new Schema(
  {
    // Tenant boundary. Always set from the verified session, never from input.
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    testId: {
      type: Schema.Types.ObjectId,
      ref: "Test",
      required: true,
      index: true,
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Copied from the student's record at start time, so a later section
    // change cannot retroactively move a sitting.
    sectionId: {
      type: Schema.Types.ObjectId,
      ref: "Section",
      required: true,
    },

    startedAt: { type: Date, required: true },
    submittedAt: { type: Date, required: false, default: null },
    /**
     * Every time this student left the test screen.
     *
     * Stored rather than counted in the browser, because a student who wants
     * their warnings back would otherwise only have to refresh. It survives a
     * crash, a flat battery and a change of device, exactly as the answers do.
     */
    violations: {
      type: [
        new Schema(
          {
            kind: { type: String, enum: VIOLATION_KINDS, required: true },
            at: { type: Date, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },

    /**
     * Why this was submitted without the student pressing the button.
     *
     * "deadline" is the clock running out, which is ordinary. "integrity" is
     * the third violation, and results show it differently — a paper taken
     * away is not the same fact as a paper handed in late.
     */
    autoSubmitReason: { type: String, enum: AUTO_SUBMIT_REASONS, default: null },

    status: {
      type: String,
      enum: ATTEMPT_STATUSES,
      required: true,
      default: "in_progress",
    },

    responses: { type: [responseSchema], default: [] },

    /** When the last autosave actually landed. Shown back to the student. */
    lastSavedAt: { type: Date, required: false, default: null },

    // --- the mark ---------------------------------------------------------
    //
    // Computed once, as part of the same call that sets a submitted status,
    // and stored here so no screen ever has to recompute it. All four counts
    // are absolute values written with $set, which is what makes re-grading
    // an already-graded attempt a no-op rather than a double count.
    //
    // `score` is the number of correct answers; the percentage is derived from
    // score/totalQuestions wherever it is shown.
    score: { type: Number, required: false, default: null },
    totalQuestions: { type: Number, required: false, default: null },
    correctCount: { type: Number, required: false, default: null },
    incorrectCount: { type: Number, required: false, default: null },
    unansweredCount: { type: Number, required: false, default: null },
    gradedAt: { type: Date, required: false, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// One attempt per student per test. This is the index that makes "open the
// test in a second tab" resume rather than start again — the second insert
// simply cannot succeed.
attemptSchema.index({ testId: 1, studentId: 1 }, { unique: true });

// The sweep's query: everything still running, oldest first.
attemptSchema.index({ status: 1, startedAt: 1 });

// The teacher's results view: this test's attempts, best first.
attemptSchema.index({ schoolId: 1, testId: 1, status: 1 });

// The leaderboard: everything a section has submitted, across tests.
attemptSchema.index({ schoolId: 1, sectionId: 1, status: 1 });

export type AttemptDoc = InferSchemaType<typeof attemptSchema>;

export const Attempt: Model<AttemptDoc> =
  (mongoose.models.Attempt as Model<AttemptDoc>) ??
  mongoose.model<AttemptDoc>("Attempt", attemptSchema);

export default Attempt;
