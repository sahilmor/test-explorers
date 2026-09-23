import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { SetupError } from "@/lib/errors";
import { hashPassword } from "@/lib/accounts";
import {
  createStudent,
  createTeacher,
  generateTempPassword,
  listSections,
} from "@/lib/school-setup";
import { type Plan, daysLeft, effectivePlan } from "@/lib/plans";
import Attempt from "@/models/Attempt";
import Question from "@/models/Question";
import School from "@/models/School";
import Section from "@/models/Section";
import Subject from "@/models/Subject";
import Test from "@/models/Test";
import User, { type Role } from "@/models/User";

/**
 * Running a school on its behalf.
 *
 * Every function here deliberately works across the tenant boundary, because
 * the caller is the platform owner rather than a school. That makes the gate
 * in front of these the whole of their security: `requirePlatformOwner` in
 * lib/platform.ts, checked in each route before anything in this file is
 * called. Nothing school-facing may import this module.
 *
 * The point of it is onboarding. A school hands over a roster — a spreadsheet,
 * a WhatsApp message, a photo of a register — and the owner types it in for
 * them. So these bypass the student cap (a commercial term aimed at schools,
 * not at the person selling to them) and there is no payment step anywhere:
 * a plan is set because money changed hands somewhere else.
 */

export type SchoolPerson = {
  id: string;
  name: string;
  email: string;
  role: Role;
  sectionId: string | null;
  sectionName: string | null;
  createdAt: string;
};

export type SchoolDetail = {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  storedPlan: Plan;
  planValidUntil: string;
  daysRemaining: number;
  maxStudents: number;
  createdAt: string;
  counts: {
    admins: number;
    teachers: number;
    students: number;
    sections: number;
    subjects: number;
    questions: number;
    tests: number;
    attempts: number;
  };
  sections: { id: string; name: string }[];
  people: SchoolPerson[];
};

function assertObjectId(id: string, what: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new SetupError(`No such ${what}.`, 404);
  }
}

export async function getSchoolDetail(
  schoolId: string,
  now: Date = new Date()
): Promise<SchoolDetail> {
  assertObjectId(schoolId, "school");
  await connectToDatabase();

  const school = await School.findById(schoolId).lean();
  if (!school) throw new SetupError("No such school.", 404);

  const [sections, users, subjects, questions, tests, attempts] = await Promise.all([
    listSections(schoolId),
    User.find({ schoolId }).select("name email role sectionId createdAt").sort({ role: 1, name: 1 }).lean(),
    Subject.countDocuments({ schoolId }),
    Question.countDocuments({ schoolId }),
    Test.countDocuments({ schoolId }),
    Attempt.countDocuments({ schoolId }),
  ]);

  const sectionName = new Map(sections.map((s) => [s.id, s.name]));

  const people: SchoolPerson[] = users.map((u) => ({
    id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role as Role,
    sectionId: u.sectionId ? String(u.sectionId) : null,
    sectionName: u.sectionId ? (sectionName.get(String(u.sectionId)) ?? null) : null,
    createdAt:
      (u as { createdAt?: Date }).createdAt?.toISOString() ?? new Date(0).toISOString(),
  }));

  return {
    id: String(school._id),
    name: school.name,
    slug: school.slug,
    plan: effectivePlan(school.plan as Plan, school.planValidUntil, now),
    storedPlan: school.plan as Plan,
    planValidUntil: school.planValidUntil.toISOString(),
    daysRemaining: daysLeft(school.planValidUntil, now),
    maxStudents: school.maxStudents ?? 0,
    createdAt:
      (school as { createdAt?: Date }).createdAt?.toISOString() ??
      school.planValidUntil.toISOString(),
    counts: {
      admins: people.filter((p) => p.role === "admin").length,
      teachers: people.filter((p) => p.role === "teacher").length,
      students: people.filter((p) => p.role === "student").length,
      sections: sections.length,
      subjects,
      questions,
      tests,
      attempts,
    },
    sections: sections.map((s) => ({ id: s.id, name: s.name })),
    people,
  };
}

/**
 * Sets a school's plan outright.
 *
 * This is the replacement for the checkout: payment happens elsewhere, and
 * this records the result. `plan` and `planValidUntil` are stored as given —
 * the app recomputes what the plan *effectively* is from the date on every
 * read, so setting "active" with a date in the past reads as expired, which is
 * the correct and slightly surprising behaviour to be aware of.
 */
export async function setSchoolPlan(
  schoolId: string,
  input: { plan: Plan; planValidUntil: Date; maxStudents: number }
): Promise<SchoolDetail> {
  assertObjectId(schoolId, "school");
  await connectToDatabase();

  const studentCount = await User.countDocuments({ schoolId, role: "student" });

  // Refusing outright would be unhelpful — a school shrinking its plan may
  // legitimately have more students on the roll than the new cap allows, and
  // the enforcement already handles that by blocking *new* students rather
  // than deleting anyone. So this is allowed, and the screen says so.
  const result = await School.updateOne(
    { _id: schoolId },
    {
      $set: {
        plan: input.plan,
        planValidUntil: input.planValidUntil,
        maxStudents: input.maxStudents,
      },
    }
  );

  if (result.matchedCount === 0) throw new SetupError("No such school.", 404);

  const detail = await getSchoolDetail(schoolId);
  return { ...detail, counts: { ...detail.counts, students: studentCount } };
}

export type NewPersonInput = {
  role: Extract<Role, "teacher" | "student">;
  name: string;
  email: string;
  sectionId?: string;
  password?: string;
};

/** Adds a teacher or a student to somebody else's school. */
export async function addPerson(
  schoolId: string,
  input: NewPersonInput
): Promise<{ person: SchoolPerson; temporaryPassword: string | null }> {
  assertObjectId(schoolId, "school");
  await connectToDatabase();

  if (!(await School.exists({ _id: schoolId }))) {
    throw new SetupError("No such school.", 404);
  }

  if (input.role === "teacher") {
    const teacher = await createTeacher(schoolId, {
      name: input.name,
      email: input.email,
      password: input.password,
    });

    return {
      person: {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        role: "teacher",
        sectionId: null,
        sectionName: null,
        createdAt: new Date().toISOString(),
      },
      temporaryPassword: teacher.temporaryPassword,
    };
  }

  if (!input.sectionId) {
    throw new SetupError("Pick a class for this student.", 400, "sectionId");
  }

  const student = await createStudent(
    schoolId,
    {
      name: input.name,
      email: input.email,
      sectionId: input.sectionId,
      password: input.password,
    },
    // See the note on this option: the cap restrains schools, not the owner
    // typing in a roster on their behalf.
    { bypassPlanLimits: true }
  );

  return {
    person: {
      id: student.id,
      name: student.name,
      email: student.email,
      role: "student",
      sectionId: input.sectionId,
      sectionName: student.sectionName,
      createdAt: new Date().toISOString(),
    },
    temporaryPassword: student.temporaryPassword,
  };
}

/** Edits one person. Only the fields given are touched. */
export async function updatePerson(
  schoolId: string,
  userId: string,
  input: { name?: string; email?: string; sectionId?: string; password?: string }
): Promise<SchoolPerson> {
  assertObjectId(schoolId, "school");
  assertObjectId(userId, "person");
  await connectToDatabase();

  const user = await User.findOne({ _id: userId, schoolId }).lean();
  if (!user) throw new SetupError("No such person in this school.", 404);

  const changes: Record<string, unknown> = {};
  if (input.name !== undefined) changes.name = input.name;
  if (input.email !== undefined) changes.email = input.email.toLowerCase();
  if (input.password) changes.passwordHash = await hashPassword(input.password);

  if (input.sectionId !== undefined) {
    if (user.role !== "student") {
      throw new SetupError("Only students belong to a class.", 400, "sectionId");
    }
    const section = await Section.findOne({ _id: input.sectionId, schoolId })
      .select("_id")
      .lean();
    if (!section) {
      throw new SetupError("Pick a class that exists in this school.", 400, "sectionId");
    }
    changes.sectionId = section._id;
  }

  if (Object.keys(changes).length === 0) {
    throw new SetupError("Nothing to change.", 400);
  }

  try {
    await User.updateOne({ _id: userId, schoolId }, { $set: changes });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new SetupError(`${input.email} already has an account.`, 409, "email");
    }
    throw error;
  }

  const detail = await getSchoolDetail(schoolId);
  const person = detail.people.find((p) => p.id === userId);
  if (!person) throw new SetupError("No such person in this school.", 404);
  return person;
}

/**
 * Removes a person.
 *
 * A student's attempts go with them, because a mark belonging to no student is
 * worse than no mark. A school's last admin cannot be removed — that would
 * leave a school nobody can sign in to, which is not a state worth being able
 * to reach by clicking Delete twice.
 */
export async function removePerson(
  schoolId: string,
  userId: string
): Promise<{ id: string; removedAttempts: number }> {
  assertObjectId(schoolId, "school");
  assertObjectId(userId, "person");
  await connectToDatabase();

  const user = await User.findOne({ _id: userId, schoolId }).select("role").lean();
  if (!user) throw new SetupError("No such person in this school.", 404);

  if (user.role === "admin") {
    const admins = await User.countDocuments({ schoolId, role: "admin" });
    if (admins <= 1) {
      throw new SetupError(
        "That's the school's only admin. Add another one first, or nobody will be able to sign in.",
        409
      );
    }
  }

  const removedAttempts =
    user.role === "student"
      ? (await Attempt.deleteMany({ schoolId, studentId: userId })).deletedCount
      : 0;

  await User.deleteOne({ _id: userId, schoolId });

  return { id: userId, removedAttempts };
}

/** A fresh password for someone who has lost theirs. */
export async function resetPassword(
  schoolId: string,
  userId: string
): Promise<{ temporaryPassword: string }> {
  assertObjectId(schoolId, "school");
  assertObjectId(userId, "person");
  await connectToDatabase();

  const temporaryPassword = generateTempPassword();
  const result = await User.updateOne(
    { _id: userId, schoolId },
    { $set: { passwordHash: await hashPassword(temporaryPassword) } }
  );

  if (result.matchedCount === 0) {
    throw new SetupError("No such person in this school.", 404);
  }

  return { temporaryPassword };
}
