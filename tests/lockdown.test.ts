import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId } from "mongodb";
import { Client, startHarness, type Harness } from "./harness";

/**
 * Exam integrity.
 *
 * The browser detects; the server decides. That split is the whole point, and
 * it is what these prove:
 *
 *  1. The count lives in the database, so a refresh does not hand warnings
 *     back and a crash does not lose them.
 *  2. The third violation submits the paper through the ordinary grading
 *     path, and records *why*, so a paper taken away reads differently from
 *     one that simply ran out of time.
 *  3. Bursts collapse. One press of Escape fires three browser events, and
 *     spending a student's whole allowance on it would be indefensible.
 *  4. Nobody can spend anybody else's warnings.
 */

let harness: Harness;
let mongo: MongoClient;

let admin: Client;
let teacher: Client;
let sectionId = "";
let subjectId = "";
let questionIds: string[] = [];

function db() {
  return mongo.db("sotm_test");
}

async function makeTest(title: string) {
  const res = await teacher.post("/api/tests", {
    title,
    subjectId,
    durationMinutes: 60,
    questionIds: questionIds.slice(0, 4),
    opensAt: new Date(Date.now() - 60_000).toISOString(),
    closesAt: new Date(Date.now() + 7_200_000).toISOString(),
    sectionIds: [sectionId],
    publish: true,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.test.id as string;
}

async function makeStudent(name: string, email: string) {
  const created = await admin.post("/api/students", {
    name, email, sectionId, password: "student password",
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);

  const client = new Client(harness.baseUrl);
  await client.post("/api/auth/login", { email, password: "student password" });
  return { client, id: created.body.student.id as string };
}

/** A violation far enough after the last one to count. */
async function violate(client: Client, testId: string, kind = "tab_hidden") {
  await new Promise((r) => setTimeout(r, 1600));
  return client.post(`/api/attempts/${testId}/violation`, { kind });
}

beforeAll(async () => {
  harness = await startHarness();
  mongo = new MongoClient(harness.mongoUri);
  await mongo.connect();

  admin = new Client(harness.baseUrl);
  await admin.post("/api/auth/signup", {
    schoolName: "Integrity High",
    name: "Integrity Admin",
    email: "integrity-admin@integrity.test",
    password: "a-long-enough-password",
  });

  sectionId = (await admin.post("/api/sections", { name: "Int 9", grade: 9 })).body.section.id;
  subjectId = (await admin.post("/api/subjects", { name: "Physics" })).body.subject.id;

  await admin.post("/api/teachers", {
    name: "Integrity Teacher",
    email: "integrity-teacher@integrity.test",
    password: "teacher password",
  });
  teacher = new Client(harness.baseUrl);
  await teacher.post("/api/auth/login", {
    email: "integrity-teacher@integrity.test",
    password: "teacher password",
  });

  const rows = ["subject,question,optionA,optionB,optionC,optionD,correct,difficulty"];
  for (let i = 0; i < 4; i++) rows.push(`Physics,Q${i}?,A,B,C,D,A,easy`);
  expect((await teacher.post("/api/questions/bulk", { csv: rows.join("\n") + "\n" })).body.created).toBe(4);
  questionIds = (
    await teacher.get(`/api/questions?subjectId=${subjectId}&pageSize=20`)
  ).body.questions.map((q: { id: string }) => q.id);
}, 180_000);

afterAll(async () => {
  await mongo?.close();
  await harness?.stop();
});

// ---------------------------------------------------------------------------

describe("counting violations", () => {
  it("counts them up and says how many are left", async () => {
    const testId = await makeTest("Counting paper");
    const { client } = await makeStudent("Count One", "count1@integrity.test");
    await client.post("/api/attempts/start", { testId });

    const first = await violate(client, testId, "fullscreen_exit");
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ count: 1, limit: 3, ignored: false, autoSubmitted: false });

    const second = await violate(client, testId, "tab_hidden");
    expect(second.body).toMatchObject({ count: 2, autoSubmitted: false });
  });

  it("collapses a burst into one", async () => {
    const testId = await makeTest("Burst paper");
    const { client } = await makeStudent("Burst One", "burst1@integrity.test");
    await client.post("/api/attempts/start", { testId });

    // One press of Escape: fullscreenchange, then blur, then visibilitychange,
    // all within a few hundred milliseconds.
    const a = await client.post(`/api/attempts/${testId}/violation`, { kind: "fullscreen_exit" });
    const b = await client.post(`/api/attempts/${testId}/violation`, { kind: "window_blur" });
    const c = await client.post(`/api/attempts/${testId}/violation`, { kind: "tab_hidden" });

    expect(a.body.count).toBe(1);
    expect(b.body.ignored).toBe(true);
    expect(c.body.ignored).toBe(true);
    expect(c.body.count).toBe(1);
  });

  it("survives a refresh — the count comes back with the paper", async () => {
    const testId = await makeTest("Resume paper");
    const { client } = await makeStudent("Resume One", "resume1@integrity.test");
    await client.post("/api/attempts/start", { testId });
    await violate(client, testId);

    // A refresh is a fresh start/resume call. The warning must still be spent.
    const resumed = await client.post("/api/attempts/start", { testId });
    expect(resumed.status).toBe(200);
    expect(resumed.body.attempt.violationCount).toBe(1);
    expect(resumed.body.attempt.violationLimit).toBe(3);
  });
});

// ---------------------------------------------------------------------------

describe("the third strike", () => {
  let testId = "";
  let studentId = "";
  let client: Client;

  beforeAll(async () => {
    testId = await makeTest("Third strike paper");
    const made = await makeStudent("Strike Out", "strikeout@integrity.test");
    client = made.client;
    studentId = made.id;

    const started = await client.post("/api/attempts/start", { testId });
    // Answer two of four, so the mark is something specific rather than zero.
    await client.patch(`/api/attempts/${testId}/responses`, {
      responses: started.body.test.questions.slice(0, 2).map((q: { id: string }) => ({
        questionId: q.id,
        selectedOptionIndex: 0,
        markedForReview: false,
      })),
    });
  }, 120_000);

  it("submits the paper on the third violation", async () => {
    await violate(client, testId);
    await violate(client, testId);
    const third = await violate(client, testId);

    expect(third.body).toMatchObject({ count: 3, autoSubmitted: true });
  });

  it("grades it through the ordinary path, keeping the answers given", async () => {
    const attempt = await db().collection("attempts").findOne({
      testId: new ObjectId(testId),
      studentId: new ObjectId(studentId),
    });

    expect(attempt!.status).toBe("auto_submitted");
    expect(attempt!.gradedAt).toBeInstanceOf(Date);
    // Two answered right out of four — nothing was thrown away.
    expect(attempt!.score).toBe(2);
    expect(attempt!.totalQuestions).toBe(4);
  });

  it("records why, so it reads differently from running out of time", async () => {
    const attempt = await db().collection("attempts").findOne({
      testId: new ObjectId(testId),
      studentId: new ObjectId(studentId),
    });

    expect(attempt!.autoSubmitReason).toBe("integrity");
    expect(attempt!.violations).toHaveLength(3);
  });

  it("shows up flagged in the teacher's table", async () => {
    await db().collection("tests").updateOne(
      { _id: new ObjectId(testId) },
      { $set: { closesAt: new Date(Date.now() - 1000) } }
    );

    const res = await teacher.get(`/api/tests/${testId}/results`);
    const row = res.body.students.find((s: { studentId: string }) => s.studentId === studentId);

    expect(row.autoSubmitReason).toBe("integrity");
    expect(row.violationCount).toBe(3);
  });

  it("stops counting once the paper is gone", async () => {
    const after = await violate(client, testId);

    expect(after.body.ignored).toBe(true);
    expect(after.body.count).toBe(3);

    const attempt = await db().collection("attempts").findOne({
      testId: new ObjectId(testId),
      studentId: new ObjectId(studentId),
    });
    expect(attempt!.violations).toHaveLength(3);
  });

  it("an ordinary auto-submit is not flagged as a violation", async () => {
    const cleanTest = await makeTest("Ran out of time");
    const { client: honest, id } = await makeStudent("Slow Worker", "slow@integrity.test");
    await honest.post("/api/attempts/start", { testId: cleanTest });

    // Drag the start backwards so the deadline has passed, then touch it.
    await db().collection("attempts").updateOne(
      { testId: new ObjectId(cleanTest) },
      { $set: { startedAt: new Date(Date.now() - 7_200_000) } }
    );
    await honest.get(`/api/attempts/${cleanTest}`);

    const attempt = await db().collection("attempts").findOne({
      testId: new ObjectId(cleanTest),
      studentId: new ObjectId(id),
    });

    expect(attempt!.status).toBe("auto_submitted");
    expect(attempt!.autoSubmitReason).not.toBe("integrity");
  });
});

// ---------------------------------------------------------------------------

describe("nobody spends anybody else's warnings", () => {
  it("refuses a student who never started the paper", async () => {
    const testId = await makeTest("Not mine");
    const { client } = await makeStudent("Never Started", "neverstarted@integrity.test");

    const res = await client.post(`/api/attempts/${testId}/violation`, { kind: "tab_hidden" });
    expect(res.status).toBe(404);
  });

  it("is not reachable by a teacher", async () => {
    const testId = await makeTest("Teacher tries");
    const res = await teacher.post(`/api/attempts/${testId}/violation`, { kind: "tab_hidden" });
    expect(res.status).toBe(403);
  });

  it("refuses an unknown kind rather than recording a blank one", async () => {
    const testId = await makeTest("Bad kind");
    const { client } = await makeStudent("Bad Kind", "badkind@integrity.test");
    await client.post("/api/attempts/start", { testId });

    const res = await client.post(`/api/attempts/${testId}/violation`, { kind: "made_up" });
    expect(res.status).toBe(400);
  });

  it("only ever touches the caller's own attempt", async () => {
    const testId = await makeTest("Two students");
    const mine = await makeStudent("Mine", "mine@integrity.test");
    const theirs = await makeStudent("Theirs", "theirs@integrity.test");

    await mine.client.post("/api/attempts/start", { testId });
    await theirs.client.post("/api/attempts/start", { testId });

    await violate(mine.client, testId);

    const other = await db().collection("attempts").findOne({
      testId: new ObjectId(testId),
      studentId: new ObjectId(theirs.id),
    });
    expect(other!.violations ?? []).toHaveLength(0);
  });
});
