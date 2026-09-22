import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId } from "mongodb";
import { Client, startHarness, TEST_CRON_SECRET, type Harness } from "./harness";

/**
 * Grading and results.
 *
 * The claims this file proves, worst-consequence first:
 *
 *  1. A mark is computed and stored on every path that ends an attempt —
 *     manual submit, the deadline check, and the sweep. "Submitted but never
 *     graded" must be unreachable.
 *  2. Nobody sees a mark or an answer key until the test has closed for
 *     everyone. A fast finisher reading the key mid-sitting would be handing
 *     out the answers.
 *  3. Re-grading is idempotent — running it twice cannot double a score.
 *  4. The arithmetic is right, including the cases that are easy to get wrong:
 *     blank answers, questions never opened, and a cleared answer.
 */

let harness: Harness;
let mongo: MongoClient;

let teacher: Client;
let admin: Client;
let otherSchool: Client;

let physicsId = "";
let sectionAId = "";
let sectionBId = "";
let questionIds: string[] = [];
/** The correct option for each question, in questionIds order. */
let answerKey: number[] = [];

function db() {
  return mongo.db("sotm_test");
}

async function attemptInDb(testId: string, studentId?: string) {
  const filter: Record<string, unknown> = { testId: new ObjectId(testId) };
  if (studentId) filter.studentId = new ObjectId(studentId);
  return db().collection("attempts").findOne(filter);
}

/** Drags an attempt's start time backwards so its deadline is in the past. */
async function expireAttempt(testId: string, studentId?: string) {
  const filter: Record<string, unknown> = { testId: new ObjectId(testId) };
  if (studentId) filter.studentId = new ObjectId(studentId);
  await db()
    .collection("attempts")
    .updateMany(filter, { $set: { startedAt: new Date(Date.now() - 3_600_000) } });
}

/** Moves a test's window into the past so results become visible. */
async function closeTest(testId: string) {
  await db()
    .collection("tests")
    .updateOne(
      { _id: new ObjectId(testId) },
      { $set: { closesAt: new Date(Date.now() - 1_000) } }
    );
}

async function makeTest(
  title: string,
  opts: { questionCount?: number; durationMinutes?: number; closesInSec?: number; sections?: string[] } = {}
) {
  const res = await teacher.post("/api/tests", {
    title,
    subjectId: physicsId,
    durationMinutes: opts.durationMinutes ?? 60,
    questionIds: questionIds.slice(0, opts.questionCount ?? 5),
    opensAt: new Date(Date.now() - 60_000).toISOString(),
    closesAt: new Date(Date.now() + (opts.closesInSec ?? 7200) * 1000).toISOString(),
    sectionIds: opts.sections ?? [sectionAId],
    publish: true,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.test.id as string;
}

/** Creates a student, logs them in, returns the client and their id. */
async function makeStudent(name: string, email: string, sectionId = sectionAId) {
  const created = await admin.post("/api/students", {
    name,
    email,
    password: "student password",
    sectionId,
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);

  const client = new Client(harness.baseUrl);
  await client.post("/api/auth/login", { email, password: "student password" });

  return { client, id: created.body.student.id as string };
}

/**
 * Sits a paper: starts it, answers `correct` questions right and `wrong`
 * questions wrong, leaves the rest blank, then submits.
 */
async function sit(
  client: Client,
  testId: string,
  opts: { correct: number; wrong?: number; submit?: boolean } = { correct: 0 }
) {
  const start = await client.post("/api/attempts/start", { testId });
  expect(start.status, JSON.stringify(start.body)).toBe(200);

  const paper: { id: string }[] = start.body.test.questions;
  const responses: unknown[] = [];

  paper.forEach((q, i) => {
    const key = answerKey[questionIds.indexOf(q.id)];
    if (i < opts.correct) {
      responses.push({ questionId: q.id, selectedOptionIndex: key, markedForReview: false });
    } else if (i < opts.correct + (opts.wrong ?? 0)) {
      responses.push({
        questionId: q.id,
        // Any option that is not the right one.
        selectedOptionIndex: (key + 1) % 4,
        markedForReview: false,
      });
    }
  });

  if (responses.length > 0) {
    const saved = await client.patch(`/api/attempts/${testId}/responses`, { responses });
    expect(saved.status).toBe(200);
  }

  if (opts.submit !== false) {
    const submitted = await client.post(`/api/attempts/${testId}/submit`);
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
  }
}

beforeAll(async () => {
  harness = await startHarness();
  mongo = await new MongoClient(harness.mongoUri).connect();

  admin = new Client(harness.baseUrl);
  const signup = await admin.post("/api/auth/signup", {
    schoolName: "Riverbend High",
    name: "Priya Raman",
    email: "priya@riverbend.test",
    password: "riverbend admin pw",
  });
  expect(signup.status, JSON.stringify(signup.body)).toBe(201);

  physicsId = (await admin.post("/api/subjects", { name: "Physics" })).body.subject.id;
  sectionAId = (await admin.post("/api/sections", { name: "Grade 9 - A", grade: 9 }))
    .body.section.id;
  sectionBId = (await admin.post("/api/sections", { name: "Grade 9 - B", grade: 9 }))
    .body.section.id;

  await admin.post("/api/teachers", {
    name: "Dana Mehta",
    email: "dana@riverbend.test",
    password: "teacher password",
    subjectIds: [physicsId],
  });
  teacher = new Client(harness.baseUrl);
  await teacher.post("/api/auth/login", {
    email: "dana@riverbend.test",
    password: "teacher password",
  });

  const letters = ["A", "B", "C", "D"];
  const rows = ["subject,question,optionA,optionB,optionC,optionD,correct,difficulty"];
  for (let i = 1; i <= 10; i++) {
    rows.push(
      `Physics,Physics question ${i}?,Newton ${i},Joule ${i},Watt ${i},Pascal ${i},${letters[i % 4]},easy`
    );
  }
  expect((await teacher.post("/api/questions/bulk", { csv: rows.join("\n") + "\n" })).body.created).toBe(10);

  const bank = await teacher.get(`/api/questions?subjectId=${physicsId}&pageSize=100`);
  questionIds = bank.body.questions.map((q: { id: string }) => q.id);
  answerKey = bank.body.questions.map(
    (q: { correctOptionIndex: number }) => q.correctOptionIndex
  );

  // A second school, to aim cross-tenant attempts at.
  otherSchool = new Client(harness.baseUrl);
  await otherSchool.post("/api/auth/signup", {
    schoolName: "Northgate Academy",
    name: "Bruno Adams",
    email: "bruno@northgate.test",
    password: "northgate admin pw",
  });
}, 180_000);

afterAll(async () => {
  await mongo?.close();
  await harness?.stop();
});

describe("grading happens on every path that ends an attempt", () => {
  it("grades on a manual submit", async () => {
    const testId = await makeTest("Manual submit grading");
    const { client } = await makeStudent("Grade One", "g1@riverbend.test");

    await sit(client, testId, { correct: 3, wrong: 1 });

    const row = await attemptInDb(testId);
    expect(row!.status).toBe("submitted");
    expect(row!.score).toBe(3);
    expect(row!.correctCount).toBe(3);
    expect(row!.incorrectCount).toBe(1);
    expect(row!.unansweredCount).toBe(1);
    expect(row!.totalQuestions).toBe(5);
    expect(row!.gradedAt).toBeInstanceOf(Date);
  });

  it("grades when the deadline check closes an attempt", async () => {
    const testId = await makeTest("Deadline grading", { durationMinutes: 1 });
    const { client } = await makeStudent("Grade Two", "g2@riverbend.test");

    await sit(client, testId, { correct: 2, wrong: 2, submit: false });
    await expireAttempt(testId);

    // Simply reading the attempt closes it out — and must mark it.
    const read = await client.get(`/api/attempts/${testId}`);
    expect(read.body.attempt.status).toBe("auto_submitted");

    const row = await attemptInDb(testId);
    expect(row!.status).toBe("auto_submitted");
    expect(row!.score).toBe(2);
    expect(row!.incorrectCount).toBe(2);
    expect(row!.unansweredCount).toBe(1);
  });

  it("grades in the sweep, with no browser involved", async () => {
    const testId = await makeTest("Sweep grading", { durationMinutes: 1 });
    const { client } = await makeStudent("Grade Three", "g3@riverbend.test");

    await sit(client, testId, { correct: 4, submit: false });
    await expireAttempt(testId);

    // Still unmarked and still running.
    const before = await attemptInDb(testId);
    expect(before!.status).toBe("in_progress");
    expect(before!.score).toBeNull();

    const cron = new Client(harness.baseUrl);
    const sweep = await cron.request("/api/cron/sweep-attempts", {
      method: "GET",
      headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
    });
    expect(sweep.status).toBe(200);

    const after = await attemptInDb(testId);
    expect(after!.status).toBe("auto_submitted");
    expect(after!.score).toBe(4);
    expect(after!.unansweredCount).toBe(1);
  });

  it("never leaves a submitted attempt ungraded", async () => {
    // Whatever route got it there, a finished attempt has a mark.
    const finished = await db()
      .collection("attempts")
      .find({ status: { $ne: "in_progress" } })
      .toArray();

    expect(finished.length).toBeGreaterThan(0);
    for (const attempt of finished) {
      expect(attempt.score, `attempt ${attempt._id}`).not.toBeNull();
      expect(attempt.totalQuestions, `attempt ${attempt._id}`).not.toBeNull();
      expect(attempt.gradedAt, `attempt ${attempt._id}`).toBeTruthy();
    }
  });
});

describe("the arithmetic", () => {
  it("counts a question never opened as unanswered, not wrong", async () => {
    const testId = await makeTest("Never opened", { questionCount: 5 });
    const { client } = await makeStudent("Arith One", "a1@riverbend.test");

    // Answers two, never touches the other three.
    await sit(client, testId, { correct: 2 });

    const row = await attemptInDb(testId);
    expect(row!.correctCount).toBe(2);
    expect(row!.incorrectCount).toBe(0);
    expect(row!.unansweredCount).toBe(3);
    expect(row!.correctCount + row!.incorrectCount + row!.unansweredCount).toBe(5);
  });

  it("counts a cleared answer as unanswered", async () => {
    const testId = await makeTest("Cleared answer");
    const { client } = await makeStudent("Arith Two", "a2@riverbend.test");

    const start = await client.post("/api/attempts/start", { testId });
    const first = start.body.test.questions[0].id;
    const key = answerKey[questionIds.indexOf(first)];

    // Answers it correctly, then changes their mind and clears it.
    await client.patch(`/api/attempts/${testId}/responses`, {
      responses: [{ questionId: first, selectedOptionIndex: key, markedForReview: false }],
    });
    await client.patch(`/api/attempts/${testId}/responses`, {
      responses: [{ questionId: first, selectedOptionIndex: null, markedForReview: true }],
    });
    await client.post(`/api/attempts/${testId}/submit`);

    const row = await attemptInDb(testId);
    expect(row!.score).toBe(0);
    expect(row!.unansweredCount).toBe(5);
  });

  it("gives full marks for a perfect paper", async () => {
    const testId = await makeTest("Perfect", { questionCount: 5 });
    const { client } = await makeStudent("Arith Three", "a3@riverbend.test");

    await sit(client, testId, { correct: 5 });

    const row = await attemptInDb(testId);
    expect(row!.score).toBe(5);
    expect(row!.incorrectCount).toBe(0);
    expect(row!.unansweredCount).toBe(0);
  });

  it("gives zero for a paper where everything is wrong", async () => {
    const testId = await makeTest("All wrong", { questionCount: 5 });
    const { client } = await makeStudent("Arith Four", "a4@riverbend.test");

    await sit(client, testId, { correct: 0, wrong: 5 });

    const row = await attemptInDb(testId);
    expect(row!.score).toBe(0);
    expect(row!.incorrectCount).toBe(5);
    expect(row!.unansweredCount).toBe(0);
  });
});

describe("re-grading is idempotent", () => {
  it("running the sweep repeatedly cannot change a stored score", async () => {
    const testId = await makeTest("Idempotent grading", { durationMinutes: 1 });
    const { client } = await makeStudent("Idem One", "i1@riverbend.test");

    await sit(client, testId, { correct: 3, wrong: 1, submit: false });
    await expireAttempt(testId);

    const cron = new Client(harness.baseUrl);
    const sweepOnce = () =>
      cron.request("/api/cron/sweep-attempts", {
        method: "GET",
        headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
      });

    await sweepOnce();
    const first = await attemptInDb(testId);

    await sweepOnce();
    await sweepOnce();
    const third = await attemptInDb(testId);

    expect(third!.score).toBe(first!.score);
    expect(third!.correctCount).toBe(first!.correctCount);
    expect(third!.incorrectCount).toBe(first!.incorrectCount);
    expect(third!.unansweredCount).toBe(first!.unansweredCount);
    expect(third!.submittedAt).toEqual(first!.submittedAt);
  });

  it("reading an attempt many times does not accumulate anything", async () => {
    const testId = await makeTest("Repeated reads");
    const { client } = await makeStudent("Idem Two", "i2@riverbend.test");

    await sit(client, testId, { correct: 2, wrong: 1 });
    const before = await attemptInDb(testId);

    for (let i = 0; i < 5; i++) await client.get(`/api/attempts/${testId}`);

    const after = await attemptInDb(testId);
    expect(after!.score).toBe(before!.score);
    expect(after!.correctCount).toBe(2);
    expect(after!.incorrectCount).toBe(1);
  });
});

describe("results stay hidden until the window closes", () => {
  it("refuses a student's own result while the test is still open", async () => {
    const testId = await makeTest("Still open");
    const { client } = await makeStudent("Hidden One", "h1@riverbend.test");

    await sit(client, testId, { correct: 4 });

    // Submitted and marked…
    const row = await attemptInDb(testId);
    expect(row!.score).toBe(4);

    // …but not readable, because classmates may still be sitting.
    const res = await client.get(`/api/attempts/${testId}/result`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/closes for everyone/i);
  });

  it("does not leak the answer key in the refusal", async () => {
    const testId = await makeTest("No leak");
    const { client } = await makeStudent("Hidden Two", "h2@riverbend.test");

    await sit(client, testId, { correct: 2 });
    const res = await client.get(`/api/attempts/${testId}/result`);

    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("correctOptionIndex");
    expect(raw).not.toContain("score");
  });

  it("shows the result once the window has closed", async () => {
    const testId = await makeTest("Now closed");
    const { client } = await makeStudent("Hidden Three", "h3@riverbend.test");

    await sit(client, testId, { correct: 3, wrong: 1 });
    await closeTest(testId);

    const res = await client.get(`/api/attempts/${testId}/result`);
    expect(res.status).toBe(200);
    expect(res.body.score).toBe(3);
    expect(res.body.totalQuestions).toBe(5);
    expect(res.body.percentage).toBe(60);
    expect(res.body.questions).toHaveLength(5);
    // The key is available now, and only now.
    expect(res.body.questions[0]).toHaveProperty("correctOptionIndex");
  });

  it("marks each question right, wrong or blank", async () => {
    const testId = await makeTest("Outcomes");
    const { client } = await makeStudent("Hidden Four", "h4@riverbend.test");

    await sit(client, testId, { correct: 2, wrong: 2 });
    await closeTest(testId);

    const res = await client.get(`/api/attempts/${testId}/result`);
    const outcomes = res.body.questions.map((q: { outcome: string }) => q.outcome);

    expect(outcomes.filter((o: string) => o === "correct")).toHaveLength(2);
    expect(outcomes.filter((o: string) => o === "incorrect")).toHaveLength(2);
    expect(outcomes.filter((o: string) => o === "unanswered")).toHaveLength(1);
  });

  it("the student page shows an explanation rather than an error", async () => {
    const testId = await makeTest("Page not yet");
    const { client } = await makeStudent("Hidden Five", "h5@riverbend.test");

    await sit(client, testId, { correct: 1 });

    const page = await client.get(`/student/tests/${testId}/result`);
    expect(page.status).toBe(200);
    expect(String(page.body)).toContain("Nothing to show yet");
    // And no answer key smuggled into the HTML.
    expect(String(page.body)).not.toContain("correctOptionIndex");
  });

  it("tells a student who never sat the paper, without erroring", async () => {
    const testId = await makeTest("Never sat");
    const { client } = await makeStudent("Hidden Six", "h6@riverbend.test");
    await closeTest(testId);

    const res = await client.get(`/api/attempts/${testId}/result`);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/didn't sit this test/i);

    const page = await client.get(`/student/tests/${testId}/result`);
    expect(page.status).toBe(200);
    expect(String(page.body)).toContain("Nothing to show yet");
  });
});

describe("ranking", () => {
  it("ranks within the section, with ties sharing a place", async () => {
    const testId = await makeTest("Ranking", { questionCount: 5 });

    const top = await makeStudent("Rank Top", "r1@riverbend.test");
    const midA = await makeStudent("Rank MidA", "r2@riverbend.test");
    const midB = await makeStudent("Rank MidB", "r3@riverbend.test");
    const low = await makeStudent("Rank Low", "r4@riverbend.test");

    await sit(top.client, testId, { correct: 5 });
    await sit(midA.client, testId, { correct: 3 });
    await sit(midB.client, testId, { correct: 3 });
    await sit(low.client, testId, { correct: 1 });

    await closeTest(testId);

    const results = await Promise.all([
      top.client.get(`/api/attempts/${testId}/result`),
      midA.client.get(`/api/attempts/${testId}/result`),
      midB.client.get(`/api/attempts/${testId}/result`),
      low.client.get(`/api/attempts/${testId}/result`),
    ]);

    // Competition ranking: 1, 2, 2, 4.
    expect(results[0].body.rank).toBe(1);
    expect(results[1].body.rank).toBe(2);
    expect(results[2].body.rank).toBe(2);
    expect(results[3].body.rank).toBe(4);

    for (const r of results) expect(r.body.cohortSize).toBe(4);
  });

  it("does not rank a student against another section", async () => {
    const testId = await makeTest("Two sections", {
      questionCount: 5,
      sections: [sectionAId, sectionBId],
    });

    const inA = await makeStudent("Cross A", "c1@riverbend.test", sectionAId);
    const inB1 = await makeStudent("Cross B1", "c2@riverbend.test", sectionBId);
    const inB2 = await makeStudent("Cross B2", "c3@riverbend.test", sectionBId);

    await sit(inA.client, testId, { correct: 1 });
    await sit(inB1.client, testId, { correct: 5 });
    await sit(inB2.client, testId, { correct: 4 });

    await closeTest(testId);

    // A is alone in their section, so they are first of one — not third of
    // three behind students they never competed with.
    const aResult = await inA.client.get(`/api/attempts/${testId}/result`);
    expect(aResult.body.rank).toBe(1);
    expect(aResult.body.cohortSize).toBe(1);

    const bResult = await inB2.client.get(`/api/attempts/${testId}/result`);
    expect(bResult.body.rank).toBe(2);
    expect(bResult.body.cohortSize).toBe(2);
  });
});

describe("the teacher's results view", () => {
  let testId = "";

  beforeAll(async () => {
    testId = await makeTest("Teacher view", { questionCount: 5 });

    // Four sit it with different profiles; one never opens it.
    const s1 = await makeStudent("Teach One", "t1@riverbend.test");
    const s2 = await makeStudent("Teach Two", "t2@riverbend.test");
    const s3 = await makeStudent("Teach Three", "t3@riverbend.test");
    const s4 = await makeStudent("Teach Four", "t4@riverbend.test");
    await makeStudent("Teach Absent", "t5@riverbend.test");

    await sit(s1.client, testId, { correct: 5 });
    await sit(s2.client, testId, { correct: 4, wrong: 1 });
    await sit(s3.client, testId, { correct: 2, wrong: 3 });
    await sit(s4.client, testId, { correct: 1, wrong: 4 });
  });

  it("summarises submissions against the whole roster", async () => {
    const res = await teacher.get(`/api/tests/${testId}/results`);

    expect(res.status).toBe(200);
    expect(res.body.summary.submitted).toBe(4);
    // Everyone in section A, which has accumulated students across this file.
    expect(res.body.summary.assigned).toBeGreaterThanOrEqual(5);
    expect(res.body.summary.notAttempted).toBe(
      res.body.summary.assigned - res.body.summary.submitted
    );
    expect(res.body.summary.highest).toBe(100);
    expect(res.body.summary.lowest).toBe(20);
  });

  it("separates 'not attempted' from a zero score", async () => {
    const res = await teacher.get(`/api/tests/${testId}/results`);

    const absent = res.body.students.find(
      (s: { name: string }) => s.name === "Teach Absent"
    );
    expect(absent.status).toBe("not_attempted");
    expect(absent.score).toBeNull();
    expect(absent.percentage).toBeNull();

    const sat = res.body.students.find((s: { name: string }) => s.name === "Teach Four");
    expect(sat.status).toBe("submitted");
    expect(sat.score).toBe(1);
  });

  it("sorts questions worst-first", async () => {
    const res = await teacher.get(`/api/tests/${testId}/results`);
    const accuracies = res.body.questions.map((q: { accuracy: number }) => q.accuracy);

    // Everyone answered Q1 right; nobody got the last one right.
    expect(accuracies).toEqual([...accuracies].sort((a, b) => a - b));
    expect(res.body.questions[0].accuracy).toBeLessThanOrEqual(
      res.body.questions[res.body.questions.length - 1].accuracy
    );
  });

  it("computes per-question accuracy over everyone who sat it", async () => {
    const res = await teacher.get(`/api/tests/${testId}/results`);

    for (const q of res.body.questions) {
      expect(q.correct + q.incorrect + q.unanswered).toBe(4);
      expect(q.accuracy).toBe(Math.round((q.correct / 4) * 100));
    }

    // Question 1 was answered correctly by all four.
    const first = res.body.questions.find((q: { position: number }) => q.position === 1);
    expect(first.accuracy).toBe(100);
  });

  it("buckets scores into a distribution that adds up", async () => {
    const res = await teacher.get(`/api/tests/${testId}/results`);
    const total = res.body.distribution.reduce(
      (sum: number, b: { count: number }) => sum + b.count,
      0
    );

    expect(total).toBe(4);
    expect(res.body.distribution).toHaveLength(10);
  });

  it("shows a clean empty state for a test nobody has sat", async () => {
    const emptyId = await makeTest("Nobody sat this");
    const res = await teacher.get(`/api/tests/${emptyId}/results`);

    expect(res.status).toBe(200);
    expect(res.body.summary.submitted).toBe(0);
    expect(res.body.summary.averagePercentage).toBeNull();
    expect(res.body.summary.highest).toBeNull();
    // Not a broken chart — an empty one.
    expect(res.body.distribution.every((b: { count: number }) => b.count === 0)).toBe(true);
    expect(res.body.students.every((s: { status: string }) => s.status === "not_attempted")).toBe(true);
  });

  it("refuses a student", async () => {
    const { client } = await makeStudent("Nosy Student", "nosy@riverbend.test");
    expect((await client.get(`/api/tests/${testId}/results`)).status).toBe(403);
  });

  it("refuses another school", async () => {
    expect((await otherSchool.get(`/api/tests/${testId}/results`)).status).toBe(404);
  });
});

describe("the leaderboard", () => {
  // Its own section, so the ranks asserted below are exact rather than
  // depending on which students earlier tests happened to leave behind.
  let boardSectionId = "";

  beforeAll(async () => {
    boardSectionId = (
      await admin.post("/api/sections", { name: "Grade 10 - Board", grade: 10 })
    ).body.section.id;
  });

  it("accumulates across more than one closed test", async () => {
    const first = await makeTest("Leaderboard one", { questionCount: 5, sections: [boardSectionId] });
    const second = await makeTest("Leaderboard two", { questionCount: 5, sections: [boardSectionId] });

    const ace = await makeStudent("Board Ace", "b1@riverbend.test", boardSectionId);
    const steady = await makeStudent("Board Steady", "b2@riverbend.test", boardSectionId);
    const oneOnly = await makeStudent("Board OneOnly", "b3@riverbend.test", boardSectionId);

    // Ace: 5/5 then 4/5 → 9/10 = 90%
    await sit(ace.client, first, { correct: 5 });
    await sit(ace.client, second, { correct: 4, wrong: 1 });

    // Steady: 3/5 then 3/5 → 6/10 = 60%
    await sit(steady.client, first, { correct: 3 });
    await sit(steady.client, second, { correct: 3 });

    // One test only: 5/5 → 100%, but from a single paper.
    await sit(oneOnly.client, first, { correct: 5 });

    await closeTest(first);
    await closeTest(second);

    const board = await ace.client.get("/api/student/leaderboard");
    expect(board.status).toBe(200);

    const byName = new Map(
      board.body.rows.map((r: { name: string }) => [r.name, r])
    );

    const aceRow = byName.get("Board Ace") as { averagePercentage: number; testsTaken: number; totalScore: number; rank: number };
    expect(aceRow.testsTaken).toBe(2);
    expect(aceRow.totalScore).toBe(9);
    expect(aceRow.averagePercentage).toBe(90);

    const steadyRow = byName.get("Board Steady") as { averagePercentage: number; testsTaken: number };
    expect(steadyRow.testsTaken).toBe(2);
    expect(steadyRow.averagePercentage).toBe(60);

    const oneRow = byName.get("Board OneOnly") as { averagePercentage: number; testsTaken: number; rank: number };
    expect(oneRow.testsTaken).toBe(1);
    expect(oneRow.averagePercentage).toBe(100);

    // Ranked by average, so the single-paper 100% leads, then 90, then 60.
    expect(oneRow.rank).toBe(1);
    expect(aceRow.rank).toBe(2);
    expect((byName.get("Board Steady") as { rank: number }).rank).toBe(3);
    expect(board.body.rows).toHaveLength(3);
  });

  it("marks the viewer's own row", async () => {
    const student = new Client(harness.baseUrl);
    await student.post("/api/auth/login", {
      email: "b2@riverbend.test",
      password: "student password",
    });

    const board = await student.get("/api/student/leaderboard");
    expect(board.body.you).toBeTruthy();
    expect(board.body.you.name).toBe("Board Steady");
    expect(board.body.rows.filter((r: { isYou: boolean }) => r.isYou)).toHaveLength(1);
  });

  it("stays inside the viewer's own section", async () => {
    const student = new Client(harness.baseUrl);
    await student.post("/api/auth/login", {
      email: "b1@riverbend.test",
      password: "student password",
    });

    const board = await student.get("/api/student/leaderboard");
    const names = board.body.rows.map((r: { name: string }) => r.name);

    // This section only. Nobody from any other section appears.
    expect(names).not.toContain("Teach One");
    expect(names).not.toContain("Cross B1");
    expect(names.every((n: string) => n.startsWith("Board"))).toBe(true);
  });

  it("counts only closed tests", async () => {
    const openTest = await makeTest("Still running", {
      questionCount: 5,
      sections: [boardSectionId],
    });

    const student = new Client(harness.baseUrl);
    await student.post("/api/auth/login", {
      email: "b2@riverbend.test",
      password: "student password",
    });

    const before = await student.get("/api/student/leaderboard");
    const beforeRow = before.body.rows.find((r: { isYou: boolean }) => r.isYou);

    // Sits an open paper perfectly — it must not move the board yet, because
    // classmates may still be mid-test.
    await sit(student, openTest, { correct: 5 });

    const during = await student.get("/api/student/leaderboard");
    const duringRow = during.body.rows.find((r: { isYou: boolean }) => r.isYou);
    expect(duringRow.testsTaken).toBe(beforeRow.testsTaken);
    expect(duringRow.averagePercentage).toBe(beforeRow.averagePercentage);

    // Once it closes, it counts.
    await closeTest(openTest);
    const after = await student.get("/api/student/leaderboard");
    const afterRow = after.body.rows.find((r: { isYou: boolean }) => r.isYou);
    expect(afterRow.testsTaken).toBe(beforeRow.testsTaken + 1);
  });

  it("refuses a teacher", async () => {
    expect((await teacher.get("/api/student/leaderboard")).status).toBe(403);
  });
});

describe("a paper that has been sat is frozen", () => {
  /*
   * Carried over from Phase 5, and it matters now: marks are computed against
   * `questionIds`, so swapping a question after someone has answered would
   * silently change what they were marked on.
   */
  it("refuses to change the questions once anyone has sat it", async () => {
    const testId = await makeTest("Frozen paper", { questionCount: 5 });
    const { client } = await makeStudent("Freeze One", "f1@riverbend.test");
    await sit(client, testId, { correct: 3 });

    const res = await teacher.patch(`/api/tests/${testId}`, {
      title: "Frozen paper",
      subjectId: physicsId,
      durationMinutes: 60,
      // A different set of questions.
      questionIds: questionIds.slice(2, 7),
      opensAt: new Date(Date.now() - 60_000).toISOString(),
      closesAt: new Date(Date.now() + 7_200_000).toISOString(),
      sectionIds: [sectionAId],
      publish: true,
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already sat this paper/i);

    // The stored mark is untouched.
    const row = await attemptInDb(testId);
    expect(row!.score).toBe(3);
    expect(row!.totalQuestions).toBe(5);
  });

  it("still allows the title, window and duration to change", async () => {
    const testId = await makeTest("Editable bits", { questionCount: 5 });
    const { client } = await makeStudent("Freeze Two", "f2@riverbend.test");
    await sit(client, testId, { correct: 2 });

    const res = await teacher.patch(`/api/tests/${testId}`, {
      title: "Renamed after sitting",
      subjectId: physicsId,
      durationMinutes: 90,
      questionIds: questionIds.slice(0, 5),
      opensAt: new Date(Date.now() - 60_000).toISOString(),
      closesAt: new Date(Date.now() + 10_000_000).toISOString(),
      sectionIds: [sectionAId],
      publish: true,
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.test.title).toBe("Renamed after sitting");
    expect(res.body.test.durationMinutes).toBe(90);
  });

  it("lets a paper nobody has sat be rebuilt freely", async () => {
    const testId = await makeTest("Untouched paper", { questionCount: 3 });

    const res = await teacher.patch(`/api/tests/${testId}`, {
      title: "Untouched paper",
      subjectId: physicsId,
      durationMinutes: 60,
      questionIds: questionIds.slice(4, 9),
      opensAt: new Date(Date.now() - 60_000).toISOString(),
      closesAt: new Date(Date.now() + 7_200_000).toISOString(),
      sectionIds: [sectionAId],
      publish: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.test.questionCount).toBe(5);
  });
});

describe("one school cannot read another's results", () => {
  it("returns 404 for another school's result", async () => {
    const testId = await makeTest("Tenant results");
    const { client } = await makeStudent("Tenant One", "tn1@riverbend.test");
    await sit(client, testId, { correct: 3 });
    await closeTest(testId);

    // Northgate's admin cannot open Riverbend's teacher results.
    expect((await otherSchool.get(`/api/tests/${testId}/results`)).status).toBe(404);
  });

  it("returns 404 when another school's student asks for the result", async () => {
    const testId = await makeTest("Tenant student");
    const { client } = await makeStudent("Tenant Two", "tn2@riverbend.test");
    await sit(client, testId, { correct: 2 });
    await closeTest(testId);

    const otherSection = await otherSchool.post("/api/sections", {
      name: "Northgate 9 - A",
      grade: 9,
    });
    const created = await otherSchool.post("/api/students", {
      name: "Northgate Student",
      email: "ns@northgate.test",
      password: "student password",
      sectionId: otherSection.body.section.id,
    });
    expect(created.status).toBe(201);

    const outsider = new Client(harness.baseUrl);
    await outsider.post("/api/auth/login", {
      email: "ns@northgate.test",
      password: "student password",
    });

    const res = await outsider.get(`/api/attempts/${testId}/result`);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain("correctOptionIndex");
  });
});
