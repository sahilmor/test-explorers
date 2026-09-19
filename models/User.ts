import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const ROLES = ["admin", "teacher", "student"] as const;
export type Role = (typeof ROLES)[number];

const userSchema = new Schema(
  {
    // Every user belongs to exactly one school. This field is the tenant
    // boundary: every query for user-owned data must filter on it, and its
    // value must only ever come from a verified JWT.
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // Unique across the whole system, not per school, because login is by
    // email alone — two accounts sharing one address would make "who is
    // signing in?" ambiguous.
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },

    // --- students -------------------------------------------------------
    // A student sits in exactly one section. Null for admins and teachers.
    sectionId: {
      type: Schema.Types.ObjectId,
      ref: "Section",
      required: false,
      default: null,
    },

    // --- teachers -------------------------------------------------------
    // What a teacher teaches, and to whom. Empty for admins and students.
    subjectIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Subject" }],
      default: [],
    },
    sectionIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Section" }],
      default: [],
    },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// Most reads are "this school's users", so lead the compound index with
// schoolId. Listing by role within a school is the common dashboard query.
userSchema.index({ schoolId: 1, role: 1 });

// "Students in this section", the students screen's default filter.
userSchema.index({ schoolId: 1, sectionId: 1 });

export type UserDoc = InferSchemaType<typeof userSchema>;

export const User: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) ??
  mongoose.model<UserDoc>("User", userSchema);

export default User;
