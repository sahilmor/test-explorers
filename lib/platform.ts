import { connectToDatabase } from "@/lib/db";
import { SetupError } from "@/lib/errors";
import { getSession } from "@/lib/auth";
import { type Plan, effectivePlan } from "@/lib/plans";
import School from "@/models/School";
import User from "@/models/User";

/**
 * The platform owner's view.
 *
 * This is the one screen in the app that deliberately reads across every
 * tenant, so it is also the one place the Phase 1 rule — a query is always
 * filtered by the token's schoolId — does not apply. That makes the gate in
 * front of it the important part, and it is kept small enough to read in one
 * go: a signed-in user whose own email address is on an allowlist held in the
 * environment. No new role, so nothing about the tenant model changes; no
 * secret in a URL, so nothing leaks into a log or a browser history.
 */

/** Who counts as the owner. A comma-separated list, lowercased. */
export function platformOwnerEmails(): string[] {
  const raw =
    process.env.PLATFORM_OWNER_EMAILS?.trim() || "mor.sahil05.28@gmail.com";

  return raw
    .split(",")
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Confirms the caller is the platform owner.
 *
 * Every failure is the same 404, including having no session at all —
 * deliberately, rather than the redirect to /login the rest of the app uses.
 * Bouncing a stranger to a sign-in page would tell them this route is real and
 * worth coming back to with credentials. As far as anyone who is not the owner
 * is concerned, there is nothing here.
 *
 * The email is read from the database rather than from the token: a token is
 * signed at login and would keep asserting an address that has since been
 * changed or handed to somebody else.
 */
export async function requirePlatformOwner(): Promise<{
  userId: string;
  email: string;
}> {
  const session = await getSession();
  if (!session) throw new SetupError("No such page.", 404);

  await connectToDatabase();

  const user = await User.findById(session.userId).select("email").lean();

  if (!user || !platformOwnerEmails().includes(user.email.toLowerCase())) {
    throw new SetupError("No such page.", 404);
  }

  return { userId: session.userId, email: user.email };
}

export type PlatformSchool = {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  storedPlan: Plan;
  planValidUntil: string;
  maxStudents: number;
  studentCount: number;
  teacherCount: number;
  testCount: number;
  attemptCount: number;
  /** Captured payments only, in paise. */
  revenuePaise: number;
  payments: number;
  lastPaymentAt: string | null;
  createdAt: string;
};

export type PlatformOverview = {
  schools: PlatformSchool[];
  totals: {
    schools: number;
    trial: number;
    active: number;
    expired: number;
    students: number;
    revenuePaise: number;
    payingSchools: number;
  };
};

/**
 * Every school, with what it is worth.
 *
 * Counts come from aggregations grouped by school rather than a query per
 * school, so this stays one round trip per collection however many schools
 * there are.
 */
export async function getPlatformOverview(
  now: Date = new Date()
): Promise<PlatformOverview> {
  await connectToDatabase();

  const { default: Test } = await import("@/models/Test");
  const { default: Attempt } = await import("@/models/Attempt");

  const [schools, userCounts, testCounts, attemptCounts] = await Promise.all([
    School.find({}).sort({ createdAt: -1 }).lean(),
    User.aggregate<{ _id: { schoolId: unknown; role: string }; n: number }>([
      { $group: { _id: { schoolId: "$schoolId", role: "$role" }, n: { $sum: 1 } } },
    ]),
    Test.aggregate<{ _id: unknown; n: number }>([
      { $group: { _id: "$schoolId", n: { $sum: 1 } } },
    ]),
    Attempt.aggregate<{ _id: unknown; n: number }>([
      { $group: { _id: "$schoolId", n: { $sum: 1 } } },
    ]),
  ]);

  const students = new Map<string, number>();
  const teachers = new Map<string, number>();
  for (const row of userCounts) {
    const key = String(row._id.schoolId);
    if (row._id.role === "student") students.set(key, row.n);
    if (row._id.role === "teacher") teachers.set(key, row.n);
  }

  const tests = new Map(testCounts.map((r) => [String(r._id), r.n]));
  const attempts = new Map(attemptCounts.map((r) => [String(r._id), r.n]));

  const rows: PlatformSchool[] = schools.map((school) => {
    const id = String(school._id);

    // Only captured payments count as money. An order that was opened and
    // abandoned is not revenue, and counting it would be the quickest way to
    // start lying to yourself about the business.
    const captured = (school.subscriptionHistory ?? []).filter(
      (entry) => entry.status === "captured"
    );

    const lastPaymentAt = captured.reduce<Date | null>(
      (latest, entry) =>
        !latest || entry.createdAt > latest ? entry.createdAt : latest,
      null
    );

    return {
      id,
      name: school.name,
      slug: school.slug,
      plan: effectivePlan(school.plan as Plan, school.planValidUntil, now),
      storedPlan: school.plan as Plan,
      planValidUntil: school.planValidUntil.toISOString(),
      maxStudents: school.maxStudents ?? 0,
      studentCount: students.get(id) ?? 0,
      teacherCount: teachers.get(id) ?? 0,
      testCount: tests.get(id) ?? 0,
      attemptCount: attempts.get(id) ?? 0,
      revenuePaise: captured.reduce((sum, entry) => sum + entry.amount, 0),
      payments: captured.length,
      lastPaymentAt: lastPaymentAt?.toISOString() ?? null,
      createdAt:
        (school as { createdAt?: Date }).createdAt?.toISOString() ??
        school.planValidUntil.toISOString(),
    };
  });

  return {
    schools: rows,
    totals: {
      schools: rows.length,
      trial: rows.filter((r) => r.plan === "trial").length,
      active: rows.filter((r) => r.plan === "active").length,
      expired: rows.filter((r) => r.plan === "expired").length,
      students: rows.reduce((sum, r) => sum + r.studentCount, 0),
      revenuePaise: rows.reduce((sum, r) => sum + r.revenuePaise, 0),
      payingSchools: rows.filter((r) => r.revenuePaise > 0).length,
    },
  };
}
