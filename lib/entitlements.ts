import { connectToDatabase } from "@/lib/db";
import { SetupError } from "@/lib/errors";
import {
  ANNUAL_PLAN,
  type Plan,
  daysLeft,
  effectivePlan,
} from "@/lib/plans";
import School from "@/models/School";
import User from "@/models/User";

/**
 * What a school is allowed to do right now.
 *
 * Every rule about plans and caps lives in this file and nowhere else. The
 * routes and the lib functions call `assertCan…` at the top and then get on
 * with their work, the same arrangement as `withAuth` in Phase 1: one place to
 * read, one place to change, and no chance of a new route quietly shipping
 * without the check because somebody forgot to paste it in.
 *
 * Reads are never blocked. An expired school can sign in, look at every mark
 * it has ever recorded and export nothing less than before — losing access to
 * your own data because an invoice lapsed is how you lose a customer for good.
 * What stops is *growth*: new papers, new students, new sittings.
 */

/** Why an action was refused. The UI branches on this, not on the message. */
export type PlanBlockReason = "expired" | "student_cap";

/**
 * A refusal the customer can act on. 402 rather than 403: this is not "you may
 * never", it is "not until this is paid", and the two deserve different
 * screens.
 */
export class PlanError extends SetupError {
  constructor(
    message: string,
    readonly reason: PlanBlockReason,
    /** Where to send them to fix it. */
    readonly upgradeHref = "/admin/billing"
  ) {
    super(message, 402);
    this.name = "PlanError";
  }
}

export type Entitlement = {
  schoolId: string;
  schoolName: string;
  /** Recomputed from the dates, never read straight off the document. */
  plan: Plan;
  /** What the document says, which may already be out of date. */
  storedPlan: Plan;
  planValidUntil: Date;
  daysRemaining: number;
  maxStudents: number;
  studentCount: number;
  studentsRemaining: number;
  atStudentCap: boolean;
};

/**
 * Loads a school's entitlement. Two queries, both filtered by the school id
 * that came off the verified token.
 */
export async function getEntitlement(
  schoolId: string,
  now: Date = new Date()
): Promise<Entitlement> {
  await connectToDatabase();

  const [school, studentCount] = await Promise.all([
    School.findById(schoolId)
      .select("name plan planValidUntil maxStudents")
      .lean(),
    User.countDocuments({ schoolId, role: "student" }),
  ]);

  if (!school) throw new SetupError("No such school.", 404);

  const plan = effectivePlan(school.plan as Plan, school.planValidUntil, now);
  const maxStudents = school.maxStudents ?? 0;

  return {
    schoolId,
    schoolName: school.name,
    plan,
    storedPlan: school.plan as Plan,
    planValidUntil: school.planValidUntil,
    daysRemaining: daysLeft(school.planValidUntil, now),
    maxStudents,
    studentCount,
    studentsRemaining: Math.max(0, maxStudents - studentCount),
    atStudentCap: studentCount >= maxStudents,
  };
}

/**
 * Completes the sentence `what` starts, so the two halves read as one line
 * rather than colliding mid-sentence with a stray capital.
 */
const EXPIRED_MESSAGE =
  "your plan has expired. Everything you've already got stays right here and stays readable — renewing switches the rest back on.";

/**
 * The one place the expiry rule is written down.
 *
 * `what` completes the sentence, so each refusal names the thing that was
 * actually refused instead of a generic wall.
 */
export async function assertPlanActive(
  schoolId: string,
  what: string,
  now?: Date
): Promise<Entitlement> {
  const entitlement = await getEntitlement(schoolId, now);

  if (entitlement.plan === "expired") {
    throw new PlanError(`${what} ${EXPIRED_MESSAGE}`, "expired");
  }

  return entitlement;
}

/** Writing a new paper needs a live plan. */
export async function assertCanCreateTest(schoolId: string, now?: Date) {
  return assertPlanActive(schoolId, "You can't set a new paper while", now);
}

/**
 * Adding students needs a live plan *and* room under the cap.
 *
 * `howMany` is checked as a batch so a CSV of 40 into 12 remaining places is
 * refused before a single row is written, rather than half-importing.
 */
export async function assertCanAddStudents(
  schoolId: string,
  howMany = 1,
  now?: Date
) {
  const entitlement = await assertPlanActive(
    schoolId,
    "You can't add students while",
    now
  );

  if (entitlement.studentsRemaining < howMany) {
    throw new PlanError(studentCapMessage(entitlement, howMany), "student_cap");
  }

  return entitlement;
}

/** The message a person reads when the cap stops them. Worth getting right. */
export function studentCapMessage(entitlement: Entitlement, howMany = 1): string {
  const { maxStudents, studentCount, studentsRemaining } = entitlement;

  if (studentsRemaining === 0) {
    return `Your plan covers ${maxStudents} students and you have ${studentCount}. Upgrading raises the cap to ${ANNUAL_PLAN.maxStudents}.`;
  }

  return `That would put you over your plan's ${maxStudents}-student cap — there ${
    studentsRemaining === 1 ? "is 1 place" : `are ${studentsRemaining} places`
  } left and you're adding ${howMany}. Upgrading raises the cap to ${ANNUAL_PLAN.maxStudents}.`;
}

/**
 * Starting a paper needs a live plan.
 *
 * Deliberately only the *start*. A student already sitting a paper when the
 * plan lapses keeps saving and keeps submitting — their attempt is their work,
 * and voiding it over their school's invoice would be indefensible. Phase 5
 * went to some trouble to make sure a sitting always ends in a submission, and
 * billing is not a good enough reason to undo that.
 */
export async function assertCanStartAttempt(schoolId: string, now?: Date) {
  const entitlement = await getEntitlement(schoolId, now);

  if (entitlement.plan === "expired") {
    throw new PlanError(
      "This school's plan has expired, so new papers can't be started. Your teacher can sort it out — nothing you've already submitted is affected.",
      "expired"
    );
  }

  return entitlement;
}

/** True when it is time for the dashboard to start asking for money. */
export function shouldNudge(entitlement: Entitlement, nudgeDays: number): boolean {
  return (
    entitlement.plan === "expired" ||
    (entitlement.plan === "trial" && entitlement.daysRemaining <= nudgeDays)
  );
}
