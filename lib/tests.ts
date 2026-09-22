import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { SetupError } from "@/lib/school-setup";
import Question from "@/models/Question";
import Section from "@/models/Section";
import Subject from "@/models/Subject";
import Test from "@/models/Test";
import TestAssignment from "@/models/TestAssignment";
import User from "@/models/User";
import Attempt from "@/models/Attempt";
import { testState, type TestState, type TestStatus } from "@/lib/tests-shared";
import type { Difficulty } from "@/lib/questions-shared";

/**
 * Test creation and assignment.
 *
 * Same shape as the other service modules: `schoolId` first, callers are route
 * handlers wrapped in `withAuth`, nothing here reads a request.
 */

export type TestRow = {
  id: string;
  title: string;
  subjectId: string;
  subjectName: string | null;
  durationMinutes: number;
  questionCount: number;
  opensAt: Date;
  closesAt: Date;
  status: TestStatus;
  /** What it actually is right now, computed from the dates. */
  state: TestState;
  sections: { id: string; name: string }[];
};

/** Confirms a subject id belongs to this school before anything is stored. */
async function assertOwnedSubject(schoolId: string, subjectId: string) {
  const subject = await Subject.findOne({ _id: subjectId, schoolId })
    .select("_id name")
    .lean();

  if (!subject) {
    throw new SetupError("Pick a subject that exists in your school.", 400, "subjectId");
  }

  return subject;
}

/**
 * Confirms every question belongs to this school AND to the chosen subject.
 *
 * The subject check is not pedantry: a paper is generated and marked per
 * subject, so a stray question from another subject would quietly skew it.
 */
async function assertOwnedQuestions(
  schoolId: string,
  subjectId: string,
  questionIds: string[]
): Promise<mongoose.Types.ObjectId[]> {
  if (questionIds.length === 0) return [];

  const unique = [...new Set(questionIds)];

  const found = await Question.find({
    _id: { $in: unique },
    schoolId,
    subjectId,
  })
    .select("_id")
    .lean();

  if (found.length !== unique.length) {
    throw new SetupError(
      "Some of those questions aren't in this subject's bank any more. Refresh and try again.",
      400,
      "questionIds"
    );
  }

  // Keep the teacher's ordering rather than the database's.
  const byId = new Map(found.map((q) => [String(q._id), q._id]));
  return unique.map((id) => byId.get(id)!);
}

/** Confirms every section belongs to this school. */
async function assertOwnedSections(
  schoolId: string,
  sectionIds: string[]
): Promise<mongoose.Types.ObjectId[]> {
  if (sectionIds.length === 0) return [];

  const unique = [...new Set(sectionIds)];

  const found = await Section.find({ _id: { $in: unique }, schoolId })
    .select("_id")
    .lean();

  if (found.length !== unique.length) {
    throw new SetupError(
      "One of those sections isn't in your school any more. Refresh the page and try again.",
      400,
      "sectionIds"
    );
  }

  return found.map((s) => s._id);
}

/**
 * The stored status, from the teacher's intent and the opening time.
 *
 * Nothing important is decided from this value — `testState` recomputes the
 * truth from the dates on every read — but it satisfies the model's enum and
 * tells you what the teacher meant at the moment they saved.
 */
function storedStatus(publish: boolean, opensAt: Date, now = new Date()): TestStatus {
  if (!publish) return "draft";
  return opensAt > now ? "scheduled" : "published";
}

/** Adds subject and section names, and the computed state, to raw test docs. */
async function decorate(
  schoolId: string,
  docs: Record<string, unknown>[],
  now = new Date()
): Promise<TestRow[]> {
  if (docs.length === 0) return [];

  const testIds = docs.map((d) => d._id as mongoose.Types.ObjectId);

  const [subjects, assignments, sections] = await Promise.all([
    Subject.find({ schoolId }).select("name").lean(),
    TestAssignment.find({ schoolId, testId: { $in: testIds } })
      .select("testId sectionId")
      .lean(),
    Section.find({ schoolId }).select("name").lean(),
  ]);

  const subjectName = new Map(subjects.map((s) => [String(s._id), s.name]));
  const sectionName = new Map(sections.map((s) => [String(s._id), s.name]));

  const byTest = new Map<string, { id: string; name: string }[]>();
  for (const a of assignments) {
    const key = String(a.testId);
    const name = sectionName.get(String(a.sectionId));
    if (!name) continue; // section deleted out from under the assignment
    if (!byTest.has(key)) byTest.set(key, []);
    byTest.get(key)!.push({ id: String(a.sectionId), name });
  }

  return docs.map((d) => {
    const status = d.status as TestStatus;
    const opensAt = d.opensAt as Date;
    const closesAt = d.closesAt as Date;

    return {
      id: String(d._id),
      title: d.title as string,
      subjectId: String(d.subjectId),
      subjectName: subjectName.get(String(d.subjectId)) ?? null,
      durationMinutes: d.durationMinutes as number,
      questionCount: (d.questionIds as unknown[]).length,
      opensAt,
      closesAt,
      status,
      state: testState(status, opensAt, closesAt, now),
      sections: (byTest.get(String(d._id)) ?? []).sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    };
  });
}

export async function listTests(schoolId: string): Promise<TestRow[]> {
  await connectToDatabase();

  const docs = await Test.find({ schoolId }).sort({ createdAt: -1 }).lean();
  return decorate(schoolId, docs as unknown as Record<string, unknown>[]);
}

export async function getTest(schoolId: string, id: string) {
  await connectToDatabase();

  // schoolId is part of the filter, so an id from another school matches
  // nothing and comes back as a plain 404.
  const doc = await Test.findOne({ _id: id, schoolId }).lean();
  if (!doc) throw new SetupError("No such test.", 404);

  const [row] = await decorate(schoolId, [doc as unknown as Record<string, unknown>]);

  return {
    ...row,
    questionIds: (doc.questionIds ?? []).map((q) => String(q)),
    sectionIds: row.sections.map((s) => s.id),
  };
}

export type TestInputFields = {
  title: string;
  subjectId: string;
  durationMinutes: number;
  questionIds: string[];
  opensAt: Date;
  closesAt: Date;
  sectionIds?: string[];
  publish?: boolean;
};

export async function createTest(
  schoolId: string,
  createdBy: string,
  input: TestInputFields
) {
  await connectToDatabase();

  const subject = await assertOwnedSubject(schoolId, input.subjectId);
  const questionIds = await assertOwnedQuestions(
    schoolId,
    input.subjectId,
    input.questionIds
  );
  const sectionIds = await assertOwnedSections(schoolId, input.sectionIds ?? []);

  const publish = Boolean(input.publish);

  const test = await Test.create({
    schoolId, // from the token. Never from the body.
    createdBy,
    title: input.title,
    subjectId: subject._id,
    durationMinutes: input.durationMinutes,
    questionIds,
    opensAt: input.opensAt,
    closesAt: input.closesAt,
    status: storedStatus(publish, input.opensAt),
  });

  await syncAssignments(schoolId, String(test._id), sectionIds, publish);

  return getTest(schoolId, String(test._id));
}

export async function updateTest(
  schoolId: string,
  id: string,
  input: TestInputFields
) {
  await connectToDatabase();

  const existing = await Test.findOne({ _id: id, schoolId })
    .select("_id questionIds subjectId")
    .lean();
  if (!existing) throw new SetupError("No such test.", 404);

  /*
   * Once anyone has sat this paper, its question list is frozen.
   *
   * Marks are computed against `questionIds`, so swapping a question after a
   * student has answered would silently change what they were marked on —
   * and two students sitting "the same" test would have sat different papers.
   * Everything else about the test stays editable.
   */
  const sat = await Attempt.countDocuments({ schoolId, testId: id });
  if (sat > 0) {
    const before = (existing.questionIds ?? []).map(String);
    const after = [...new Set(input.questionIds)];
    const changed =
      before.length !== after.length ||
      before.some((q, i) => q !== after[i]) ||
      String(existing.subjectId) !== input.subjectId;

    if (changed) {
      throw new SetupError(
        `${sat} student${sat === 1 ? " has" : "s have"} already sat this paper, so its questions can't be changed. ` +
          `Everything else — the title, the window, the duration — is still editable.`,
        409,
        "questionIds"
      );
    }
  }

  const subject = await assertOwnedSubject(schoolId, input.subjectId);
  const questionIds = await assertOwnedQuestions(
    schoolId,
    input.subjectId,
    input.questionIds
  );
  const sectionIds = await assertOwnedSections(schoolId, input.sectionIds ?? []);

  const publish = Boolean(input.publish);

  await Test.updateOne(
    { _id: id, schoolId },
    {
      $set: {
        title: input.title,
        subjectId: subject._id,
        durationMinutes: input.durationMinutes,
        questionIds,
        opensAt: input.opensAt,
        closesAt: input.closesAt,
        status: storedStatus(publish, input.opensAt),
      },
    },
    { runValidators: true }
  );

  await syncAssignments(schoolId, id, sectionIds, publish);

  return getTest(schoolId, id);
}

export async function deleteTest(schoolId: string, id: string) {
  await connectToDatabase();

  const result = await Test.deleteOne({ _id: id, schoolId });
  if (result.deletedCount === 0) throw new SetupError("No such test.", 404);

  // Assignments would otherwise point at a test that no longer exists.
  await TestAssignment.deleteMany({ schoolId, testId: id });

  return { id };
}

/**
 * Makes the assignment rows match the section list exactly.
 *
 * A draft has no assignments at all — that is what "not visible to students"
 * means here, and it is enforced in one place rather than trusted at every
 * read. Un-publishing a test back to draft therefore withdraws it from every
 * section it was on.
 */
async function syncAssignments(
  schoolId: string,
  testId: string,
  sectionIds: mongoose.Types.ObjectId[],
  publish: boolean
) {
  if (!publish) {
    await TestAssignment.deleteMany({ schoolId, testId });
    return;
  }

  await TestAssignment.deleteMany({
    schoolId,
    testId,
    sectionId: { $nin: sectionIds },
  });

  if (sectionIds.length === 0) return;

  // ordered:false plus the unique index makes re-assigning an existing
  // section a no-op rather than an error.
  try {
    await TestAssignment.insertMany(
      sectionIds.map((sectionId) => ({ schoolId, testId, sectionId })),
      { ordered: false }
    );
  } catch (error) {
    const duplicatesOnly =
      (error as { writeErrors?: { err?: { code?: number } }[] }).writeErrors?.every(
        (e) => e.err?.code === 11000
      ) ?? false;
    if (!duplicatesOnly) throw error;
  }
}

/** Assign a published test to a set of sections, replacing what was there. */
export async function setAssignments(
  schoolId: string,
  testId: string,
  sectionIds: string[]
) {
  await connectToDatabase();

  const test = await Test.findOne({ _id: testId, schoolId })
    .select("status questionIds")
    .lean();
  if (!test) throw new SetupError("No such test.", 404);

  if (test.status === "draft") {
    throw new SetupError(
      "This test is still a draft. Publish it before assigning it to a class.",
      409
    );
  }
  if ((test.questionIds ?? []).length === 0) {
    throw new SetupError("Add at least one question before assigning this test.", 409);
  }

  const owned = await assertOwnedSections(schoolId, sectionIds);
  await syncAssignments(schoolId, testId, owned, true);

  return getTest(schoolId, testId);
}

// ---------------------------------------------------------------------------
// Auto-generating a paper
// ---------------------------------------------------------------------------

/**
 * Picks `count` questions at random from a subject's bank.
 *
 * `$sample` does the choosing in the database rather than pulling the whole
 * bank back to shuffle it. If the bank is smaller than asked for, it returns
 * what exists and the caller reports the shortfall — better than an error
 * when a teacher asks for 20 and the bank holds 18.
 */
export async function autoSelectQuestions(
  schoolId: string,
  subjectId: string,
  count: number,
  difficulty?: Difficulty
) {
  await connectToDatabase();

  await assertOwnedSubject(schoolId, subjectId);

  const match: Record<string, unknown> = {
    schoolId: new mongoose.Types.ObjectId(schoolId),
    subjectId: new mongoose.Types.ObjectId(subjectId),
  };
  if (difficulty) match.difficulty = difficulty;

  const available = await Question.countDocuments(match);

  const picked = await Question.aggregate<{
    _id: mongoose.Types.ObjectId;
    text: string;
    difficulty: Difficulty;
  }>([
    { $match: match },
    { $sample: { size: Math.min(count, available) } },
    { $project: { text: 1, difficulty: 1 } },
  ]);

  return {
    available,
    requested: count,
    questions: picked.map((q) => ({
      id: String(q._id),
      text: q.text,
      difficulty: q.difficulty,
    })),
  };
}

// ---------------------------------------------------------------------------
// The student's view
// ---------------------------------------------------------------------------

export type StudentTestRow = {
  id: string;
  title: string;
  subjectName: string | null;
  durationMinutes: number;
  questionCount: number;
  opensAt: Date;
  closesAt: Date;
  state: "scheduled" | "open";
  msUntilOpen: number;
  msUntilClose: number;
};

/**
 * What a student should see right now.
 *
 * Driven entirely by the assignment rows and the dates — never by the stored
 * status, which goes stale the moment a scheduled test's opening time passes.
 * Closed tests are dropped; not-yet-open ones are kept so a class can see what
 * is coming.
 */
export async function listStudentTests(
  schoolId: string,
  userId: string,
  now: Date = new Date()
): Promise<StudentTestRow[]> {
  await connectToDatabase();

  const student = await User.findOne({ _id: userId, schoolId, role: "student" })
    .select("sectionId")
    .lean();

  // No section means no class, so nothing is set for them yet.
  if (!student?.sectionId) return [];

  const assignments = await TestAssignment.find({
    schoolId,
    sectionId: student.sectionId,
  })
    .select("testId")
    .lean();

  if (assignments.length === 0) return [];

  const tests = await Test.find({
    _id: { $in: assignments.map((a) => a.testId) },
    schoolId,
    // A test whose window has passed drops off the list entirely.
    closesAt: { $gt: now },
  })
    .sort({ opensAt: 1 })
    .lean();

  if (tests.length === 0) return [];

  const subjects = await Subject.find({ schoolId }).select("name").lean();
  const subjectName = new Map(subjects.map((s) => [String(s._id), s.name]));

  return tests
    .map((t) => {
      const state = testState(t.status as TestStatus, t.opensAt, t.closesAt, now);
      return { t, state };
    })
    // A draft has no assignments, so this should never filter anything out —
    // it is here so that a stray row could not leak an unpublished paper.
    .filter(({ state }) => state === "scheduled" || state === "open")
    .map(({ t, state }) => ({
      id: String(t._id),
      title: t.title,
      subjectName: subjectName.get(String(t.subjectId)) ?? null,
      durationMinutes: t.durationMinutes,
      questionCount: (t.questionIds ?? []).length,
      opensAt: t.opensAt,
      closesAt: t.closesAt,
      state: state as "scheduled" | "open",
      msUntilOpen: t.opensAt.getTime() - now.getTime(),
      msUntilClose: t.closesAt.getTime() - now.getTime(),
    }));
}
