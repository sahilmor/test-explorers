import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { assertCanStartAttempt } from "@/lib/entitlements";
import { MAX_VIOLATIONS, VIOLATION_DEBOUNCE_MS, type ViolationKind } from "@/lib/attempts-shared";
import { slotFor } from "@/lib/scheduling";
import { SetupError } from "@/lib/school-setup";
import Attempt from "@/models/Attempt";
import Question from "@/models/Question";
import Subject from "@/models/Subject";
import Test from "@/models/Test";
import TestAssignment from "@/models/TestAssignment";
import User from "@/models/User";
import { attemptDeadline, type AttemptStatus } from "@/lib/attempts-shared";
import { finishAttempt } from "@/lib/grading";

/**
 * Sitting a test.
 *
 * Two rules run through everything here:
 *
 *  1. The deadline is the server's. It is computed once from
 *     min(startedAt + duration, test.closesAt) and re-checked on every single
 *     request that touches an attempt. A client that has drifted, been asleep,
 *     or been tampered with cannot buy itself another second.
 *
 *  2. The correct answers never leave the server. The payload a student's
 *     browser receives has question text and options and nothing else — there
 *     is no `correctOptionIndex` field to read out of the network tab.
 */

export type SittingQuestion = {
  id: string;
  text: string;
  imageUrl: string | null;
  options: string[];
};

export type SittingResponse = {
  questionId: string;
  selectedOptionIndex: number | null;
  markedForReview: boolean;
};

export type SittingState = {
  attempt: {
    id: string;
    status: AttemptStatus;
    startedAt: string;
    submittedAt: string | null;
    lastSavedAt: string | null;
    responses: SittingResponse[];
    /** Survives a refresh, a crash and a change of device. */
    violationCount: number;
    violationLimit: number;
  };
  test: {
    id: string;
    title: string;
    subjectName: string | null;
    durationMinutes: number;
    closesAt: string;
    questions: SittingQuestion[];
  };
  /** The only deadline that counts. Computed here, never by the client. */
  deadlineAt: string;
  /** So the client can measure its own clock offset instead of trusting it. */
  serverNow: string;
};

/**
 * Force-submits an attempt whose time is up.
 *
 * `submittedAt` is set to the deadline rather than to now, because that is
 * when the student's time actually ran out — a sweep that runs late should not
 * record a submission three hours after the fact.
 */
async function enforceDeadline(
  attempt: {
    _id: mongoose.Types.ObjectId;
    status: string;
    schoolId: mongoose.Types.ObjectId;
    responses?: unknown[];
  },
  test: { questionIds?: mongoose.Types.ObjectId[] },
  deadline: Date,
  now: Date
): Promise<AttemptStatus> {
  if (attempt.status !== "in_progress") return attempt.status as AttemptStatus;
  if (now < deadline) return "in_progress";

  // Marked in the same call that closes it, so "submitted but never graded"
  // is not a state this app can produce.
  await finishAttempt({
    attemptId: attempt._id,
    schoolId: attempt.schoolId,
    questionIds: test.questionIds ?? [],
    responses: (attempt.responses ?? []) as never[],
    status: "auto_submitted",
    submittedAt: deadline,
    now,
  });

  return "auto_submitted";
}

/** The questions of a test, in the teacher's order, minus the answer key. */
async function sittingQuestions(
  schoolId: string,
  questionIds: mongoose.Types.ObjectId[]
): Promise<SittingQuestion[]> {
  if (questionIds.length === 0) return [];

  const docs = await Question.find({ _id: { $in: questionIds }, schoolId })
    // Deliberately narrow. `correctOptionIndex` is not selected, so it cannot
    // be leaked by accident when this shape changes later.
    .select("text imageUrl options")
    .lean();

  const byId = new Map(docs.map((q) => [String(q._id), q]));

  return questionIds
    .map((id) => byId.get(String(id)))
    .filter((q): q is NonNullable<typeof q> => Boolean(q))
    .map((q) => ({
      id: String(q._id),
      text: q.text,
      imageUrl: q.imageUrl ?? null,
      options: q.options,
    }));
}

/**
 * Checks that this student may sit this test at all, and returns what is
 * needed to build or resume an attempt.
 */
async function loadContext(schoolId: string, studentId: string, testId: string) {
  const [student, test] = await Promise.all([
    User.findOne({ _id: studentId, schoolId, role: "student" })
      .select("sectionId")
      .lean(),
    // schoolId in the filter, so another school's test is simply not found.
    Test.findOne({ _id: testId, schoolId }).lean(),
  ]);

  if (!student) throw new SetupError("No such student.", 404);
  if (!test) throw new SetupError("No such test.", 404);
  if (!student.sectionId) {
    throw new SetupError("You're not in a class yet, so no tests are set for you.", 403);
  }

  // The section assignment is the thing that makes this test theirs. Without
  // it, a student who guessed a test id would otherwise be let in.
  const assigned = await TestAssignment.exists({
    schoolId,
    testId,
    sectionId: student.sectionId,
  });

  if (!assigned) throw new SetupError("This test isn't set for your class.", 404);

  // Narrowed past the null check above, so callers do not have to re-assert it.
  return { sectionId: student.sectionId as mongoose.Types.ObjectId, test };
}

/**
 * Starts a fresh attempt, or resumes the one already running.
 *
 * The attempt row is written before any question is returned, so "started the
 * test but nothing was ever saved" is not a reachable state. Opening the test
 * in a second tab lands on the same row — the unique index on
 * { testId, studentId } means a second insert cannot succeed, and the race is
 * caught and turned into a resume.
 */
export async function startOrResumeAttempt(
  schoolId: string,
  studentId: string,
  testId: string,
  now: Date = new Date()
): Promise<SittingState> {
  await connectToDatabase();

  const { sectionId, test } = await loadContext(schoolId, studentId, testId);

  const existing = await Attempt.findOne({ testId, studentId }).lean();

  if (!existing) {
    // A lapsed plan stops new sittings, and only new ones — an attempt
    // already open keeps saving and submitting, because it falls through this
    // branch entirely.
    await assertCanStartAttempt(schoolId, now);

    // A scheduled slot, if there is one, is what decides — a class sitting
    // this in Lab 2 third period cannot start in second period just because
    // the paper's own window happens to be open. Unscheduled papers fall back
    // to that window exactly as before, which is what a school not using labs
    // gets.
    const scheduled = await slotFor(schoolId, testId, String(sectionId), now);

    if (scheduled) {
      if (now < scheduled.window.startsAt) {
        throw new SetupError(
          `Your class sits this in ${scheduled.slot.labName}, period ${scheduled.slot.period} on ${scheduled.slot.day} (${scheduled.slot.periodLabel}). You can't start before then.`,
          403
        );
      }
      if (now >= scheduled.window.endsAt) {
        throw new SetupError(
          `Your class's slot for this paper has finished — ${scheduled.slot.labName}, period ${scheduled.slot.period} on ${scheduled.slot.day}. Speak to your teacher.`,
          403
        );
      }
    } else {
      // Only block a *new* start outside the window. A student already sitting
      // keeps their attempt so it can be submitted properly rather than vanish.
      if (now < test.opensAt) {
        throw new SetupError("This test hasn't opened yet.", 403);
      }
      if (now >= test.closesAt) {
        throw new SetupError("This test has closed.", 403);
      }
    }
    if ((test.questionIds ?? []).length === 0) {
      throw new SetupError("This test has no questions in it yet.", 409);
    }

    try {
      await Attempt.create({
        schoolId,
        testId,
        studentId,
        sectionId,
        startedAt: now,
        status: "in_progress",
        responses: [],
      });
    } catch (error) {
      // Two tabs hit start at the same moment. The index did its job; fall
      // through and read back whichever one won.
      const duplicate =
        typeof error === "object" &&
        error !== null &&
        (error as { code?: number }).code === 11000;
      if (!duplicate) throw error;
    }
  }

  return getAttemptState(schoolId, studentId, testId, now);
}

/** The current state of a student's attempt, with the deadline enforced. */
export async function getAttemptState(
  schoolId: string,
  studentId: string,
  testId: string,
  now: Date = new Date()
): Promise<SittingState> {
  await connectToDatabase();

  const { test } = await loadContext(schoolId, studentId, testId);

  const attempt = await Attempt.findOne({ testId, studentId, schoolId }).lean();
  if (!attempt) throw new SetupError("You haven't started this test.", 404);

  const deadline = attemptDeadline(
    attempt.startedAt,
    test.durationMinutes,
    test.closesAt
  );

  // Every read is also a deadline check, so simply opening the page after the
  // time has run out submits — and marks — the attempt rather than showing a
  // live paper.
  const status = await enforceDeadline(attempt, test, deadline, now);

  const [questions, subject] = await Promise.all([
    sittingQuestions(schoolId, test.questionIds ?? []),
    Subject.findOne({ _id: test.subjectId, schoolId }).select("name").lean(),
  ]);

  return {
    attempt: {
      id: String(attempt._id),
      status,
      startedAt: attempt.startedAt.toISOString(),
      submittedAt:
        status === "in_progress"
          ? null
          : (attempt.submittedAt ?? deadline).toISOString(),
      lastSavedAt: attempt.lastSavedAt?.toISOString() ?? null,
      violationCount: (attempt.violations ?? []).length,
      violationLimit: MAX_VIOLATIONS,
      responses: (attempt.responses ?? []).map((r) => ({
        questionId: String(r.questionId),
        selectedOptionIndex:
          r.selectedOptionIndex === null || r.selectedOptionIndex === undefined
            ? null
            : r.selectedOptionIndex,
        markedForReview: Boolean(r.markedForReview),
      })),
    },
    test: {
      id: String(test._id),
      title: test.title,
      subjectName: subject?.name ?? null,
      durationMinutes: test.durationMinutes,
      closesAt: test.closesAt.toISOString(),
      questions,
    },
    deadlineAt: deadline.toISOString(),
    serverNow: now.toISOString(),
  };
}

export type ResponseInput = {
  questionId: string;
  selectedOptionIndex: number | null;
  markedForReview: boolean;
};

export type SaveResult = {
  status: AttemptStatus;
  lastSavedAt: string;
  deadlineAt: string;
  serverNow: string;
  /** Present when the save was refused because time had run out. */
  expired?: true;
};

/**
 * Writes a batch of responses.
 *
 * Idempotent by question id: sending the same answer twice is the same as
 * sending it once, which is what makes a retry after a network blip safe.
 *
 * A save arriving after the deadline is refused, and submits the attempt on
 * the way out — a stale tab that wakes up an hour later cannot append to a
 * finished paper.
 */
export async function saveResponses(
  schoolId: string,
  studentId: string,
  testId: string,
  responses: ResponseInput[],
  now: Date = new Date()
): Promise<SaveResult> {
  await connectToDatabase();

  const { test } = await loadContext(schoolId, studentId, testId);

  const attempt = await Attempt.findOne({ testId, studentId, schoolId }).lean();
  if (!attempt) throw new SetupError("You haven't started this test.", 404);

  const deadline = attemptDeadline(
    attempt.startedAt,
    test.durationMinutes,
    test.closesAt
  );

  if (attempt.status !== "in_progress") {
    throw new SetupError(
      "This attempt has already been submitted, so it can't be changed.",
      409
    );
  }

  if (now >= deadline) {
    await enforceDeadline(attempt, test, deadline, now);
    return {
      status: "auto_submitted",
      lastSavedAt: (attempt.lastSavedAt ?? attempt.startedAt).toISOString(),
      deadlineAt: deadline.toISOString(),
      serverNow: now.toISOString(),
      expired: true,
    };
  }

  // Only questions that are actually on this paper. A crafted request naming
  // some other question is dropped rather than stored.
  const allowed = new Set((test.questionIds ?? []).map((id) => String(id)));

  const merged = new Map(
    (attempt.responses ?? []).map((r) => [
      String(r.questionId),
      {
        questionId: String(r.questionId),
        selectedOptionIndex: r.selectedOptionIndex ?? null,
        markedForReview: Boolean(r.markedForReview),
      },
    ])
  );

  for (const incoming of responses) {
    if (!allowed.has(incoming.questionId)) continue;
    merged.set(incoming.questionId, {
      questionId: incoming.questionId,
      selectedOptionIndex: incoming.selectedOptionIndex,
      markedForReview: incoming.markedForReview,
    });
  }

  const savedAt = now;

  // Guarded on status so a submit landing in between does not get overwritten
  // by an in-flight autosave.
  const result = await Attempt.updateOne(
    { _id: attempt._id, status: "in_progress" },
    {
      $set: {
        responses: [...merged.values()].map((r) => ({
          questionId: new mongoose.Types.ObjectId(r.questionId),
          selectedOptionIndex: r.selectedOptionIndex,
          markedForReview: r.markedForReview,
        })),
        lastSavedAt: savedAt,
      },
    }
  );

  if (result.matchedCount === 0) {
    throw new SetupError(
      "This attempt has already been submitted, so it can't be changed.",
      409
    );
  }

  return {
    status: "in_progress",
    lastSavedAt: savedAt.toISOString(),
    deadlineAt: deadline.toISOString(),
    serverNow: now.toISOString(),
  };
}

/** Manual submit. Locks the attempt against any further write. */
export async function submitAttempt(
  schoolId: string,
  studentId: string,
  testId: string,
  now: Date = new Date()
): Promise<{ status: AttemptStatus; submittedAt: string; answered: number; total: number }> {
  await connectToDatabase();

  const { test } = await loadContext(schoolId, studentId, testId);

  const attempt = await Attempt.findOne({ testId, studentId, schoolId }).lean();
  if (!attempt) throw new SetupError("You haven't started this test.", 404);

  const total = (test.questionIds ?? []).length;
  const answered = (attempt.responses ?? []).filter(
    (r) => r.selectedOptionIndex !== null && r.selectedOptionIndex !== undefined
  ).length;

  // Already finished — report the existing result rather than erroring, so a
  // double-click or a retry lands on the confirmation screen.
  if (attempt.status !== "in_progress") {
    return {
      status: attempt.status as AttemptStatus,
      submittedAt: (attempt.submittedAt ?? now).toISOString(),
      answered,
      total,
    };
  }

  const deadline = attemptDeadline(
    attempt.startedAt,
    test.durationMinutes,
    test.closesAt
  );

  // Submitting after time is up still counts, it is just recorded as the
  // automatic submission it really was.
  const expired = now >= deadline;
  const submittedAt = expired ? deadline : now;
  const status: AttemptStatus = expired ? "auto_submitted" : "submitted";

  // Same call, so a student never sees "submitted" without a mark behind it.
  await finishAttempt({
    attemptId: attempt._id,
    schoolId: attempt.schoolId,
    questionIds: test.questionIds ?? [],
    responses: attempt.responses ?? [],
    status,
    submittedAt,
    now,
  });

  return { status, submittedAt: submittedAt.toISOString(), answered, total };
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

export type SweepResult = {
  checked: number;
  submitted: number;
  attemptIds: string[];
};

/**
 * Force-submits every in-progress attempt whose deadline has passed.
 *
 * This is what makes a closed laptop still produce a submitted paper. It does
 * not need the student's browser to be alive, or to have been alive at the
 * moment the time ran out.
 *
 * It is deliberately cheap and idempotent so it can be run from anywhere:
 * a scheduled job, or opportunistically on an ordinary request. Running it
 * twice submits nothing twice, because each update is guarded on the attempt
 * still being in progress.
 */
export async function sweepExpiredAttempts(
  options: { schoolId?: string; now?: Date; limit?: number } = {}
): Promise<SweepResult> {
  await connectToDatabase();

  const now = options.now ?? new Date();
  const limit = options.limit ?? 500;

  const filter: Record<string, unknown> = { status: "in_progress" };
  if (options.schoolId) filter.schoolId = options.schoolId;

  const running = await Attempt.find(filter)
    // responses come along because the sweep marks as it closes.
    .select("testId startedAt schoolId responses")
    .sort({ startedAt: 1 })
    .limit(limit)
    .lean();

  if (running.length === 0) {
    return { checked: 0, submitted: 0, attemptIds: [] };
  }

  // One query for every test involved, rather than one per attempt.
  const tests = await Test.find({
    _id: { $in: [...new Set(running.map((a) => String(a.testId)))] },
  })
    .select("durationMinutes closesAt questionIds")
    .lean();

  const testById = new Map(tests.map((t) => [String(t._id), t]));

  type Expired = {
    attempt: (typeof running)[number];
    deadline: Date;
    questionIds: mongoose.Types.ObjectId[];
  };

  const expired: Expired[] = [];

  for (const attempt of running) {
    const test = testById.get(String(attempt.testId));

    // A test deleted out from under a live attempt: close the attempt rather
    // than leaving it running forever. With no paper left there is nothing to
    // mark it against, so it grades as zero out of zero.
    if (!test) {
      expired.push({ attempt, deadline: attempt.startedAt, questionIds: [] });
      continue;
    }

    const deadline = attemptDeadline(
      attempt.startedAt,
      test.durationMinutes,
      test.closesAt
    );

    if (now >= deadline) {
      expired.push({ attempt, deadline, questionIds: test.questionIds ?? [] });
    }
  }

  if (expired.length === 0) {
    return { checked: running.length, submitted: 0, attemptIds: [] };
  }

  // Each attempt gets its own deadline as its submittedAt, so a sweep that
  // runs late still records when the time actually ran out — and each is
  // marked in the same update that closes it.
  await Promise.all(
    expired.map((e) =>
      finishAttempt({
        attemptId: e.attempt._id,
        schoolId: e.attempt.schoolId,
        questionIds: e.questionIds,
        responses: e.attempt.responses ?? [],
        status: "auto_submitted",
        submittedAt: e.deadline,
        now,
      })
    )
  );

  return {
    checked: running.length,
    submitted: expired.length,
    attemptIds: expired.map((e) => String(e.attempt._id)),
  };
}

// ---------------------------------------------------------------------------
// Exam integrity
// ---------------------------------------------------------------------------

export type ViolationResult = {
  count: number;
  limit: number;
  /** True when this one was folded into the previous violation. */
  ignored: boolean;
  autoSubmitted: boolean;
};

/**
 * Records that a student left the test screen.
 *
 * Counted on the server for the obvious reason: a count held in the browser is
 * a count a refresh resets. Answers already survive a crash, and a student's
 * warnings have to survive one too or the rule means nothing.
 *
 * Bursts are collapsed. Leaving fullscreen usually fires three different
 * events within a few hundred milliseconds, and spending a student's whole
 * allowance on one press of Escape would be indefensible.
 *
 * Nothing is recorded against an attempt that is already finished — a late
 * `visibilitychange` as the submitted page unloads is not cheating.
 */
export async function recordViolation(
  schoolId: string,
  studentId: string,
  testId: string,
  kind: ViolationKind,
  now: Date = new Date()
): Promise<ViolationResult> {
  await connectToDatabase();

  const attempt = await Attempt.findOne({ schoolId, testId, studentId }).lean();
  if (!attempt) throw new SetupError("You haven't started this test.", 404);

  const violations = attempt.violations ?? [];
  const count = violations.length;

  if (attempt.status !== "in_progress") {
    return { count, limit: MAX_VIOLATIONS, ignored: true, autoSubmitted: true };
  }

  const last = violations.at(-1);
  if (last && now.getTime() - new Date(last.at).getTime() < VIOLATION_DEBOUNCE_MS) {
    return { count, limit: MAX_VIOLATIONS, ignored: true, autoSubmitted: false };
  }

  // Guarded on the attempt still being in progress and on the count not having
  // moved, so two tabs reporting at once cannot both push.
  const pushed = await Attempt.updateOne(
    {
      _id: attempt._id,
      status: "in_progress",
      [`violations.${count}`]: { $exists: false },
    },
    { $push: { violations: { kind, at: now } } }
  );

  if (pushed.matchedCount === 0) {
    const fresh = await Attempt.findById(attempt._id).select("violations status").lean();
    return {
      count: (fresh?.violations ?? []).length,
      limit: MAX_VIOLATIONS,
      ignored: true,
      autoSubmitted: fresh?.status !== "in_progress",
    };
  }

  const newCount = count + 1;

  if (newCount < MAX_VIOLATIONS) {
    return { count: newCount, limit: MAX_VIOLATIONS, ignored: false, autoSubmitted: false };
  }

  // Third strike. Submitted through the same path as any other ending, so it
  // is graded identically — the only difference is the reason recorded.
  const test = await Test.findOne({ _id: testId, schoolId }).select("questionIds").lean();

  await finishAttempt({
    attemptId: attempt._id,
    schoolId,
    questionIds: test?.questionIds ?? [],
    responses: attempt.responses ?? [],
    status: "auto_submitted",
    submittedAt: now,
    autoSubmitReason: "integrity",
    now,
  });

  return { count: newCount, limit: MAX_VIOLATIONS, ignored: false, autoSubmitted: true };
}
