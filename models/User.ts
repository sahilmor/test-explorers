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
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    classId: { type: Schema.Types.ObjectId, required: false, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// Most reads are "this school's users", so lead the compound index with
// schoolId. Listing by role within a school is the common dashboard query.
userSchema.index({ schoolId: 1, role: 1 });

export type UserDoc = InferSchemaType<typeof userSchema>;

export const User: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) ??
  mongoose.model<UserDoc>("User", userSchema);

export default User;
