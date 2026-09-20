import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoClient } from "mongodb";
import { Client, startHarness, TEST_CRON_SECRET, type Harness } from "./harness";

/**
 * Sitting a test.
 *
 * The claims this file exists to prove, in order of how badly they would hurt
 * if they were false:
 *
 *  1. An autosave actually reaches the database. Every assertion about a saved
 *     answer reads it back out of MongoDB directly, not from the API that
 *     wrote it — an endpoint that returned 200 and stored nothing would pass a
 *     round-trip test and fail these.
 *  2. The correct answers never leave the server.
 *  3. A closed laptop still produces a submitted attempt.
 *  4. The deadline is the server's, and cannot be talked out of.
 */

let harness: Harness;
let mongo: MongoClient;

let teacher: Client;
let admin: Client;
let student: Client;
let otherStudent: Client;

let physicsId = "";
let sectionAId = "";
let sectionBId = "";
let questionIds: string[] = [];

const STUDENT = { email: "ada@riverbend.test", password: "student a password" };
const OTHER = { email: "bo@riverbend.test", password: "student b password" };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Calls the sweep the way Vercel Cron does. */
async function runSweep() {
  const cron = new Client(harness.baseUrl);
  return cron.request("/api/cron/sweep-attempts", {
    method: "GET",
    headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
  });
}

/** Reads an attempt straight out of the database, bypassing the API. */
async function attemptInDb(testId: string) {
  const db = mongo.db("sotm_test");
  const { ObjectId } = await import("mongodb");
  return db.collection("attempts").findOne({ testId: new ObjectId(testId) });
}

async function makeTest(
  title: string,
  opts: {
    durationMinutes?: number;
    opensInSec?: number;
    closesInSec?: number;
    questionCount?: number;
    sections?: string[];
  } = {}
) {
  const res = await teacher.post("/api/tests", {
    title,
    subjectId: physicsId,
    durationMinutes: opts.durationMinutes ?? 30,
    questionIds: questionIds.slice(0, opts.questionCount ?? 5),
    opensAt: new Date(Date.now() + (opts.opensInSec ?? -60) * 1000).toISOString(),
    closesAt: new Date(Date.now() + (opts.closesInSec ?? 3600) * 1000).toISOString(),
    sectionIds: opts.sections ?? [sectionAId],
    publish: true,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.test.id as string;
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
  await admin.post("/api/students", {
    name: "Ada Student",
    email: STUDENT.email,
    password: STUDENT.password,
    sectionId: sectionAId,
  });
  await admin.post("/api/students", {
    name: "Bo Student",
    email: OTHER.email,
    password: OTHER.password,
    sectionId: sectionBId,
  });

  teacher = new Client(harness.baseUrl);
  await teacher.post("/api/auth/login", {
    email: "dana@riverbend.test",
    password: "teacher password",
  });

  const rows = ["subject,question,optionA,optionB,optionC,optionD,correct,difficulty"];
  const letters = ["A", "B", "C", "D"];
  for (let i = 1; i <= 10; i++) {
    rows.push(
      `Physics,Physics question ${i}?,Newton ${i},Joule ${i},Watt ${i},Pascal ${i},${letters[i % 4]},easy`
    );
  }
  const imported = await teacher.post("/api/questions/bulk", {
    csv: rows.join("\n") + "\n",
  });
  expect(imported.body.created).toBe(10);

  const bank = await teacher.get(`/api/questions?subjectId=${physicsId}&pageSize=100`);
  questionIds = bank.body.questions.map((q: { id: string }) => q.id);
}, 180_000);

afterAll(async () => {
  await mongo?.close();
  await harness?.stop();
});

beforeEach(async () => {
  student = new Client(harness.baseUrl);
  await student.post("/api/auth/login", STUDENT);
  otherStudent = new Client(harness.baseUrl);
  await otherStudent.post("/api/auth/login", OTHER);
});

describe("starting a test", () => {
  it("writes the attempt before returning a single question", async () => {
    const testId = await makeTest("Start writes immediately");

    const res = await student.post("/api/attempts/start", { testId });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    // The row exists in the database, not just in the response.
    const row = await attemptInDb(testId);
    expect(row).toBeTruthy();
    expect(row!.status).toBe("in_progress");
    expect(row!.startedAt).toBeInstanceOf(Date);
  });

  it("computes the deadline as the earlier of duration and closesAt", async () => {
    // Duration 30 min, but the window shuts in 2 min — the window wins.
    const testId = await makeTest("Short window", {
      durationMinutes: 30,
      closesInSec: 120,
    });

    const res = await student.post("/api/attempts/start", { testId });
    const deadline = new Date(res.body.deadlineAt).getTime();
    const closesAt = new Date(res.body.test.closesAt).getTime();

    expect(deadline).toBe(closesAt);
  });

  it("uses the duration when it runs out first", async () => {
    const testId = await makeTest("Short duration", {
      durationMinutes: 1,
      closesInSec: 7200,
    });

    const res = await student.post("/api/attempts/start", { testId });
    const startedAt = new Date(res.body.attempt.startedAt).getTime();
    const deadline = new Date(res.body.deadlineAt).getTime();

    expect(deadline - startedAt).toBe(60_000);
  });

  it("NEVER sends the correct answers to the browser", async () => {
    const testId = await makeTest("No answer key");

    const res = await student.post("/api/attempts/start", { testId });

    // Not just "the field is absent from the type" — the literal bytes on the
    // wire must not contain it.
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("correctOptionIndex");
    expect(raw).not.toContain("correct_option");

    for (const q of res.body.test.questions) {
      expect(Object.keys(q).sort()).toEqual(["id", "imageUrl", "options", "text"]);
    }

    // And the same for the resume endpoint.
    const resumed = await student.get(`/api/attempts/${testId}`);
    expect(JSON.stringify(resumed.body)).not.toContain("correctOptionIndex");
  });

  it("keeps the teacher's question order", async () => {
    const testId = await makeTest("Ordered", { questionCount: 5 });
    const res = await student.post("/api/attempts/start", { testId });

    expect(res.body.test.questions.map((q: { id: string }) => q.id)).toEqual(
      questionIds.slice(0, 5)
    );
  });

  it("refuses a test that isn't set for this student's section", async () => {
    const testId = await makeTest("Section B only", { sections: [sectionBId] });

    const res = await student.post("/api/attempts/start", { testId });
    expect(res.status).toBe(404);

    // Nothing was written.
    expect(await attemptInDb(testId)).toBeNull();
  });

  it("refuses a test that hasn't opened yet", async () => {
    const testId = await makeTest("Not yet", { opensInSec: 600 });

    const res = await student.post("/api/attempts/start", { testId });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/hasn't opened/i);
  });

  it("refuses a test that has already closed", async () => {
    const testId = await makeTest("Long gone", {
      opensInSec: -7200,
      closesInSec: -3600,
    });

    const res = await student.post("/api/attempts/start", { testId });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/closed/i);
  });

  it("refuses a teacher trying to sit a paper", async () => {
    const testId = await makeTest("Teachers can't sit");
    expect((await teacher.post("/api/attempts/start", { testId })).status).toBe(403);
  });
});

describe("two tabs", () => {
  it("resumes the same attempt rather than starting a second", async () => {
    const testId = await makeTest("Two tabs");

    const tabOne = await student.post("/api/attempts/start", { testId });
    const tabTwo = await student.post("/api/attempts/start", { testId });

    expect(tabOne.body.attempt.id).toBe(tabTwo.body.attempt.id);
    expect(tabOne.body.attempt.startedAt).toBe(tabTwo.body.attempt.startedAt);

    // The second tab does not get a fresh clock either.
    expect(tabOne.body.deadlineAt).toBe(tabTwo.body.deadlineAt);

    const db = mongo.db("sotm_test");
    const { ObjectId } = await import("mongodb");
    const count = await db
      .collection("attempts")
      .countDocuments({ testId: new ObjectId(testId) });
    expect(count).toBe(1);
  });

  it("survives both tabs starting at the same instant", async () => {
    const testId = await makeTest("Simultaneous start");

    const results = await Promise.all([
      student.post("/api/attempts/start", { testId }),
      student.post("/api/attempts/start", { testId }),
      student.post("/api/attempts/start", { testId }),
    ]);

    for (const res of results) {
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    }
    expect(new Set(results.map((r) => r.body.attempt.id)).size).toBe(1);
  });

  it("sees the other tab's answers after a resume", async () => {
    const testId = await makeTest("Shared answers");
    await student.post("/api/attempts/start", { testId });

    await student.patch(`/api/attempts/${testId}/responses`, {
      responses: [
        { questionId: questionIds[0], selectedOptionIndex: 2, markedForReview: false },
      ],
    });

    // A second tab starting fresh picks up what the first one saved.
    const secondTab = await student.post("/api/attempts/start", { testId });
    const restored = secondTab.body.attempt.responses.find(
      (r: { questionId: string }) => r.questionId === questionIds[0]
    );
    expect(restored.selectedOptionIndex).toBe(2);
  });
});

describe("autosave actually reaches the database", () => {
  it("writes an answer that is readable straight out of MongoDB", async () => {
    const testId = await makeTest("Real autosave");
    await student.post("/api/attempts/start", { testId });

    const res = await student.patch(`/api/attempts/${testId}/responses`, {
      responses: [
        { questionId: questionIds[0], selectedOptionIndex: 1, markedForReview: false },
        { questionId: questionIds[1], selectedOptionIndex: 3, markedForReview: true },
      ],
    });
    expect(res.status).toBe(200);

    // The whole point of this phase. Read the document, not the API.
    const row = await attemptInDb(testId);
    expect(row!.responses).toHaveLength(2);

    type StoredResponse = {
      questionId: { toString(): string };
      selectedOptionIndex: number | null;
      markedForReview: boolean;
    };

    const byQuestion = new Map<string, StoredResponse>(
      (row!.responses as StoredResponse[]).map((r) => [r.questionId.toString(), r])
    );
    expect(byQuestion.get(questionIds[0])!.selectedOptionIndex).toBe(1);
    expect(byQuestion.get(questionIds[1])!.selectedOptionIndex).toBe(3);
    expect(byQuestion.get(questionIds[1])!.markedForReview).toBe(true);
    expect(row!.lastSavedAt).toBeInstanceOf(Date);
  });

  it("restores everything after a reload", async () => {
    const testId = await makeTest("Restore after reload");
    await student.post("/api/attempts/start", { testId });

    await student.patch(`/api/attempts/${testId}/responses`, {
      responses: [
        { questionId: questionIds[0], selectedOptionIndex: 2, markedForReview: false },
        { questionId: questionIds[1], selectedOptionIndex: null, markedForReview: true },
        { questionId: questionIds[3], selectedOptionIndex: 0, markedForReview: true },
      ],
    });

    // A brand-new client: no cookies carried over except the session, exactly
    // like a hard refresh in a fresh browser process.
    const reloaded = new Client(harness.baseUrl);
    await reloaded.post("/api/auth/login", STUDENT);
    const res = await reloaded.post("/api/attempts/start", { testId });

    const byQuestion = new Map(
      res.body.attempt.responses.map((r: { questionId: string }) => [r.questionId, r])
    );

    expect(byQuestion.get(questionIds[0])).toMatchObject({
      selectedOptionIndex: 2,
      markedForReview: false,
    });
    // A visited-but-blank question is restored as blank-and-flagged, not as
    // missing — the palette shows those differently.
    expect(byQuestion.get(questionIds[1])).toMatchObject({
      selectedOptionIndex: null,
      markedForReview: true,
    });
    expect(byQuestion.get(questionIds[3])).toMatchObject({
      selectedOptionIndex: 0,
      markedForReview: true,
    });
    // A question never touched has no row at all.
    expect(byQuestion.has(questionIds[2])).toBe(false);
  });

  it("keeps the remaining time across a reload", async () => {
    const testId = await makeTest("Timer survives reload", { durationMinutes: 10 });

    const first = await student.post("/api/attempts/start", { testId });
    const deadline = first.body.deadlineAt;

    await wait(1200);

    const reloaded = new Client(harness.baseUrl);
    await reloaded.post("/api/auth/login", STUDENT);
    const second = await reloaded.post("/api/attempts/start", { testId });

    // The deadline is fixed at start time. A reload does not hand back a
    // fresh ten minutes.
    expect(second.body.deadlineAt).toBe(deadline);

    const remaining =
      new Date(second.body.deadlineAt).getTime() -
      new Date(second.body.serverNow).getTime();
    expect(remaining).toBeLessThan(10 * 60_000);
    expect(remaining).toBeGreaterThan(9 * 60_000 - 5_000);
  });

  it("is idempotent, so a retry after a dropped connection is safe", async () => {
    const testId = await makeTest("Idempotent saves");
    await student.post("/api/attempts/start", { testId });

    const payload = {
      responses: [
        { questionId: questionIds[0], selectedOptionIndex: 2, markedForReview: false },
      ],
    };

    // The same batch three times, as a retrying client would send it.
    await student.patch(`/api/attempts/${testId}/responses`, payload);
    await student.patch(`/api/attempts/${testId}/responses`, payload);
    await student.patch(`/api/attempts/${testId}/responses`, payload);

    const row = await attemptInDb(testId);
    expect(row!.responses).toHaveLength(1);
    expect(row!.responses[0].selectedOptionIndex).toBe(2);
  });

  it("merges rather than replaces, so a partial batch loses nothing", async () => {
    const testId = await makeTest("Merging saves");
    await student.post("/api/attempts/start", { testId });

    await student.patch(`/api/attempts/${testId}/responses`, {
      responses: [
        { questionId: questionIds[0], selectedOptionIndex: 0, markedForReview: false },
      ],
    });
    // A later batch about a different question must not wipe the first.
    await student.patch(`/api/attempts/${testId}/responses`, {
      responses: [
        { questionId: questionIds[1], selectedOptionIndex: 1, markedForReview: false },
      ],
    });

    const row = await attemptInDb(testId);
    expect(row!.responses).toHaveLength(2);
  });

  it("lets a student change their mind", async () => {
    const testId = await makeTest("Changing answers");
    await student.post("/api/attempts/start", { testId });

    for (const index of [0, 3, 1]) {
      await student.patch(`/api/attempts/${testId}/responses`, {
        responses: [
          {
            questionId: questionIds[0],
            selectedOptionIndex: index,
            markedForReview: false,
          },
        ],
      });
    }

    const row = await attemptInDb(testId);
    expect(row!.responses).toHaveLength(1);
    expect(row!.responses[0].selectedOptionIndex).toBe(1);
  });

  it("drops a response naming a question that is not on this paper", async () => {
    const testId = await makeTest("Foreign question", { questionCount: 3 });
    await student.post("/api/attempts/start", { testId });

    await student.patch(`/api/attempts/${testId}/responses`, {
      responses: [
        { questionId: questionIds[0], selectedOptionIndex: 1, markedForReview: false },
        // On the bank, but not on this test.
        { questionId: questionIds[9], selectedOptionIndex: 2, markedForReview: false },
      ],
    });

    const row = await attemptInDb(testId);
    expect(row!.responses).toHaveLength(1);
    expect(row!.responses[0].questionId.toString()).toBe(questionIds[0]);
  });

  it("rejects an option index outside 0–3", async () => {
    const testId = await makeTest("Bad option index");
    await student.post("/api/attempts/start", { testId });

    for (const bad of [-1, 4, 99]) {
      const res = await student.patch(`/api/attempts/${testId}/responses`, {
        responses: [
          { questionId: questionIds[0], selectedOptionIndex: bad, markedForReview: false },
        ],
      });
      expect(res.status, `index ${bad}`).toBe(400);
    }

    const row = await attemptInDb(testId);
    expect(row!.responses).toHaveLength(0);
  });

  it("refuses to save into another student's attempt", async () => {
    const testId = await makeTest("Not yours", { sections: [sectionAId] });
    await student.post("/api/attempts/start", { testId });

    // Bo is in section B, so this paper is not theirs at all.
    const res = await otherStudent.patch(`/api/attempts/${testId}/responses`, {
      responses: [
        { questionId: questionIds[0], selectedOptionIndex: 0, markedForReview: false },
      ],
    });
    expect(res.status).toBe(404);

    const db = mongo.db("sotm_test");
    const { ObjectId } = await import("mongodb");
    expect(
      await db.collection("attempts").countDocuments({ testId: new ObjectId(testId) })
    ).toBe(1);
  });
});

describe("submitting", () => {
  it("locks the attempt so a stale tab cannot append to it", async () => {
    const testId = await makeTest("Locked after submit");
    await student.post("/api/attempts/start", { testId });

    await student.patch(`/api/attempts/${testId}/responses`, {
      responses: [
        { questionId: questionIds[0], selectedOptionIndex: 1, markedForReview: false },
      ],
    });

    const submitted = await student.post(`/api/attempts/${testId}/submit`);
    expect(submitted.status).toBe(200);
    expect(submitted.body.status).toBe("submitted");
    expect(submitted.body.answered).toBe(1);

    // The stale tab wakes up and tries to save.
    const late = await student.patch(`/api/attempts/${testId}/responses`, {
      responses: [
        { questionId: questionIds[1], selectedOptionIndex: 3, markedForReview: false },
      ],
    });
    expect(late.status).toBe(409);

    // And the document is unchanged.
    const row = await attemptInDb(testId);
    expect(row!.responses).toHaveLength(1);
    expect(row!.status).toBe("submitted");
  });

  it("is idempotent, so a double-click is harmless", async () => {
    const testId = await makeTest("Double submit");
    await student.post("/api/attempts/start", { testId });

    const first = await student.post(`/api/attempts/${testId}/submit`);
    const second = await student.post(`/api/attempts/${testId}/submit`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.submittedAt).toBe(first.body.submittedAt);
  });

  it("counts answered questions, not response rows", async () => {
    const testId = await makeTest("Counting", { questionCount: 5 });
    await student.post("/api/attempts/start", { testId });

    await student.patch(`/api/attempts/${testId}/responses`, {
      responses: [
        { questionId: questionIds[0], selectedOptionIndex: 1, markedForReview: false },
        // Visited and flagged, but blank — not an answer.
        { questionId: questionIds[1], selectedOptionIndex: null, markedForReview: true },
        { questionId: questionIds[2], selectedOptionIndex: 0, markedForReview: false },
      ],
    });

    const res = await student.post(`/api/attempts/${testId}/submit`);
    expect(res.body.answered).toBe(2);
    expect(res.body.total).toBe(5);
  });
});

describe("the deadline is the server's", () => {
  it("auto-submits when the duration runs out, with the answers kept", async () => {
    // Two seconds of allowance.
    const testId = await makeTest("Duration runs out", {
      durationMinutes: 1,
      closesInSec: 7200,
    });

    // Push startedAt back so the one-minute allowance has already elapsed.
    await student.post("/api/attempts/start", { testId });
    await student.patch(`/api/attempts/${testId}/responses`, {
      responses: [
        { questionId: questionIds[0], selectedOptionIndex: 2, markedForReview: false },
      ],
    });

    const db = mongo.db("sotm_test");
    const { ObjectId } = await import("mongodb");
    await db
      .collection("attempts")
      .updateOne(
        { testId: new ObjectId(testId) },
        { $set: { startedAt: new Date(Date.now() - 90_000) } }
      );

    // Simply reading the attempt closes it out — no job needed.
    const res = await student.get(`/api/attempts/${testId}`);
    expect(res.body.attempt.status).toBe("auto_submitted");

    const row = await attemptInDb(testId);
    expect(row!.status).toBe("auto_submitted");
    // The answer that was saved before time ran out is still there.
    expect(row!.responses).toHaveLength(1);
    expect(row!.responses[0].selectedOptionIndex).toBe(2);
  });

  it("refuses a save that arrives after the deadline", async () => {
    const testId = await makeTest("Late save", {
      durationMinutes: 1,
      closesInSec: 7200,
    });
    await student.post("/api/attempts/start", { testId });

    const db = mongo.db("sotm_test");
    const { ObjectId } = await import("mongodb");
    await db
      .collection("attempts")
      .updateOne(
        { testId: new ObjectId(testId) },
        { $set: { startedAt: new Date(Date.now() - 90_000) } }
      );

    const res = await student.patch(`/api/attempts/${testId}/responses`, {
      responses: [
        { questionId: questionIds[0], selectedOptionIndex: 1, markedForReview: false },
      ],
    });

    expect(res.status).toBe(409);
    expect(res.body.expired).toBe(true);

    const row = await attemptInDb(testId);
    expect(row!.status).toBe("auto_submitted");
    // Nothing was appended.
    expect(row!.responses).toHaveLength(0);
  });

  it("auto-submits when the test's window shuts mid-sitting", async () => {
    // Plenty of personal allowance, but the window closes in 2 seconds.
    const testId = await makeTest("Window shuts", {
      durationMinutes: 60,
      closesInSec: 2,
    });

    await student.post("/api/attempts/start", { testId });
    await student.patch(`/api/attempts/${testId}/responses`, {
      responses: [
        { questionId: questionIds[0], selectedOptionIndex: 3, markedForReview: false },
      ],
    });

    await wait(2500);

    const res = await student.get(`/api/attempts/${testId}`);
    expect(res.body.attempt.status).toBe("auto_submitted");

    const row = await attemptInDb(testId);
    expect(row!.responses[0].selectedOptionIndex).toBe(3);
  }, 20_000);

  it("records the deadline as the submission time, not when it was noticed", async () => {
    const testId = await makeTest("Late notice", {
      durationMinutes: 1,
      closesInSec: 7200,
    });
    const started = await student.post("/api/attempts/start", { testId });

    const db = mongo.db("sotm_test");
    const { ObjectId } = await import("mongodb");
    // Pretend the student started an hour ago and nobody has looked since.
    const longAgo = new Date(Date.now() - 60 * 60_000);
    await db
      .collection("attempts")
      .updateOne({ testId: new ObjectId(testId) }, { $set: { startedAt: longAgo } });

    await student.get(`/api/attempts/${testId}`);

    const row = await attemptInDb(testId);
    const submittedAt = new Date(row!.submittedAt).getTime();
    const expected = longAgo.getTime() + 60_000;

    // Within a second of the real deadline, not of "now".
    expect(Math.abs(submittedAt - expected)).toBeLessThan(1_000);
    expect(Date.now() - submittedAt).toBeGreaterThan(59 * 60_000);
    expect(started.body.attempt.status).toBe("in_progress");
  });
});

describe("the sweep — a closed laptop still submits", () => {
  it("submits an expired attempt with nobody's browser involved", async () => {
    const testId = await makeTest("Closed laptop", {
      durationMinutes: 1,
      closesInSec: 7200,
    });

    await student.post("/api/attempts/start", { testId });
    await student.patch(`/api/attempts/${testId}/responses`, {
      responses: [
        { questionId: questionIds[0], selectedOptionIndex: 1, markedForReview: false },
        { questionId: questionIds[2], selectedOptionIndex: 3, markedForReview: true },
      ],
    });

    const db = mongo.db("sotm_test");
    const { ObjectId } = await import("mongodb");
    await db
      .collection("attempts")
      .updateOne(
        { testId: new ObjectId(testId) },
        { $set: { startedAt: new Date(Date.now() - 120_000) } }
      );

    // Still running as far as the database is concerned.
    expect((await attemptInDb(testId))!.status).toBe("in_progress");

    // The student's tab is gone. The scheduled sweep does the work, with no
    // browser involved at all.
    const sweep = await runSweep();
    expect(sweep.status).toBe(200);
    expect(sweep.body.submitted).toBeGreaterThanOrEqual(1);

    const row = await attemptInDb(testId);
    expect(row!.status).toBe("auto_submitted");
    // With everything that had been saved.
    expect(row!.responses).toHaveLength(2);
    expect(row!.submittedAt).toBeInstanceOf(Date);
  });

  it("refuses an unauthenticated caller", async () => {
    // Found by this suite failing: the harness runs a production build, where
    // the endpoint refuses anyone without the secret. Worth pinning down.
    const anon = new Client(harness.baseUrl);
    const res = await anon.get("/api/cron/sweep-attempts");

    expect(res.status).toBe(401);

    const wrong = await anon.request("/api/cron/sweep-attempts", {
      method: "GET",
      headers: { authorization: "Bearer not-the-secret" },
    });
    expect(wrong.status).toBe(401);
  });

  it("leaves a running attempt alone", async () => {
    const testId = await makeTest("Still going", { durationMinutes: 60 });
    await student.post("/api/attempts/start", { testId });

    await runSweep();

    expect((await attemptInDb(testId))!.status).toBe("in_progress");
  });

  it("is safe to run twice", async () => {
    const testId = await makeTest("Swept twice", {
      durationMinutes: 1,
      closesInSec: 7200,
    });
    await student.post("/api/attempts/start", { testId });

    const db = mongo.db("sotm_test");
    const { ObjectId } = await import("mongodb");
    await db
      .collection("attempts")
      .updateOne(
        { testId: new ObjectId(testId) },
        { $set: { startedAt: new Date(Date.now() - 120_000) } }
      );

    await runSweep();
    const firstSubmittedAt = (await attemptInDb(testId))!.submittedAt;

    const second = await runSweep();
    expect(second.body.submitted).toBe(0);

    // Unchanged by the second pass.
    expect((await attemptInDb(testId))!.submittedAt).toEqual(firstSubmittedAt);
  });

  it("also runs on an ordinary dashboard request", async () => {
    const testId = await makeTest("Opportunistic sweep", {
      durationMinutes: 1,
      closesInSec: 7200,
    });
    await student.post("/api/attempts/start", { testId });

    const db = mongo.db("sotm_test");
    const { ObjectId } = await import("mongodb");
    await db
      .collection("attempts")
      .updateOne(
        { testId: new ObjectId(testId) },
        { $set: { startedAt: new Date(Date.now() - 120_000) } }
      );

    // Nobody calls the cron. A classmate simply opens their dashboard.
    const classmate = new Client(harness.baseUrl);
    await classmate.post("/api/auth/login", STUDENT);
    await classmate.get("/api/student/tests");

    expect((await attemptInDb(testId))!.status).toBe("auto_submitted");
  });
});

describe("the sitting page itself", () => {
  it("renders the paper for a student it is set for", async () => {
    const testId = await makeTest("Renders");
    const res = await student.get(`/student/tests/${testId}`);

    expect(res.status).toBe(200);
    // The bank lists newest first, so question 10 leads the paper.
    expect(String(res.body)).toContain("Physics question 10?");
    // Still no answer key, even in the server-rendered HTML.
    expect(String(res.body)).not.toContain("correctOptionIndex");
  });

  it("404s for a student it is not set for", async () => {
    const testId = await makeTest("Section A only", { sections: [sectionAId] });
    const res = await otherStudent.get(`/student/tests/${testId}`);

    expect(res.status).toBe(404);
  });

  it("bounces a teacher who opens a student's sitting URL", async () => {
    const testId = await makeTest("Teacher bounced");
    const res = await teacher.get(`/student/tests/${testId}`);

    expect([302, 303, 307]).toContain(res.status);
    expect(res.headers.get("location")).toContain("/teacher");
  });
});

describe("clearing an answer", () => {
  /*
   * Regression. The response schema used `z.coerce.number()`, and
   * `Number(null)` is 0 — so a student clearing their answer had it silently
   * recorded as "chose option A". On a real paper that is a wrong mark
   * produced by a schema detail, which is exactly the class of bug this phase
   * is meant not to have.
   */
  it("records a cleared answer as blank, not as option A", async () => {
    const testId = await makeTest("Clearing");
    await student.post("/api/attempts/start", { testId });

    await student.patch(`/api/attempts/${testId}/responses`, {
      responses: [
        { questionId: questionIds[0], selectedOptionIndex: 2, markedForReview: false },
      ],
    });
    expect((await attemptInDb(testId))!.responses[0].selectedOptionIndex).toBe(2);

    // The student changes their mind and clears it.
    await student.patch(`/api/attempts/${testId}/responses`, {
      responses: [
        { questionId: questionIds[0], selectedOptionIndex: null, markedForReview: false },
      ],
    });

    const row = await attemptInDb(testId);
    expect(row!.responses[0].selectedOptionIndex).toBeNull();

    // And it does not count towards the answered tally.
    const submitted = await student.post(`/api/attempts/${testId}/submit`);
    expect(submitted.body.answered).toBe(0);
  });
});
