import { connectToDatabase } from "@/lib/db";
import { SetupError } from "@/lib/school-setup";
import { answerKey, percentage } from "@/lib/grading";
import Attempt from "@/models/Attempt";
import Question from "@/models/Question";
import Section from "@/models/Section";
import Subject from "@/models/Subject";
import Test from "@/models/Test";
import TestAssignment from "@/models/TestAssignment";
import User from "@/models/User";
import type { AttemptStatus } from "@/lib/attempts-shared";

/**
 * Results.
 *
 * One rule governs the whole file: **nothing about a paper's answers or marks
 * is visible to anybody until the test window has closed for everybody.**
 *
 * A fast finisher seeing the answer key while their classmates are still
 * sitting would be handing out the answers, so the check is on
 * `test.closesAt`, not on the student's own submission. It is applied in
 * `assertResultsVisible` and every read below goes through it.
 */

function resultsAreOut(closesAt: Date, now: Date): boolean {
  return now >= closesAt;
}

function assertResultsVisible(closesAt: Date, now: Date) {
  if (!resultsAreOut(closesAt, now)) {
    throw new SetupError(
      "Results aren't out yet. They appear once the test closes for everyone.",
      403
    );
  }
}

/**
 * Competition ranking: equal scores share a rank, and the next rank skips.
 * 40, 38, 38, 35 ranks as 1, 2, 2, 4.
 */
function rankOf(sortedScores: number[], score: number): number {
  return sortedScores.filter((s) => s > score).length + 1;
}

// ---------------------------------------------------------------------------
// A student's own result
// ---------------------------------------------------------------------------

export type ResultQuestion = {
  id: string;
  text: string;
  imageUrl: string | null;
  options: string[];
  correctOptionIndex: number;
  selectedOptionIndex: number | null;
  outcome: "correct" | "incorrect" | "unanswered";
};

export type StudentResult = {
  test: {
    id: string;
    title: string;
    subjectName: string | null;
    closesAt: string;
  };
  attempt: {
    status: AttemptStatus;
    submittedAt: string;
    startedAt: string;
    /** Seconds between starting and submitting. */
    timeTakenSeconds: number;
  };
  score: number;
  totalQuestions: number;
  percentage: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  rank: number;
  cohortSize: number;
  sectionName: string | null;
  questions: ResultQuestion[];
};

export async function getStudentResult(
  schoolId: string,
  studentId: string,
  testId: string,
  now: Date = new Date()
): Promise<StudentResult> {
  await connectToDatabase();

  const [test, attempt] = await Promise.all([
    // schoolId in the filter, so another school's test is not found at all.
    Test.findOne({ _id: testId, schoolId }).lean(),
    Attempt.findOne({ testId, studentId, schoolId }).lean(),
  ]);

  if (!test) throw new SetupError("No such test.", 404);

  if (!attempt) {
    throw new SetupError(
      "You didn't sit this test, so there's no result to show.",
      404
    );
  }

  if (attempt.status === "in_progress") {
    throw new SetupError("You haven't submitted this test yet.", 409);
  }

  // The gate. Before this moment the answer key is nobody's business.
  assertResultsVisible(test.closesAt, now);

  const [key, questionDocs, subject, section] = await Promise.all([
    answerKey(schoolId, test.questionIds ?? []),
    Question.find({ _id: { $in: test.questionIds ?? [] }, schoolId })
      .select("text imageUrl options correctOptionIndex")
      .lean(),
    Subject.findOne({ _id: test.subjectId, schoolId }).select("name").lean(),
    Section.findOne({ _id: attempt.sectionId, schoolId }).select("name").lean(),
  ]);

  const byId = new Map(questionDocs.map((q) => [String(q._id), q]));
  const chosen = new Map(
    (attempt.responses ?? []).map((r) => [
      String(r.questionId),
      r.selectedOptionIndex ?? null,
    ])
  );

  const questions: ResultQuestion[] = (test.questionIds ?? [])
    .map((id) => byId.get(String(id)))
    .filter((q): q is NonNullable<typeof q> => Boolean(q))
    .map((q) => {
      const selected = chosen.get(String(q._id)) ?? null;
      const correct = key.get(String(q._id));

      return {
        id: String(q._id),
        text: q.text,
        imageUrl: q.imageUrl ?? null,
        options: q.options,
        correctOptionIndex: q.correctOptionIndex,
        selectedOptionIndex: selected,
        outcome:
          selected === null
            ? ("unanswered" as const)
            : selected === correct
              ? ("correct" as const)
              : ("incorrect" as const),
      };
    });

  // Rank within their own section only — a small section should not be ranked
  // against a big one.
  const cohort = await Attempt.find({
    schoolId,
    testId,
    sectionId: attempt.sectionId,
    status: { $ne: "in_progress" },
  })
    .select("score")
    .lean();

  const scores = cohort.map((a) => a.score ?? 0);
  const score = attempt.score ?? 0;
  const total = attempt.totalQuestions ?? (test.questionIds ?? []).length;

  const submittedAt = attempt.submittedAt ?? test.closesAt;

  return {
    test: {
      id: String(test._id),
      title: test.title,
      subjectName: subject?.name ?? null,
      closesAt: test.closesAt.toISOString(),
    },
    attempt: {
      status: attempt.status as AttemptStatus,
      submittedAt: submittedAt.toISOString(),
      startedAt: attempt.startedAt.toISOString(),
      timeTakenSeconds: Math.max(
        0,
        Math.round((submittedAt.getTime() - attempt.startedAt.getTime()) / 1000)
      ),
    },
    score,
    totalQuestions: total,
    percentage: percentage(score, total),
    correctCount: attempt.correctCount ?? 0,
    incorrectCount: attempt.incorrectCount ?? 0,
    unansweredCount: attempt.unansweredCount ?? 0,
    rank: rankOf(scores, score),
    cohortSize: cohort.length,
    sectionName: section?.name ?? null,
    questions,
  };
}

/** Whether a student may open their result yet, without throwing. */
export async function studentResultAvailability(
  schoolId: string,
  studentId: string,
  testId: string,
  now: Date = new Date()
): Promise<{ available: boolean; reason?: string }> {
  await connectToDatabase();

  const test = await Test.findOne({ _id: testId, schoolId })
    .select("closesAt")
    .lean();
  if (!test) return { available: false, reason: "No such test." };

  if (!resultsAreOut(test.closesAt, now)) {
    return {
      available: false,
      reason: "Results appear once the test closes for everyone.",
    };
  }

  const attempt = await Attempt.findOne({ testId, studentId, schoolId })
    .select("status")
    .lean();

  if (!attempt) {
    return { available: false, reason: "You didn't sit this test." };
  }
  if (attempt.status === "in_progress") {
    return { available: false, reason: "This attempt was never submitted." };
  }

  return { available: true };
}

// ---------------------------------------------------------------------------
// A teacher's results view
// ---------------------------------------------------------------------------

export type QuestionAccuracy = {
  id: string;
  position: number;
  text: string;
  correctOptionIndex: number;
  options: string[];
  attempted: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  /** Correct as a share of everyone who sat the paper, not of attempts. */
  accuracy: number;
};

export type StudentRow = {
  studentId: string;
  name: string;
  email: string;
  sectionName: string | null;
  status: AttemptStatus | "not_attempted";
  score: number | null;
  totalQuestions: number | null;
  percentage: number | null;
  timeTakenSeconds: number | null;
  submittedAt: string | null;
};

export type TeacherResults = {
  test: {
    id: string;
    title: string;
    subjectName: string | null;
    closesAt: string;
    durationMinutes: number;
    totalQuestions: number;
    state: "open" | "closed";
  };
  summary: {
    assigned: number;
    submitted: number;
    notAttempted: number;
    averagePercentage: number | null;
    highest: number | null;
    lowest: number | null;
  };
  /** Score buckets for the histogram, 0-10%, 11-20% … 91-100%. */
  distribution: { label: string; from: number; to: number; count: number }[];
  questions: QuestionAccuracy[];
  students: StudentRow[];
};

const BUCKETS = [
  { label: "0–10", from: 0, to: 10 },
  { label: "11–20", from: 11, to: 20 },
  { label: "21–30", from: 21, to: 30 },
  { label: "31–40", from: 31, to: 40 },
  { label: "41–50", from: 41, to: 50 },
  { label: "51–60", from: 51, to: 60 },
  { label: "61–70", from: 61, to: 70 },
  { label: "71–80", from: 71, to: 80 },
  { label: "81–90", from: 81, to: 90 },
  { label: "91–100", from: 91, to: 100 },
];

/**
 * Whether a paper's class results may be opened yet, without throwing — so
 * the screen can say when they unlock instead of showing an error.
 */
export async function teacherResultsAvailability(
  schoolId: string,
  testId: string,
  now: Date = new Date()
): Promise<
  | { available: true }
  | { available: false; found: false }
  | { available: false; found: true; title: string; subjectName: string | null; closesAt: Date }
> {
  await connectToDatabase();

  const test = await Test.findOne({ _id: testId, schoolId })
    .select("title subjectId closesAt")
    .lean();
  if (!test) return { available: false, found: false };
  if (resultsAreOut(test.closesAt, now)) return { available: true };

  const subject = await Subject.findOne({ _id: test.subjectId, schoolId })
    .select("name")
    .lean();

  return {
    available: false,
    found: true,
    title: test.title,
    subjectName: subject?.name ?? null,
    closesAt: test.closesAt,
  };
}

export async function getTeacherResults(
  schoolId: string,
  testId: string,
  now: Date = new Date()
): Promise<TeacherResults> {
  await connectToDatabase();

  const test = await Test.findOne({ _id: testId, schoolId }).lean();
  if (!test) throw new SetupError("No such test.", 404);

  // The same gate as a student's own result. A teacher can already read the
  // answer key out of the question bank, but this screen also carries live
  // per-student marks, and a paper is often sat by one section before another —
  // so it stays sealed for everyone until the window shuts. Watching a sitting
  // in progress is a different screen and a different question: who has
  // started, who has handed in. Not what they scored.
  assertResultsVisible(test.closesAt, now);

  const [subject, assignments, attempts, questionDocs] = await Promise.all([
    Subject.findOne({ _id: test.subjectId, schoolId }).select("name").lean(),
    TestAssignment.find({ schoolId, testId }).select("sectionId").lean(),
    Attempt.find({ schoolId, testId, status: { $ne: "in_progress" } }).lean(),
    Question.find({ _id: { $in: test.questionIds ?? [] }, schoolId })
      .select("text options correctOptionIndex")
      .lean(),
  ]);

  const sectionIds = assignments.map((a) => a.sectionId);

  const [sections, roster] = await Promise.all([
    Section.find({ _id: { $in: sectionIds }, schoolId }).select("name").lean(),
    // Everyone the paper was set for, so a student who never opened it still
    // appears — as "not attempted", which is a different fact from zero.
    //
    // Anyone who actually sat it is included too, even if they are no longer
    // in an assigned section: a student can move class, and a paper can be
    // reassigned, between the sitting and the marking. Leaving them out would
    // drop a real mark from every average while still counting their attempt,
    // which is how "2 submitted out of 0 assigned" happens.
    User.find({
      schoolId,
      role: "student",
      $or: [
        { sectionId: { $in: sectionIds } },
        { _id: { $in: attempts.map((a) => a.studentId) } },
      ],
    })
      .select("name email sectionId")
      .sort({ name: 1 })
      .lean(),
  ]);

  const sectionName = new Map(sections.map((s) => [String(s._id), s.name]));
  const attemptByStudent = new Map(
    attempts.map((a) => [String(a.studentId), a])
  );

  // --- the table --------------------------------------------------------
  const students: StudentRow[] = roster.map((s) => {
    const attempt = attemptByStudent.get(String(s._id));

    if (!attempt) {
      return {
        studentId: String(s._id),
        name: s.name,
        email: s.email,
        sectionName: sectionName.get(String(s.sectionId)) ?? null,
        status: "not_attempted" as const,
        score: null,
        totalQuestions: null,
        percentage: null,
        timeTakenSeconds: null,
        submittedAt: null,
      };
    }

    const score = attempt.score ?? 0;
    const total = attempt.totalQuestions ?? (test.questionIds ?? []).length;
    const submittedAt = attempt.submittedAt ?? null;

    return {
      studentId: String(s._id),
      name: s.name,
      email: s.email,
      sectionName: sectionName.get(String(s.sectionId)) ?? null,
      status: attempt.status as AttemptStatus,
      score,
      totalQuestions: total,
      percentage: percentage(score, total),
      timeTakenSeconds: submittedAt
        ? Math.max(
            0,
            Math.round(
              (submittedAt.getTime() - attempt.startedAt.getTime()) / 1000
            )
          )
        : null,
      submittedAt: submittedAt?.toISOString() ?? null,
    };
  });

  // --- per-question accuracy --------------------------------------------
  const key = new Map(
    questionDocs.map((q) => [String(q._id), q.correctOptionIndex])
  );
  const byId = new Map(questionDocs.map((q) => [String(q._id), q]));

  const questions: QuestionAccuracy[] = (test.questionIds ?? [])
    .map((id, index) => ({ id: String(id), index }))
    .filter(({ id }) => byId.has(id))
    .map(({ id, index }) => {
      const q = byId.get(id)!;
      let correct = 0;
      let incorrect = 0;
      let unanswered = 0;

      for (const attempt of attempts) {
        const response = (attempt.responses ?? []).find(
          (r) => String(r.questionId) === id
        );
        const chosen = response?.selectedOptionIndex ?? null;

        if (chosen === null) unanswered++;
        else if (chosen === key.get(id)) correct++;
        else incorrect++;
      }

      return {
        id,
        position: index + 1,
        text: q.text,
        correctOptionIndex: q.correctOptionIndex,
        options: q.options,
        attempted: correct + incorrect,
        correct,
        incorrect,
        unanswered,
        // Out of everyone who sat the paper: leaving a question blank is a
        // signal about the question too, not something to exclude.
        accuracy: attempts.length > 0 ? Math.round((correct / attempts.length) * 100) : 0,
      };
    })
    // Worst first. This ordering is the point of the screen.
    .sort((a, b) => a.accuracy - b.accuracy || a.position - b.position);

  // --- summary and histogram --------------------------------------------
  const percentages = students
    .filter((s) => s.percentage !== null)
    .map((s) => s.percentage as number);

  const distribution = BUCKETS.map((bucket) => ({
    ...bucket,
    count: percentages.filter((p) => p >= bucket.from && p <= bucket.to).length,
  }));

  return {
    test: {
      id: String(test._id),
      title: test.title,
      subjectName: subject?.name ?? null,
      closesAt: test.closesAt.toISOString(),
      durationMinutes: test.durationMinutes,
      totalQuestions: (test.questionIds ?? []).length,
      state: now >= test.closesAt ? "closed" : "open",
    },
    summary: {
      assigned: roster.length,
      // Counted off the rows rather than off the raw attempts, so the three
      // numbers always add up even when a paper has been reassigned.
      submitted: students.filter((s) => s.status !== "not_attempted").length,
      notAttempted: students.filter((s) => s.status === "not_attempted").length,
      averagePercentage:
        percentages.length > 0
          ? Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length)
          : null,
      highest: percentages.length > 0 ? Math.max(...percentages) : null,
      lowest: percentages.length > 0 ? Math.min(...percentages) : null,
    },
    distribution,
    questions,
    students,
  };
}

// ---------------------------------------------------------------------------
// The leaderboard
// ---------------------------------------------------------------------------

export type LeaderboardRow = {
  rank: number;
  studentId: string;
  name: string;
  testsTaken: number;
  totalScore: number;
  totalQuestions: number;
  averagePercentage: number;
  isYou: boolean;
};

export type Leaderboard = {
  sectionName: string | null;
  testsCounted: number;
  rows: LeaderboardRow[];
  you: LeaderboardRow | null;
};

/**
 * Cumulative standing inside one section.
 *
 * Only closed tests count, for the same reason results are withheld until a
 * window shuts: a leaderboard that moved while a paper was still being sat
 * would leak how classmates were doing.
 *
 * Scoped to the student's own section on purpose — ranking a small section
 * against a large one is discouraging and tells nobody anything useful.
 */
export async function getSectionLeaderboard(
  schoolId: string,
  studentId: string,
  now: Date = new Date()
): Promise<Leaderboard> {
  await connectToDatabase();

  const student = await User.findOne({ _id: studentId, schoolId, role: "student" })
    .select("sectionId")
    .lean();

  if (!student?.sectionId) {
    return { sectionName: null, testsCounted: 0, rows: [], you: null };
  }

  const [section, classmates, closedTests] = await Promise.all([
    Section.findOne({ _id: student.sectionId, schoolId }).select("name").lean(),
    User.find({ schoolId, role: "student", sectionId: student.sectionId })
      .select("name")
      .lean(),
    Test.find({ schoolId, closesAt: { $lte: now } }).select("_id").lean(),
  ]);

  const closedTestIds = closedTests.map((t) => t._id);
  if (closedTestIds.length === 0) {
    return {
      sectionName: section?.name ?? null,
      testsCounted: 0,
      rows: [],
      you: null,
    };
  }

  const attempts = await Attempt.find({
    schoolId,
    sectionId: student.sectionId,
    testId: { $in: closedTestIds },
    status: { $ne: "in_progress" },
  })
    .select("studentId testId score totalQuestions")
    .lean();

  const totals = new Map<
    string,
    { testsTaken: number; totalScore: number; totalQuestions: number }
  >();

  for (const attempt of attempts) {
    const key = String(attempt.studentId);
    const entry = totals.get(key) ?? {
      testsTaken: 0,
      totalScore: 0,
      totalQuestions: 0,
    };
    entry.testsTaken++;
    entry.totalScore += attempt.score ?? 0;
    entry.totalQuestions += attempt.totalQuestions ?? 0;
    totals.set(key, entry);
  }

  const scored = classmates
    .map((c) => {
      const entry = totals.get(String(c._id));
      if (!entry) return null;

      return {
        studentId: String(c._id),
        name: c.name,
        testsTaken: entry.testsTaken,
        totalScore: entry.totalScore,
        totalQuestions: entry.totalQuestions,
        averagePercentage: percentage(entry.totalScore, entry.totalQuestions),
        isYou: String(c._id) === studentId,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    // Average percentage first; more papers sat breaks a tie, then name so the
    // order is stable rather than arbitrary.
    .sort(
      (a, b) =>
        b.averagePercentage - a.averagePercentage ||
        b.testsTaken - a.testsTaken ||
        a.name.localeCompare(b.name)
    );

  const averages = scored.map((s) => s.averagePercentage);
  const rows: LeaderboardRow[] = scored.map((s) => ({
    ...s,
    rank: rankOf(averages, s.averagePercentage),
  }));

  return {
    sectionName: section?.name ?? null,
    testsCounted: closedTestIds.length,
    rows,
    you: rows.find((r) => r.isYou) ?? null,
  };
}

/** Which of a student's tests now have results to look at. */
export async function listStudentResults(
  schoolId: string,
  studentId: string,
  now: Date = new Date()
) {
  await connectToDatabase();

  const attempts = await Attempt.find({
    schoolId,
    studentId,
    status: { $ne: "in_progress" },
  })
    .select("testId score totalQuestions submittedAt status")
    .lean();

  if (attempts.length === 0) return [];

  const tests = await Test.find({
    _id: { $in: attempts.map((a) => a.testId) },
    schoolId,
    // Only closed papers: results are withheld until the window shuts.
    closesAt: { $lte: now },
  })
    .select("title subjectId closesAt")
    .lean();

  const testById = new Map(tests.map((t) => [String(t._id), t]));

  const subjects = await Subject.find({ schoolId }).select("name").lean();
  const subjectName = new Map(subjects.map((s) => [String(s._id), s.name]));

  return attempts
    .filter((a) => testById.has(String(a.testId)))
    .map((a) => {
      const test = testById.get(String(a.testId))!;
      const score = a.score ?? 0;
      const total = a.totalQuestions ?? 0;

      return {
        testId: String(a.testId),
        title: test.title,
        subjectName: subjectName.get(String(test.subjectId)) ?? null,
        score,
        totalQuestions: total,
        percentage: percentage(score, total),
        status: a.status as AttemptStatus,
        closesAt: test.closesAt.toISOString(),
      };
    })
    .sort((a, b) => b.closesAt.localeCompare(a.closesAt));
}
