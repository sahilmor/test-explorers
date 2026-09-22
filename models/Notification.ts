import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const NOTIFICATION_KINDS = ["test_assigned", "results_published"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_STATUSES = ["sending", "sent", "failed"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/**
 * One notification, to one person, about one thing.
 *
 * This row exists so an email is sent once. Nothing else in the app has a
 * natural place to remember "we already told Aisha her result is out", and the
 * triggers are all things that can happen repeatedly — a teacher reassigning a
 * paper, the sweep running every few minutes, two requests racing. Without a
 * record, a class of forty gets told forty times.
 *
 * The unique index is the mechanism, not a check in code above it: the insert
 * *is* the claim. Whoever's insert succeeds owns the send; a duplicate-key
 * error means somebody else already has it, which is an answer rather than a
 * problem.
 */
const notificationSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    kind: { type: String, enum: NOTIFICATION_KINDS, required: true },
    /** What it is about. A test, for both kinds so far. */
    testId: { type: Schema.Types.ObjectId, ref: "Test", required: true },
    /** Who it went to. */
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    email: { type: String, required: true },
    status: { type: String, enum: NOTIFICATION_STATUSES, required: true, default: "sending" },
    /** The provider's id, for chasing a delivery later. */
    providerId: { type: String, default: null },
    error: { type: String, default: null },
    sentAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// The whole point of the collection. One notification of a kind, per test,
// per person, ever.
notificationSchema.index({ kind: 1, testId: 1, userId: 1 }, { unique: true });

export type NotificationDoc = InferSchemaType<typeof notificationSchema>;

export const Notification: Model<NotificationDoc> =
  (mongoose.models.Notification as Model<NotificationDoc>) ??
  mongoose.model<NotificationDoc>("Notification", notificationSchema);

export default Notification;
