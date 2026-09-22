import mongoose from "mongoose";
import Attempt from "@/models/Attempt";
import Question from "@/models/Question";
import type { AttemptStatus } from "@/lib/attempts-shared";

/**
 * Marking.
 *
 * Every question is multiple choice with exactly one right answer, so marking
 * is a comparison and nothing here needs a human. It runs as part of the same
 * call that sets a submitted status — all three of them — so a student can
 * never be "submitted" without a mark having been worked out.
 *
 * It is written to be re-runnable. Every count is derived from the stored
 * responses and the question key and written with `$set`, so grading an
 * already-graded attempt produces the same numbers rather than adding to them.
 */

export type Grade = {
  score: number;
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
};

export type StoredResponse = {
  questionId: mongoose.Types.ObjectId | string;
  selectedOptionIndex?: number | null;
  markedForReview?: boolean;
};

/** Percentage, rounded to a whole number. 0 questions is 0%, not NaN. */
export function percentage(score: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((score / total) * 100);
}

/**
 * Marks one attempt against a question key.
 *
 * The test's `questionIds` is the authority on what is on the paper, not the
 * responses — a question a student never opened still counts towards the
 * total, as unanswered. A response naming a question no longer on the paper is
 * ignored rather than counted.
 */
export function gradeResponses(
  questionIds: (mongoose.Types.ObjectId | string)[],
  responses: StoredResponse[],
  correctByQuestion: Map<string, number>
): Grade {
  const answered = new Map(
    responses.map((r) => [String(r.questionId), r.selectedOptionIndex ?? null])
  );

  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;

  for (const id of questionIds) {
    const key = String(id);
    const chosen = answered.get(key);

    if (chosen === null || chosen === undefined) {
      unansweredCount++;
      continue;
    }

    const correct = correctByQuestion.get(key);
    // A question whose row has vanished cannot be marked either way. Counting
    // it wrong would penalise the student for the teacher's edit.
    if (correct === undefined) {
      unansweredCount++;
      continue;
    }

    if (chosen === correct) correctCount++;
    else incorrectCount++;
  }

  return {
    score: correctCount,
    totalQuestions: questionIds.length,
    correctCount,
    incorrectCount,
    unansweredCount,
  };
}

/** The answer key for a set of questions, scoped to one school. */
export async function answerKey(
  schoolId: string | mongoose.Types.ObjectId,
  questionIds: (mongoose.Types.ObjectId | string)[]
): Promise<Map<string, number>> {
  if (questionIds.length === 0) return new Map();

  const docs = await Question.find({ _id: { $in: questionIds }, schoolId })
    .select("correctOptionIndex")
    .lean();

  return new Map(docs.map((q) => [String(q._id), q.correctOptionIndex]));
}

/**
 * Finishes an attempt: sets its status and writes its mark in one update.
 *
 * Every path that ends an attempt goes through here — the student pressing
 * submit, the deadline check that runs on any read or write, and the sweep.
 * Keeping it in one function is what makes "submitted but never graded"
 * unreachable rather than merely unlikely.
 *
 * The update is guarded on the attempt still being in progress, so two paths
 * racing to finish the same attempt cannot both win.
 */
export async function finishAttempt(options: {
  attemptId: mongoose.Types.ObjectId | string;
  schoolId: string | mongoose.Types.ObjectId;
  questionIds: (mongoose.Types.ObjectId | string)[];
  responses: StoredResponse[];
  status: Exclude<AttemptStatus, "in_progress">;
  submittedAt: Date;
  now?: Date;
}): Promise<Grade> {
  const key = await answerKey(options.schoolId, options.questionIds);
  const grade = gradeResponses(options.questionIds, options.responses, key);

  await Attempt.updateOne(
    { _id: options.attemptId, status: "in_progress" },
    {
      $set: {
        status: options.status,
        submittedAt: options.submittedAt,
        ...grade,
        gradedAt: options.now ?? new Date(),
      },
    }
  );

  return grade;
}

/**
 * Marks an attempt that is already submitted.
 *
 * Only needed for attempts finished before grading existed, or if a mark ever
 * has to be recomputed. Writing absolute values means running it twice is the
 * same as running it once.
 */
export async function regradeAttempt(attempt: {
  _id: mongoose.Types.ObjectId;
  schoolId: mongoose.Types.ObjectId;
  responses: StoredResponse[];
  status: string;
}, questionIds: (mongoose.Types.ObjectId | string)[]): Promise<Grade> {
  const key = await answerKey(attempt.schoolId, questionIds);
  const grade = gradeResponses(questionIds, attempt.responses, key);

  await Attempt.updateOne(
    { _id: attempt._id, status: { $ne: "in_progress" } },
    { $set: { ...grade, gradedAt: new Date() } }
  );

  return grade;
}
