import { connectToDatabase } from "@/lib/db";
import type { TestStatus } from "@/lib/tests-shared";
import Attempt from "@/models/Attempt";
import Test from "@/models/Test";
import User from "@/models/User";

/**
 * The numbers on the admin overview.
 *
 * Every one of them is a query. There are no placeholders here and no
 * "coming soon" tiles holding space for a metric that does not exist yet — a
 * dashboard that shows a number nobody computed teaches its reader to stop
 * believing the ones that were.
 *
 * Each stat carries the sentence that defines it, because "active students"
 * means nothing until you say active at what.
 */

export const UPCOMING_WINDOW_DAYS = 7;

export type AdminStats = {
  testsConducted: number;
  activeStudents: number;
  studentsOnRoll: number;
  openNow: number;
  upcoming: number;
  upcomingWindowDays: number;
};

/**
 * Published, whatever the stored status says about when it was saved.
 *
 * Both values mean the teacher committed the paper; see the note on
 * TEST_STATUSES. Visibility itself is still decided by the dates below.
 */
const PUBLISHED = { $in: ["scheduled", "published"] as TestStatus[] };

export async function getAdminStats(
  schoolId: string,
  now: Date = new Date()
): Promise<AdminStats> {
  await connectToDatabase();

  const horizon = new Date(
    now.getTime() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  // Who has actually sat something, and which papers they sat. Both come off
  // the same collection, so they are asked for together.
  const [satTestIds, satStudentIds] = await Promise.all([
    Attempt.distinct("testId", { schoolId, status: { $ne: "in_progress" } }),
    Attempt.distinct("studentId", { schoolId, status: { $ne: "in_progress" } }),
  ]);

  const [testsConducted, studentsOnRoll, openNow, upcoming] = await Promise.all([
    // A paper counts as conducted once it has closed *and* somebody sat it.
    // A closed paper nobody opened was not a test that happened.
    Test.countDocuments({
      schoolId,
      _id: { $in: satTestIds },
      closesAt: { $lte: now },
    }),
    User.countDocuments({ schoolId, role: "student" }),
    Test.countDocuments({
      schoolId,
      status: PUBLISHED,
      opensAt: { $lte: now },
      closesAt: { $gt: now },
    }),
    Test.countDocuments({
      schoolId,
      status: PUBLISHED,
      opensAt: { $gt: now, $lte: horizon },
    }),
  ]);

  return {
    testsConducted,
    activeStudents: satStudentIds.length,
    studentsOnRoll,
    openNow,
    upcoming,
    upcomingWindowDays: UPCOMING_WINDOW_DAYS,
  };
}
