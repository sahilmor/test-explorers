/**
 * Dummy data, for clicking through the app without setting a school up by hand.
 *
 * Everything here goes through the real `lib/` functions — the same ones the
 * API routes call — rather than writing documents directly. That costs a
 * little speed and buys a lot: passwords are hashed the way logins expect,
 * attempts are graded by the grading path, plan rules are the plan rules. Seed
 * data that was assembled by hand has a habit of being subtly unlike the real
 * thing, and then you debug the seed instead of the app.
 *
 *   npm run seed           # create anything missing, leave the rest alone
 *   npm run seed -- --reset  # delete the seeded schools first, then recreate
 *
 * Safe to re-run: schools are matched by slug, and one that already exists is
 * skipped rather than duplicated.
 */

// Before any app module loads. The seed invents email addresses that belong to
// nobody, and a seed run has no business posting them to a mail provider —
// notifications fire on publishing a test.
process.env.RESEND_API_KEY = "";

import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { createSchoolWithAdmin } from "@/lib/accounts";
import {
  createSection,
  createStudent,
  createSubject,
  createTeacher,
} from "@/lib/school-setup";
import { importQuestionsFromCsv } from "@/lib/question-bank";
import { createTest } from "@/lib/tests";
import { saveResponses, startOrResumeAttempt, submitAttempt } from "@/lib/attempts";
import { ANNUAL_PLAN, TRIAL_MAX_STUDENTS } from "@/lib/plans";
import { slugifySchoolName } from "@/models/School";
import School from "@/models/School";
import Question from "@/models/Question";
import Section from "@/models/Section";
import Subject from "@/models/Subject";
import Test from "@/models/Test";
import TestAssignment from "@/models/TestAssignment";
import Attempt from "@/models/Attempt";
import Notification from "@/models/Notification";
import User from "@/models/User";

const DAY = 24 * 60 * 60 * 1000;

/** Everything the seed makes uses this domain, so it is easy to spot and drop. */
const DOMAIN = "seed.test";
const PASSWORD = "seed-password-123";

type PlanSpec = {
  plan: "trial" | "active" | "expired";
  /** Days from now. Negative means it has already passed. */
  validInDays: number;
  maxStudents: number;
};

/** A spread of plan states, so enforcement has something to bite on. */
function planFor(index: number): PlanSpec {
  const cycle = index % 5;

  if (cycle === 0) return { plan: "active", validInDays: 280, maxStudents: ANNUAL_PLAN.maxStudents };
  if (cycle === 1) return { plan: "trial", validInDays: 21, maxStudents: TRIAL_MAX_STUDENTS };
  if (cycle === 2) return { plan: "expired", validInDays: -12, maxStudents: TRIAL_MAX_STUDENTS };
  // A trial with days left, close enough to nudge on the dashboard.
  if (cycle === 3) return { plan: "trial", validInDays: 4, maxStudents: TRIAL_MAX_STUDENTS };
  // A paid plan about to lapse.
  return { plan: "active", validInDays: 9, maxStudents: ANNUAL_PLAN.maxStudents };
}

const SCHOOL_NAMES = [
  "Riverbend High", "Northgate Academy", "St Aloysius School", "Greenwood Public School",
  "Kendriya Vidyalaya Sector 8", "Silver Oak International", "Hillview Convent",
  "Maple Grove School", "Sunrise Vidya Mandir", "Brookfield High",
  "Cambridge Public School", "Delhi Model School", "Everest International",
  "Fatima Girls' High School", "Gyan Bharti Vidyalaya", "Holy Cross Convent",
  "Indus Valley School", "Jubilee Hills Public School", "Kalpana Chawla Memorial",
  "Lotus Valley International", "Mount Carmel School", "Nalanda Vidyapeeth",
  "Oakridge Academy", "Presidency School", "Queen Mary's Convent",
  "Rani Laxmibai Vidyalaya", "Sacred Heart High", "Tagore International",
  "Udaan Public School", "Vidya Niketan", "Westfield Academy",
  "Xavier's Higher Secondary", "Yashoda Vidya Mandir", "Zenith International",
];

/** The first few get teachers, students, a paper and a set of marks. */
const POPULATED_COUNT = 4;

const TEACHER_NAMES = [
  ["Dana Mehta", "Rahul Nair", "Priya Raman"],
  ["Ayesha Siddiqui", "Vikram Bose"],
  ["Joseph Thomas", "Meera Pillai", "Sanjay Gupta"],
  ["Farah Khan", "Arjun Desai"],
];

const STUDENT_NAMES = [
  "Aisha Khan", "Ben Okoro", "Chen Wei", "Dara Singh", "Elena Petrova",
  "Farhan Ali", "Grace Mensah", "Hiro Tanaka", "Isabel Cruz", "Jamal Haddad",
  "Kavya Iyer", "Liam O'Brien",
];

const QUESTION_BANK: [string, string, string, string, string, string][] = [
  ["What is the SI unit of force?", "Newton", "Joule", "Watt", "Pascal", "A"],
  ["What does an ammeter measure?", "Voltage", "Current", "Resistance", "Power", "B"],
  ["Acceleration due to gravity on Earth is about", "1.6 m/s2", "9.8 m/s2", "19.6 m/s2", "3.7 m/s2", "B"],
  ["Sound travels fastest in", "Vacuum", "Air", "Water", "Steel", "D"],
  ["Power is measured in", "Newtons", "Joules", "Watts", "Pascals", "C"],
  ["The unit of electrical resistance is the", "Ohm", "Volt", "Ampere", "Farad", "A"],
  ["Which of these is a vector quantity?", "Speed", "Mass", "Velocity", "Temperature", "C"],
  ["Which quantity is conserved in an elastic collision?", "Only momentum", "Only kinetic energy", "Both", "Neither", "C"],
];

function emailFor(name: string, schoolIndex: number): string {
  const local = name.toLowerCase().replace(/[^a-z]/g, "");
  return `${local}${schoolIndex}@${DOMAIN}`;
}

function questionCsv(): string {
  return (
    ["subject,question,optionA,optionB,optionC,optionD,correct,difficulty"]
      .concat(
        QUESTION_BANK.map(
          (row, i) => `Physics,${row.join(",")},${["easy", "medium", "hard"][i % 3]}`
        )
      )
      .join("\n") + "\n"
  );
}

/** Applies a plan directly. There is no checkout to go through any more. */
async function setPlan(schoolId: string, spec: PlanSpec) {
  await School.updateOne(
    { _id: schoolId },
    {
      $set: {
        plan: spec.plan,
        planValidUntil: new Date(Date.now() + spec.validInDays * DAY),
        maxStudents: spec.maxStudents,
      },
    }
  );
}

async function dropSeeded() {
  const slugs = SCHOOL_NAMES.map((n) => slugifySchoolName(n));
  const schools = await School.find({ slug: { $in: slugs } }).select("_id").lean();
  const ids = schools.map((s) => s._id);

  if (ids.length === 0) {
    console.log("  nothing seeded to remove");
    return;
  }

  const filter = { schoolId: { $in: ids } };
  const removed = await Promise.all([
    User.deleteMany(filter),
    Section.deleteMany(filter),
    Subject.deleteMany(filter),
    Question.deleteMany(filter),
    Test.deleteMany(filter),
    TestAssignment.deleteMany(filter),
    Attempt.deleteMany(filter),
    Notification.deleteMany(filter),
  ]);

  await School.deleteMany({ _id: { $in: ids } });

  console.log(
    `  removed ${ids.length} school(s) and ${removed.reduce((n, r) => n + r.deletedCount, 0)} related document(s)`
  );
}

/** Fills one school with staff, a roll, a question bank, a paper and marks. */
async function populate(schoolId: string, index: number, summary: Summary) {
  const sectionId = (await createSection(schoolId, { name: "Grade 9 - A", grade: 9 })).id;
  await createSection(schoolId, { name: "Grade 9 - B", grade: 9 });
  const subjectId = (await createSubject(schoolId, { name: "Physics" })).id;
  await createSubject(schoolId, { name: "Mathematics" });

  // The first teacher owns the question bank and the papers, the way a real
  // one would — nothing here should be attributed to a student.
  let authorId = "";

  for (const name of TEACHER_NAMES[index % TEACHER_NAMES.length]) {
    const teacher = await createTeacher(schoolId, {
      name,
      email: emailFor(name, index),
      password: PASSWORD,
      subjectIds: [subjectId],
      sectionIds: [sectionId],
    });
    authorId ||= teacher.id;
    summary.teachers++;
  }

  // Three of the four get a full roll; one is left small so the student cap
  // has somewhere obvious to be tested.
  const roll = index === 3 ? STUDENT_NAMES.slice(0, 4) : STUDENT_NAMES;
  const studentIds: string[] = [];

  for (const name of roll) {
    const student = await createStudent(schoolId, {
      name,
      email: emailFor(name, index),
      sectionId,
      password: PASSWORD,
    });
    studentIds.push(student.id);
    summary.students++;
  }

  const imported = await importQuestionsFromCsv(schoolId, authorId, questionCsv());
  summary.questions += imported.created;

  const questions = await Question.find({ schoolId, subjectId })
    .select("_id correctOptionIndex")
    .lean();
  const questionIds = questions.map((q) => String(q._id));
  const key = new Map(questions.map((q) => [String(q._id), q.correctOptionIndex]));

  // One paper that has closed, so results and the leaderboard have something
  // in them the moment you open the app.
  const closed = await createTest(schoolId, authorId, {
    title: "Unit 3 — Forces and Motion",
    subjectId,
    durationMinutes: 30,
    questionIds: questionIds.slice(0, 6),
    opensAt: new Date(Date.now() - 3 * DAY),
    closesAt: new Date(Date.now() + DAY),
    sectionIds: [sectionId],
    publish: true,
  });
  summary.tests++;

  // …and one that is open now, so the test-taking screen is one click away.
  await createTest(schoolId, authorId, {
    title: "Unit 4 — Electricity",
    subjectId,
    durationMinutes: 25,
    questionIds: questionIds.slice(1, 6),
    opensAt: new Date(Date.now() - 60 * 60 * 1000),
    closesAt: new Date(Date.now() + 7 * DAY),
    sectionIds: [sectionId],
    publish: true,
  });
  summary.tests++;

  // Most of the roll sits the first paper, with a spread of marks. Submitted
  // through the real attempt path, so they are graded the way a real one is.
  const sitters = studentIds.slice(0, Math.max(3, Math.floor(studentIds.length * 0.75)));

  for (const [i, studentId] of sitters.entries()) {
    const state = await startOrResumeAttempt(schoolId, studentId, closed.id);
    const correct = Math.max(1, 6 - (i % 5));

    await saveResponses(
      schoolId,
      studentId,
      closed.id,
      state.test.questions.map((q, qi) => ({
        questionId: q.id,
        selectedOptionIndex:
          qi < correct ? (key.get(q.id) ?? 0) : ((key.get(q.id) ?? 0) + 1) % 4,
        markedForReview: false,
      }))
    );

    await submitAttempt(schoolId, studentId, closed.id);
    summary.attempts++;
  }

  // Closed now that everyone has sat it, so results are actually visible.
  await Test.updateOne(
    { _id: closed.id, schoolId },
    { $set: { closesAt: new Date(Date.now() - 60 * 60 * 1000) } }
  );
}

type Summary = {
  schools: number;
  skipped: number;
  admins: number;
  teachers: number;
  students: number;
  questions: number;
  tests: number;
  attempts: number;
};

async function main() {
  const reset = process.argv.includes("--reset");

  await connectToDatabase();
  const dbName = mongoose.connection.db?.databaseName;
  console.log(`\nSeeding "${dbName}"\n`);

  if (reset) {
    console.log("--reset given, removing previously seeded schools:");
    await dropSeeded();
    console.log("");
  }

  const summary: Summary = {
    schools: 0, skipped: 0, admins: 0, teachers: 0,
    students: 0, questions: 0, tests: 0, attempts: 0,
  };

  for (const [index, name] of SCHOOL_NAMES.entries()) {
    const slug = slugifySchoolName(name);

    // Idempotent: a school that is already here is left exactly as it is.
    if (await School.exists({ slug })) {
      summary.skipped++;
      continue;
    }

    const created = await createSchoolWithAdmin({
      schoolName: name,
      name: `${name.split(" ")[0]} Admin`,
      email: `admin${index}@${DOMAIN}`,
      password: PASSWORD,
    });

    summary.schools++;
    summary.admins++;

    const populated = index < POPULATED_COUNT;

    // Populate first, then set the plan — a school seeded as expired could
    // not be given a paper afterwards, which is the enforcement working.
    if (populated) {
      await populate(created.schoolId, index, summary);
    }

    await setPlan(created.schoolId, planFor(index));

    process.stdout.write(
      `  ${String(index + 1).padStart(2)}/${SCHOOL_NAMES.length}  ${name}${populated ? "  (populated)" : ""}\n`
    );
  }

  console.log("\n─────────────────────────────────────────────");
  console.log("  Created");
  console.log(`    schools        ${summary.schools}`);
  console.log(`    school admins  ${summary.admins}`);
  console.log(`    teachers       ${summary.teachers}`);
  console.log(`    students       ${summary.students}`);
  console.log(`    questions      ${summary.questions}`);
  console.log(`    tests          ${summary.tests}`);
  console.log(`    attempts       ${summary.attempts}`);
  if (summary.skipped > 0) {
    console.log(`    skipped        ${summary.skipped} school(s) already present`);
  }

  const counts = await School.aggregate<{ _id: string; n: number }>([
    { $group: { _id: "$plan", n: { $sum: 1 } } },
  ]);
  console.log("\n  Plans now in the database");
  for (const row of counts.sort((a, b) => a._id.localeCompare(b._id))) {
    console.log(`    ${row._id.padEnd(14)} ${row.n}`);
  }

  console.log("\n  Signing in");
  console.log(`    every account's password is  ${PASSWORD}`);
  console.log(`    a school admin               admin0@${DOMAIN}`);
  console.log(`    a teacher                    ${emailFor(TEACHER_NAMES[0][0], 0)}`);
  console.log(`    a student                    ${emailFor(STUDENT_NAMES[0], 0)}`);
  console.log("─────────────────────────────────────────────\n");

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("\nSeed failed:", error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
