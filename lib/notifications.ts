import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { percentage } from "@/lib/grading";
import { sendEmail, type EmailMessage } from "@/lib/email/send";
import { resultsPublishedEmail, testAssignedEmail } from "@/lib/email/templates";
import Notification, { type NotificationKind } from "@/models/Notification";
import School from "@/models/School";
import Attempt from "@/models/Attempt";
import Subject from "@/models/Subject";
import Test from "@/models/Test";
import TestAssignment from "@/models/TestAssignment";
import User from "@/models/User";

/**
 * Telling people things.
 *
 * Two rules govern this whole file.
 *
 * **Nothing in here may break anything else.** An email is a courtesy on top
 * of an action that has already succeeded. If Resend is down, or a key is
 * missing, or a row is malformed, the assignment still happened and the result
 * is still visible in the app. Every public function below returns a summary
 * and throws nothing; callers are expected to schedule them with `after()` so
 * they do not even sit in the response path.
 *
 * **Once each.** The triggers all repeat — a teacher reassigning a paper, the
 * sweep running on every request, two tabs racing — so the send is claimed by
 * inserting a row whose unique index does the arbitration. See
 * models/Notification.ts.
 */

export type NotifySummary = {
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
};

const EMPTY: NotifySummary = { attempted: 0, sent: 0, skipped: 0, failed: 0 };

/** How many tests one opportunistic pass will announce results for. */
const RESULTS_BATCH = 5;

/**
 * Only look back a bounded distance. A school that has been quiet for a month
 * should not wake up and mail every result it ever recorded — those students
 * have long since seen them in the app.
 */
const RESULTS_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}

/**
 * Claims one notification and sends it.
 *
 * The insert is the lock. If it collides, somebody else already owns this
 * send — which is the answer we wanted, not an error.
 */
async function claimAndSend(options: {
  schoolId: string | mongoose.Types.ObjectId;
  kind: NotificationKind;
  testId: string | mongoose.Types.ObjectId;
  userId: string | mongoose.Types.ObjectId;
  email: string;
  build: () => Omit<EmailMessage, "to">;
}): Promise<"sent" | "skipped" | "failed"> {
  let claim;

  try {
    claim = await Notification.create({
      schoolId: options.schoolId,
      kind: options.kind,
      testId: options.testId,
      userId: options.userId,
      email: options.email,
      status: "sending",
    });
  } catch (error) {
    if (isDuplicateKey(error)) return "skipped";
    console.error("[notify] could not claim a notification:", error);
    return "failed";
  }

  const result = await sendEmail({ ...options.build(), to: options.email });

  try {
    if (result.ok) {
      await Notification.updateOne(
        { _id: claim._id },
        { $set: { status: "sent", providerId: result.id, sentAt: new Date() } }
      );
      return "sent";
    }

    // A send that never happened because email is switched off is not a
    // failure worth keeping a row for — remove the claim so it can be retried
    // for real once a key is configured.
    if (result.skipped) {
      await Notification.deleteOne({ _id: claim._id });
      return "skipped";
    }

    await Notification.updateOne(
      { _id: claim._id },
      { $set: { status: "failed", error: result.reason.slice(0, 300) } }
    );
    return "failed";
  } catch (error) {
    console.error("[notify] could not record a notification result:", error);
    return "failed";
  }
}

// ---------------------------------------------------------------------------
// "A test has been set for you"
// ---------------------------------------------------------------------------

/**
 * Tells every student in a published test's sections that it exists.
 *
 * Called after a paper is published or reassigned. Reassigning to a section
 * that already had it mails nobody twice; adding a new section mails only that
 * section, because the claim is per student.
 */
export async function notifyTestAssigned(
  schoolId: string,
  testId: string
): Promise<NotifySummary> {
  try {
    await connectToDatabase();

    const test = await Test.findOne({ _id: testId, schoolId }).lean();

    // A draft is not assigned to anybody, whatever its rows say.
    if (!test || test.status === "draft") return EMPTY;

    // Announcing a paper that has already closed would only confuse.
    if (test.closesAt <= new Date()) return EMPTY;

    const [school, subject, assignments] = await Promise.all([
      School.findById(schoolId).select("name").lean(),
      Subject.findOne({ _id: test.subjectId, schoolId }).select("name").lean(),
      TestAssignment.find({ schoolId, testId }).select("sectionId").lean(),
    ]);

    if (!school || assignments.length === 0) return EMPTY;

    const students = await User.find({
      schoolId,
      role: "student",
      sectionId: { $in: assignments.map((a) => a.sectionId) },
    })
      .select("name email")
      .lean();

    const summary: NotifySummary = { ...EMPTY, attempted: students.length };

    for (const student of students) {
      const outcome = await claimAndSend({
        schoolId,
        kind: "test_assigned",
        testId,
        userId: student._id,
        email: student.email,
        build: () =>
          testAssignedEmail({
            studentName: student.name,
            schoolName: school.name,
            testTitle: test.title,
            subjectName: subject?.name ?? null,
            durationMinutes: test.durationMinutes,
            questionCount: (test.questionIds ?? []).length,
            opensAt: test.opensAt,
            closesAt: test.closesAt,
          }),
      });

      summary[outcome] += 1;
    }

    return summary;
  } catch (error) {
    // The paper is assigned either way. That is the part that mattered.
    console.error("[notify] test-assigned run failed:", error);
    return EMPTY;
  }
}

// ---------------------------------------------------------------------------
// "Your result is out"
// ---------------------------------------------------------------------------

/**
 * Mails results for papers that have closed since anyone last looked.
 *
 * Deliberately driven off the same closing time the results gate uses, so an
 * email can never arrive before the result it links to is visible — a student
 * clicking through to a 403 would be worse than no email at all.
 *
 * Runs opportunistically beside the attempt sweep, so no scheduler is needed
 * and a Hobby plan's daily cron is not the only thing keeping it honest.
 */
export async function notifyResultsPublished(
  schoolId: string,
  now: Date = new Date()
): Promise<NotifySummary> {
  try {
    await connectToDatabase();

    const closedTests = await Test.find({
      schoolId,
      closesAt: { $lte: now, $gte: new Date(now.getTime() - RESULTS_LOOKBACK_MS) },
      status: { $ne: "draft" },
    })
      .sort({ closesAt: -1 })
      .limit(RESULTS_BATCH)
      .lean();

    if (closedTests.length === 0) return EMPTY;

    const school = await School.findById(schoolId).select("name").lean();
    if (!school) return EMPTY;

    const summary: NotifySummary = { ...EMPTY };

    for (const test of closedTests) {
      // Already dealt with: every attempt on this paper has a row.
      const attempts = await Attempt.find({
        schoolId,
        testId: test._id,
        status: { $ne: "in_progress" },
      })
        .select("studentId score totalQuestions")
        .lean();

      if (attempts.length === 0) continue;

      const alreadyTold = await Notification.find({
        kind: "results_published",
        testId: test._id,
      })
        .select("userId")
        .lean();

      const told = new Set(alreadyTold.map((n) => String(n.userId)));
      const outstanding = attempts.filter((a) => !told.has(String(a.studentId)));
      if (outstanding.length === 0) continue;

      const [subject, students] = await Promise.all([
        Subject.findOne({ _id: test.subjectId, schoolId }).select("name").lean(),
        User.find({
          schoolId,
          _id: { $in: outstanding.map((a) => a.studentId) },
        })
          .select("name email")
          .lean(),
      ]);

      const byId = new Map(students.map((s) => [String(s._id), s]));
      summary.attempted += outstanding.length;

      for (const attempt of outstanding) {
        const student = byId.get(String(attempt.studentId));
        if (!student) {
          summary.skipped += 1;
          continue;
        }

        const score = attempt.score ?? 0;
        const total = attempt.totalQuestions ?? (test.questionIds ?? []).length;

        const outcome = await claimAndSend({
          schoolId,
          kind: "results_published",
          testId: test._id,
          userId: student._id,
          email: student.email,
          build: () =>
            resultsPublishedEmail({
              studentName: student.name,
              schoolName: school.name,
              testId: String(test._id),
              testTitle: test.title,
              subjectName: subject?.name ?? null,
              score,
              totalQuestions: total,
              percentage: percentage(score, total),
            }),
        });

        summary[outcome] += 1;
      }
    }

    return summary;
  } catch (error) {
    console.error("[notify] results-published run failed:", error);
    return EMPTY;
  }
}
