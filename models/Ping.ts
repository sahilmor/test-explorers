import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

// Throwaway model used only to prove the database connection works end to end.
// It will be removed once real models land.
const pingSchema = new Schema(
  {
    message: { type: String, required: true },
  },
  { timestamps: true }
);

export type Ping = InferSchemaType<typeof pingSchema>;

// Model definitions survive hot reloads, so reuse the compiled model if it
// is already registered.
export const PingModel: Model<Ping> =
  (mongoose.models.Ping as Model<Ping>) ??
  mongoose.model<Ping>("Ping", pingSchema);

export default PingModel;
