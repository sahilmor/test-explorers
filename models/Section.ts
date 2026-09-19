import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const MIN_GRADE = 1;
export const MAX_GRADE = 13;

const sectionSchema = new Schema(
  {
    // Tenant boundary. Always set from the verified session, never from input.
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    grade: {
      type: Number,
      required: true,
      min: MIN_GRADE,
      max: MAX_GRADE,
    },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// Unique per school, not globally — two schools may both have "Grade 9 - A".
// Enforced in the database so a double-submit cannot create a duplicate.
sectionSchema.index(
  { schoolId: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

// Sections list grouped by grade.
sectionSchema.index({ schoolId: 1, grade: 1, name: 1 });

export type SectionDoc = InferSchemaType<typeof sectionSchema>;

export const Section: Model<SectionDoc> =
  (mongoose.models.Section as Model<SectionDoc>) ??
  mongoose.model<SectionDoc>("Section", sectionSchema);

export default Section;
