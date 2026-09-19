import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const subjectSchema = new Schema(
  {
    // Tenant boundary. Always set from the verified session, never from input.
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// Unique per school and case-insensitive, so "Physics" and "physics" collide.
subjectSchema.index(
  { schoolId: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

export type SubjectDoc = InferSchemaType<typeof subjectSchema>;

export const Subject: Model<SubjectDoc> =
  (mongoose.models.Subject as Model<SubjectDoc>) ??
  mongoose.model<SubjectDoc>("Subject", subjectSchema);

export default Subject;
