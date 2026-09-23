import mongoose, { type QueryFilter } from "mongoose";
import { hashPassword } from "@/lib/accounts";
import { connectToDatabase } from "@/lib/db";
import { SetupError } from "@/lib/errors";
import {
  assertCanAddStudents,
  assertPlanActive,
  studentCapMessage,
} from "@/lib/entitlements";
import Section from "@/models/Section";
import Subject from "@/models/Subject";
import User, { type UserDoc } from "@/models/User";
import { parseCsv, toObjects, STUDENT_CSV_COLUMNS } from "@/lib/csv";

/**
 * School-setup operations.
 *
 * Every function here takes `schoolId` as its first argument and the callers
 * — route handlers wrapped in `withAuth` — can only pass the value from the
 * verified session. Nothing in this file reads a request.
 */

// Defined in lib/errors.ts and re-exported here, because this module has been
// the place to import it from since Phase 2 and there is no reason to make
// every caller change.
export { SetupError } from "@/lib/errors";

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}

/** Escapes a user-typed search string so it cannot act as a regex. */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A readable temporary password: two words, a number and a symbol. Built from
 * crypto randomness, not Math.random, because it is a real credential until
 * the teacher or student changes it.
 */
export function generateTempPassword(): string {
  const words = [
    "amber", "brisk", "cedar", "delta", "ember", "flint", "grove", "hazel",
    "ivory", "jade", "kite", "lumen", "maple", "nimbus", "onyx", "prism",
    "quartz", "river", "slate", "tidal", "umber", "vivid", "willow", "zephyr",
  ];

  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);

  const first = words[bytes[0] % words.length];
  const second = words[bytes[1] % words.length];
  const number = 10 + (((bytes[2] << 8) | bytes[3]) % 90);

  return `${first}-${second}-${number}`;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export async function listSections(schoolId: string) {
  await connectToDatabase();

  const sections = await Section.find({ schoolId })
    .sort({ grade: 1, name: 1 })
    .lean();

  // One grouped count query rather than N queries, so the list stays fast as
  // a school fills up.
  const counts = await User.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
    {
      $match: {
        schoolId: new mongoose.Types.ObjectId(schoolId),
        role: "student",
        sectionId: { $ne: null },
      },
    },
    { $group: { _id: "$sectionId", n: { $sum: 1 } } },
  ]);

  const byId = new Map(counts.map((c) => [String(c._id), c.n]));

  return sections.map((s) => ({
    id: String(s._id),
    name: s.name,
    grade: s.grade,
    studentCount: byId.get(String(s._id)) ?? 0,
    createdAt: s.createdAt,
  }));
}

export async function createSection(
  schoolId: string,
  input: { name: string; grade: number }
) {
  await connectToDatabase();

  try {
    const section = await Section.create({ schoolId, ...input });
    return {
      id: String(section._id),
      name: section.name,
      grade: section.grade,
      studentCount: 0,
    };
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new SetupError(
        `You already have a section called "${input.name}".`,
        409,
        "name"
      );
    }
    throw error;
  }
}

export async function updateSection(
  schoolId: string,
  id: string,
  input: { name: string; grade: number }
) {
  await connectToDatabase();

  try {
    // schoolId is part of the filter, so an id belonging to another school
    // matches nothing and comes back as a plain 404.
    const updated = await Section.findOneAndUpdate(
      { _id: id, schoolId },
      { $set: input },
      { new: true }
    ).lean();

    if (!updated) throw new SetupError("No such section.", 404);

    return {
      id: String(updated._id),
      name: updated.name,
      grade: updated.grade,
    };
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new SetupError(
        `You already have a section called "${input.name}".`,
        409,
        "name"
      );
    }
    throw error;
  }
}

/**
 * Deleting a section that still has students would leave them pointing at
 * nothing, so it is refused with a count rather than silently orphaning them.
 * Teachers assigned to it are simply unassigned — nothing breaks for them.
 */
export async function deleteSection(schoolId: string, id: string) {
  await connectToDatabase();

  const section = await Section.findOne({ _id: id, schoolId }).lean();
  if (!section) throw new SetupError("No such section.", 404);

  const students = await User.countDocuments({
    schoolId,
    role: "student",
    sectionId: id,
  });

  if (students > 0) {
    throw new SetupError(
      `"${section.name}" still has ${students} student${students === 1 ? "" : "s"} in it. ` +
        `Move them to another section first.`,
      409
    );
  }

  await User.updateMany(
    { schoolId, sectionIds: id },
    { $pull: { sectionIds: new mongoose.Types.ObjectId(id) } }
  );
  await Section.deleteOne({ _id: id, schoolId });

  return { id };
}

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------

export async function listSubjects(schoolId: string) {
  await connectToDatabase();

  const subjects = await Subject.find({ schoolId }).sort({ name: 1 }).lean();

  const counts = await User.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
    {
      $match: {
        schoolId: new mongoose.Types.ObjectId(schoolId),
        role: "teacher",
      },
    },
    { $unwind: "$subjectIds" },
    { $group: { _id: "$subjectIds", n: { $sum: 1 } } },
  ]);

  const byId = new Map(counts.map((c) => [String(c._id), c.n]));

  return subjects.map((s) => ({
    id: String(s._id),
    name: s.name,
    teacherCount: byId.get(String(s._id)) ?? 0,
    createdAt: s.createdAt,
  }));
}

export async function createSubject(schoolId: string, input: { name: string }) {
  await connectToDatabase();

  try {
    const subject = await Subject.create({ schoolId, ...input });
    return { id: String(subject._id), name: subject.name, teacherCount: 0 };
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new SetupError(
        `You already have a subject called "${input.name}".`,
        409,
        "name"
      );
    }
    throw error;
  }
}

export async function updateSubject(
  schoolId: string,
  id: string,
  input: { name: string }
) {
  await connectToDatabase();

  try {
    const updated = await Subject.findOneAndUpdate(
      { _id: id, schoolId },
      { $set: input },
      { new: true }
    ).lean();

    if (!updated) throw new SetupError("No such subject.", 404);

    return { id: String(updated._id), name: updated.name };
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new SetupError(
        `You already have a subject called "${input.name}".`,
        409,
        "name"
      );
    }
    throw error;
  }
}

/**
 * Unlike a section, deleting a subject cannot orphan anyone — it just stops
 * being taught. Teachers who had it are unassigned and the count is reported
 * back so the admin knows what changed.
 */
export async function deleteSubject(schoolId: string, id: string) {
  await connectToDatabase();

  const subject = await Subject.findOne({ _id: id, schoolId }).lean();
  if (!subject) throw new SetupError("No such subject.", 404);

  const result = await User.updateMany(
    { schoolId, subjectIds: id },
    { $pull: { subjectIds: new mongoose.Types.ObjectId(id) } }
  );

  await Subject.deleteOne({ _id: id, schoolId });

  return { id, unassignedFrom: result.modifiedCount ?? 0 };
}

// ---------------------------------------------------------------------------
// Teachers
// ---------------------------------------------------------------------------

export type TeacherFilters = { search?: string };

export async function listTeachers(schoolId: string, filters: TeacherFilters = {}) {
  await connectToDatabase();

  const query: QueryFilter<UserDoc> = { schoolId, role: "teacher" };

  if (filters.search) {
    const rx = new RegExp(escapeRegex(filters.search), "i");
    query.$or = [{ name: rx }, { email: rx }];
  }

  const [teachers, subjects, sections] = await Promise.all([
    User.find(query).select("name email subjectIds sectionIds createdAt").sort({ name: 1 }).lean(),
    Subject.find({ schoolId }).select("name").lean(),
    Section.find({ schoolId }).select("name grade").lean(),
  ]);

  const subjectName = new Map(subjects.map((s) => [String(s._id), s.name]));
  const sectionName = new Map(sections.map((s) => [String(s._id), s.name]));

  return teachers.map((t) => ({
    id: String(t._id),
    name: t.name,
    email: t.email,
    subjects: (t.subjectIds ?? [])
      .map((id) => ({ id: String(id), name: subjectName.get(String(id)) }))
      .filter((s): s is { id: string; name: string } => Boolean(s.name)),
    sections: (t.sectionIds ?? [])
      .map((id) => ({ id: String(id), name: sectionName.get(String(id)) }))
      .filter((s): s is { id: string; name: string } => Boolean(s.name)),
  }));
}

/**
 * Refuses a set of ids unless every one of them belongs to this school.
 *
 * Takes a counting function rather than a model so the caller supplies the
 * school-scoped filter, which keeps the tenant check at the call site where it
 * is visible.
 */
async function assertOwnedIds(
  ids: string[] | undefined,
  countOwned: (ids: string[]) => Promise<number>,
  label: string
): Promise<string[]> {
  if (!ids || ids.length === 0) return [];

  const unique = [...new Set(ids)];
  const owned = await countOwned(unique);

  if (owned !== unique.length) {
    throw new SetupError(
      `One of the ${label} you picked isn't in your school any more. Refresh the page and try again.`,
      400
    );
  }

  return unique;
}

export async function createTeacher(
  schoolId: string,
  input: {
    name: string;
    email: string;
    password?: string;
    subjectIds?: string[];
    sectionIds?: string[];
  }
) {
  await connectToDatabase();

  // The ids come from the admin's own form, but they are still client input:
  // without this check an admin could post another school's subject id and
  // link a teacher across the tenant boundary.
  const [subjectIds, sectionIds] = await Promise.all([
    assertOwnedIds(
      input.subjectIds,
      (ids) => Subject.countDocuments({ _id: { $in: ids }, schoolId }),
      "subjects"
    ),
    assertOwnedIds(
      input.sectionIds,
      (ids) => Section.countDocuments({ _id: { $in: ids }, schoolId }),
      "sections"
    ),
  ]);

  const generated = !input.password;
  const password = input.password || generateTempPassword();

  try {
    const teacher = await User.create({
      schoolId,
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(password),
      role: "teacher",
      subjectIds,
      sectionIds,
    });

    return {
      id: String(teacher._id),
      name: teacher.name,
      email: teacher.email,
      // Returned exactly once, so the admin can pass it on. It is never
      // stored in readable form and cannot be fetched again.
      temporaryPassword: generated ? password : null,
    };
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new SetupError(
        `${input.email} already has an account.`,
        409,
        "email"
      );
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

export type StudentFilters = { search?: string; sectionId?: string };

export async function listStudents(schoolId: string, filters: StudentFilters = {}) {
  await connectToDatabase();

  const query: QueryFilter<UserDoc> = { schoolId, role: "student" };

  if (filters.search) {
    const rx = new RegExp(escapeRegex(filters.search), "i");
    query.$or = [{ name: rx }, { email: rx }];
  }

  // Even the section filter is applied on top of the school filter, so it can
  // only ever narrow the result, never widen it past the tenant boundary.
  if (filters.sectionId) query.sectionId = filters.sectionId;

  const [students, sections] = await Promise.all([
    User.find(query).select("name email sectionId createdAt").sort({ name: 1 }).lean(),
    Section.find({ schoolId }).select("name grade").lean(),
  ]);

  const byId = new Map(
    sections.map((s) => [String(s._id), { name: s.name, grade: s.grade }])
  );

  return students.map((s) => {
    const section = s.sectionId ? byId.get(String(s.sectionId)) : undefined;
    return {
      id: String(s._id),
      name: s.name,
      email: s.email,
      sectionId: s.sectionId ? String(s.sectionId) : null,
      sectionName: section?.name ?? null,
      grade: section?.grade ?? null,
    };
  });
}

export async function createStudent(
  schoolId: string,
  input: { name: string; email: string; sectionId: string; password?: string },
  options: {
    /**
     * Skip the plan and cap check.
     *
     * Only ever passed by lib/platform-admin.ts. The cap is a commercial term
     * the platform imposes on a school; the platform owner adding students on
     * a school's behalf during onboarding is not the party it is there to
     * restrain, and making them raise the cap before they can paste in a
     * roster is friction for no benefit. Nothing school-facing passes this.
     */
    bypassPlanLimits?: boolean;
  } = {}
) {
  await connectToDatabase();

  // Plan and cap first, so a refusal costs one round trip and never leaves a
  // half-made account behind. lib/entitlements.ts owns both rules.
  if (!options.bypassPlanLimits) {
    await assertCanAddStudents(schoolId, 1);
  }

  const section = await Section.findOne({ _id: input.sectionId, schoolId })
    .select("_id name")
    .lean();

  if (!section) {
    throw new SetupError(
      "Pick a section that exists in your school.",
      400,
      "sectionId"
    );
  }

  const generated = !input.password;
  const password = input.password || generateTempPassword();

  try {
    const student = await User.create({
      schoolId,
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(password),
      role: "student",
      sectionId: section._id,
    });

    return {
      id: String(student._id),
      name: student.name,
      email: student.email,
      sectionName: section.name,
      temporaryPassword: generated ? password : null,
    };
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new SetupError(`${input.email} already has an account.`, 409, "email");
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Bulk student import
// ---------------------------------------------------------------------------

/** Refuse anything larger, rather than time out halfway through. */
export const MAX_IMPORT_ROWS = 300;

export type ImportRowResult = {
  line: number;
  name: string;
  email: string;
  section: string;
  status: "created" | "skipped";
  reason?: string;
};

export type ImportSummary = {
  created: number;
  skipped: number;
  results: ImportRowResult[];
};

/**
 * Creates students from raw CSV text.
 *
 * One bad row never fails the batch: each row is validated on its own, good
 * rows are created, and every skipped row comes back with the specific reason
 * it was skipped and the line number it came from.
 *
 * Duplicate detection covers both directions — against accounts that already
 * exist, and against other rows in the same file.
 */
export async function importStudentsFromCsv(
  schoolId: string,
  csvText: string
): Promise<ImportSummary> {
  await connectToDatabase();

  // Throws CsvError for a malformed file or a missing column; the route turns
  // that into a 400 with the parser's own message.
  const table = parseCsv(csvText);
  const records = toObjects(table, STUDENT_CSV_COLUMNS);

  if (records.length > MAX_IMPORT_ROWS) {
    throw new SetupError(
      `That file has ${records.length} rows. Upload at most ${MAX_IMPORT_ROWS} at a time so the import doesn't time out — split the file and run it twice.`,
      413
    );
  }

  // An expired plan refuses the whole file up front — there is no sensible
  // partial answer to "your subscription lapsed". The cap is different: it is
  // a number of places, so the import fills them and says which rows missed
  // out, the same way it already reports duplicates.
  const entitlement = await assertPlanActive(
    schoolId,
    "You can't import students while"
  );
  let placesLeft = entitlement.studentsRemaining;

  const sections = await Section.find({ schoolId }).select("name").lean();
  const sectionByName = new Map(
    sections.map((s) => [s.name.trim().toLowerCase(), s._id])
  );

  // One query for every email in the file, rather than one per row.
  const emailsInFile = records
    .map((r) => r.record.email.trim().toLowerCase())
    .filter(Boolean);

  const existing = await User.find({ email: { $in: emailsInFile } })
    .select("email")
    .lean();
  const taken = new Set(existing.map((u) => u.email.toLowerCase()));

  const seenInFile = new Map<string, number>();
  const results: ImportRowResult[] = [];
  const toCreate: {
    index: number;
    name: string;
    email: string;
    sectionId: mongoose.Types.ObjectId;
  }[] = [];

  for (const { line, record } of records) {
    const name = record.name ?? "";
    const email = (record.email ?? "").toLowerCase();
    const sectionName = record.section ?? "";

    const skip = (reason: string) => {
      results.push({ line, name, email, section: sectionName, status: "skipped", reason });
    };

    if (!name && !email && !sectionName) {
      skip("The row is blank.");
      continue;
    }
    if (name.trim().length < 2) {
      skip("Missing a name.");
      continue;
    }
    if (!email) {
      skip("Missing an email address.");
      continue;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      skip(`"${email}" isn't a valid email address.`);
      continue;
    }
    if (!sectionName) {
      skip("Missing a section.");
      continue;
    }

    const sectionId = sectionByName.get(sectionName.trim().toLowerCase());
    if (!sectionId) {
      skip(`No section called "${sectionName}". Create it first, or fix the spelling.`);
      continue;
    }
    if (taken.has(email)) {
      skip(`${email} already has an account.`);
      continue;
    }

    const firstSeen = seenInFile.get(email);
    if (firstSeen !== undefined) {
      skip(`${email} also appears on line ${firstSeen} of this file.`);
      continue;
    }

    // Checked last, so a row that was going to be skipped anyway does not
    // consume one of the remaining places.
    if (placesLeft <= 0) {
      skip(studentCapMessage(entitlement));
      continue;
    }
    placesLeft--;

    seenInFile.set(email, line);
    results.push({ line, name, email, section: sectionName, status: "created" });
    toCreate.push({
      index: results.length - 1,
      name: name.trim(),
      email,
      sectionId: sectionId as mongoose.Types.ObjectId,
    });
  }

  if (toCreate.length > 0) {
    const hashed = await Promise.all(
      toCreate.map(async (row) => ({
        schoolId: new mongoose.Types.ObjectId(schoolId),
        name: row.name,
        email: row.email,
        passwordHash: await hashPassword(generateTempPassword()),
        role: "student" as const,
        sectionId: row.sectionId,
      }))
    );

    // ordered:false means a row that still collides (a race with another
    // admin importing at the same moment) is reported rather than aborting
    // everything after it.
    try {
      await User.insertMany(hashed, { ordered: false });
    } catch (error) {
      const writeErrors =
        (error as { writeErrors?: { index: number; err?: { errmsg?: string } }[] })
          .writeErrors ?? [];

      if (writeErrors.length === 0) throw error;

      for (const we of writeErrors) {
        const row = toCreate[we.index];
        if (!row) continue;
        const entry = results[row.index];
        entry.status = "skipped";
        entry.reason = `${row.email} was created by someone else while this file was uploading.`;
      }
    }
  }

  const created = results.filter((r) => r.status === "created").length;

  return { created, skipped: results.length - created, results };
}
