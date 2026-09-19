import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { DIFFICULTIES, OPTION_COUNT } from "@/lib/questions-shared";

// Re-exported so server code has one import for "everything about questions",
// while client components import the Mongoose-free module directly.
export {
  DIFFICULTIES,
  OPTION_COUNT,
  OPTION_LETTERS,
  parseOptionLetter,
  optionLetter,
  type Difficulty,
} from "@/lib/questions-shared";

const questionSchema = new Schema(
  {
    // Tenant boundary. Always set from the verified session, never from input.
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    subjectId: {
      type: Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true,
    },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    imageUrl: { type: String, required: false, default: null },
    options: {
      type: [String],
      required: true,
      validate: {
        // Belt and braces alongside the Zod schema: the database will not
        // accept a question with the wrong number of options, or a blank one,
        // however it was written.
        validator: (value: string[]) =>
          Array.isArray(value) &&
          value.length === OPTION_COUNT &&
          value.every((o) => typeof o === "string" && o.trim().length > 0),
        message: `A question needs exactly ${OPTION_COUNT} non-empty options.`,
      },
    },
    correctOptionIndex: {
      type: Number,
      required: true,
      min: 0,
      max: OPTION_COUNT - 1,
      validate: {
        validator: Number.isInteger,
        message: "The correct option has to be a whole number.",
      },
    },
    difficulty: { type: String, enum: DIFFICULTIES, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// The main lookup pattern: "this school's questions for this subject", which
// is what both the list screen and (later) random test generation ask for.
questionSchema.index({ schoolId: 1, subjectId: 1 });

// Listing newest-first within a school, the list view's default order.
questionSchema.index({ schoolId: 1, createdAt: -1 });

export type QuestionDoc = InferSchemaType<typeof questionSchema>;

export const Question: Model<QuestionDoc> =
  (mongoose.models.Question as Model<QuestionDoc>) ??
  mongoose.model<QuestionDoc>("Question", questionSchema);

export default Question;

