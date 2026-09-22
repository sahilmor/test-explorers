import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import School, { slugifySchoolName } from "@/models/School";
import { TRIAL_DAYS, TRIAL_MAX_STUDENTS } from "@/lib/plans";
import User, { type Role } from "@/models/User";
import type { SignupInput } from "@/lib/validation";

/**
 * bcrypt work factor.
 *
 * 10 rather than 12, deliberately. `bcryptjs` is pure JavaScript and runs on
 * the request thread: measured on an M-series Mac it costs ~54ms per hash at
 * 10 and ~203ms at 12. A 300-student CSV import has to hash every row, so cost
 * 12 would take a minute of CPU on Vercel's slower machines and hit the
 * function timeout. 10 is the OWASP floor for bcrypt and a common default.
 *
 * Existing hashes keep working if this changes — bcrypt stores the cost inside
 * the hash, so old passwords still verify at whatever factor they were made
 * with.
 */
const BCRYPT_ROUNDS = 10;

export class AccountError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly field?: string
  ) {
    super(message);
    this.name = "AccountError";
  }
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** MongoDB's duplicate-key error, whatever driver version produced it. */
function isDuplicateKey(error: unknown): error is { keyPattern?: Record<string, unknown> } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function duplicateField(error: unknown): string | undefined {
  if (!isDuplicateKey(error)) return undefined;
  const pattern = (error as { keyPattern?: Record<string, unknown> }).keyPattern;
  return pattern ? Object.keys(pattern)[0] : undefined;
}

/**
 * Standalone mongod (no replica set) rejects transactions outright. That is a
 * topology limitation, not a failure of this particular write, so it is the
 * one case where falling back to the two-step path is correct.
 *
 * Mongoose wraps the driver's error, so the telltale `codeName` can be one or
 * two levels down under `originalError` or `cause` rather than on the error
 * that was actually thrown. Walk the chain rather than only checking the top.
 */
export function isTransactionUnsupported(error: unknown, depth = 0): boolean {
  if (typeof error !== "object" || error === null || depth > 4) return false;

  const candidate = error as {
    message?: unknown;
    codeName?: unknown;
    code?: unknown;
    originalError?: unknown;
    cause?: unknown;
  };

  const message = String(candidate.message ?? "");
  const codeName = String(candidate.codeName ?? "");

  if (
    codeName === "IllegalOperation" ||
    candidate.code === 20 ||
    /Transaction numbers are only allowed on a replica set member or mongos/i.test(message) ||
    /transactions are not supported/i.test(message) ||
    /Transaction.*not supported/i.test(message)
  ) {
    return true;
  }

  return (
    isTransactionUnsupported(candidate.originalError, depth + 1) ||
    isTransactionUnsupported(candidate.cause, depth + 1)
  );
}

async function uniqueSlug(base: string): Promise<string> {
  const root = base || "school";
  // Try the clean slug, then -2, -3… A race between two identical names is
  // still caught by the unique index and surfaces as a duplicate-key error.
  for (let n = 1; n <= 50; n++) {
    const candidate = n === 1 ? root : `${root}-${n}`;
    const taken = await School.exists({ slug: candidate });
    if (!taken) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export type SignupResult = {
  schoolId: string;
  schoolName: string;
  slug: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
};

/**
 * Creates a school and its first admin user as one unit.
 *
 * Preferred path is a real transaction. If the deployment cannot do
 * transactions (a standalone mongod, typically a developer laptop) we fall
 * back to a two-step write that deletes the school again if the user insert
 * fails — so a half-built school never survives either way.
 */
export async function createSchoolWithAdmin(
  input: SignupInput
): Promise<SignupResult> {
  await connectToDatabase();

  const existing = await User.findOne({ email: input.email })
    .select("_id")
    .lean();
  if (existing) {
    throw new AccountError(
      "That email already has an account. Try signing in instead.",
      409,
      "email"
    );
  }

  const slug = await uniqueSlug(slugifySchoolName(input.schoolName));
  const passwordHash = await hashPassword(input.password);
  const planValidUntil = new Date(
    Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000
  );

  const schoolFields = {
    name: input.schoolName,
    slug,
    plan: "trial" as const,
    planValidUntil,
    // Set at signup rather than inferred at read time, so a school's cap is a
    // fact about that school and does not silently change under it when the
    // trial allowance is revised for new signups.
    maxStudents: TRIAL_MAX_STUDENTS,
  };

  const build = (school: { _id: mongoose.Types.ObjectId }): SignupResult => ({
    schoolId: String(school._id),
    schoolName: input.schoolName,
    slug,
    userId: "",
    name: input.name,
    email: input.email,
    role: "admin",
  });

  try {
    return await createBothInTransaction(input, schoolFields, passwordHash, build);
  } catch (error) {
    if (isTransactionUnsupported(error)) {
      return createBothWithRollback(input, schoolFields, passwordHash, build);
    }
    if (duplicateField(error) === "email") {
      throw new AccountError(
        "That email already has an account. Try signing in instead.",
        409,
        "email"
      );
    }
    throw error;
  }
}

async function createBothInTransaction(
  input: SignupInput,
  schoolFields: Record<string, unknown>,
  passwordHash: string,
  build: (school: { _id: mongoose.Types.ObjectId }) => SignupResult
): Promise<SignupResult> {
  const session = await mongoose.startSession();
  try {
    let result!: SignupResult;

    await session.withTransaction(async () => {
      const [school] = await School.create([schoolFields], { session });
      const [user] = await User.create(
        [
          {
            schoolId: school._id,
            name: input.name,
            email: input.email,
            passwordHash,
            role: "admin",
          },
        ],
        { session }
      );

      result = { ...build(school), userId: String(user._id) };
    });

    return result;
  } finally {
    await session.endSession();
  }
}

async function createBothWithRollback(
  input: SignupInput,
  schoolFields: Record<string, unknown>,
  passwordHash: string,
  build: (school: { _id: mongoose.Types.ObjectId }) => SignupResult
): Promise<SignupResult> {
  const school = await School.create(schoolFields);

  try {
    const user = await User.create({
      schoolId: school._id,
      name: input.name,
      email: input.email,
      passwordHash,
      role: "admin",
    });

    return { ...build(school), userId: String(user._id) };
  } catch (error) {
    // Undo the school so signup is all-or-nothing here too.
    await School.deleteOne({ _id: school._id }).catch(() => {});

    if (duplicateField(error) === "email") {
      throw new AccountError(
        "That email already has an account. Try signing in instead.",
        409,
        "email"
      );
    }
    throw error;
  }
}

export type AuthenticatedUser = {
  userId: string;
  schoolId: string;
  role: Role;
  name: string;
  email: string;
};

/**
 * Checks an email/password pair. Returns null for both "no such user" and
 * "wrong password" — telling them apart would let someone enumerate which
 * emails have accounts.
 */
export async function authenticate(
  email: string,
  password: string
): Promise<AuthenticatedUser | null> {
  await connectToDatabase();

  // passwordHash has `select: false` on the schema, so ask for it explicitly.
  const user = await User.findOne({ email }).select("+passwordHash");

  if (!user) {
    // Spend roughly the same time as a real comparison so response timing
    // doesn't reveal whether the account exists.
    await bcrypt.compare(password, "$2b$12$" + "a".repeat(53));
    return null;
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;

  return {
    userId: String(user._id),
    schoolId: String(user.schoolId),
    role: user.role,
    name: user.name,
    email: user.email,
  };
}
