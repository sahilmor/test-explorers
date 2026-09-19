import mongoose, { type Mongoose } from "mongoose";

type MongooseCache = {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
};

// In dev, Next.js hot-reloads modules on every edit. Without a cache on the
// global object each reload would open a brand new connection pool and
// eventually exhaust the Atlas connection limit.
const globalForMongoose = globalThis as typeof globalThis & {
  _mongoose?: MongooseCache;
};

const cached: MongooseCache = (globalForMongoose._mongoose ??= {
  conn: null,
  promise: null,
});

/**
 * Connects to MongoDB, reusing an existing connection when there is one.
 *
 * The env var is read here rather than at module load so that `next build`
 * (which imports every route module) does not fail on machines or CI runs
 * that have no database configured.
 */
export async function connectToDatabase(): Promise<Mongoose> {
  if (cached.conn) return cached.conn;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "Missing MONGODB_URI environment variable. Copy .env.local.example to .env.local and set your MongoDB connection string (or add it in the Vercel project settings)."
    );
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, { bufferCommands: false });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    // Drop the rejected promise so the next request retries instead of
    // replaying the same failure forever.
    cached.promise = null;
    throw error;
  }

  return cached.conn;
}

export default connectToDatabase;
