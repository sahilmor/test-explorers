import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId } from "mongodb";
import { Client, startHarness, type Harness } from "./harness";
import { EmailStub } from "./email-stub";

/**
 * Notifications.
 *
 * Two claims, and the second matters more than the first.
 *
 *  1. The right people are told the right thing, once. A class of forty must
 *     not be mailed forty times because a teacher reassigned a paper, and a
 *     result email must never arrive before the result it links to is
 *     visible — a student clicking through to a 403 is worse than silence.
 *
 *  2. **Nothing here can break anything else.** A dead mail provider must not
 *     fail a test assignment, and a missing key must not either. This is the
 *     part that would quietly rot, because in the happy path it looks
 *     identical.
 *
 * Sending runs against a stub over real HTTP (tests/email-stub.ts) with
 * nothing inside the app mocked. Sends are scheduled with `after()`, so they
 * land just behind the response and the assertions wait for them.
 */

let harness: Harness;
let mongo: MongoClient;
let mail: EmailStub;

let admin: Client;
let teacher: Client;
let sectionA = "";
let sectionB = "";
let subjectId = "";
let questionIds: string[] = [];

function db() {
  return mongo.db("sotm_test");
}

async function makeStudent(name: string, email: string, sectionId: string) {
  const created = await admin.post("/api/students", {
    name,
    email,
    password: "student password",
    sectionId,
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return created.body.student.id as string;
}

async function makeTest(
  title: string,
  opts: { sections?: string[]; publish?: boolean; closesInSec?: number } = {}
) {
  const res = await teacher.post("/api/tests", {
    title,
    subjectId,
    durationMinutes: 45,
    questionIds: questionIds.slice(0, 3),
    opensAt: new Date(Date.now() - 60_000).toISOString(),
    closesAt: new Date(Date.now() + (opts.closesInSec ?? 7200) * 1000).toISOString(),
    sectionIds: opts.sections ?? [sectionA],
    publish: opts.publish ?? true,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.test.id as string;
}

async function notificationsFor(testId: string) {
  return db()
    .collection("notifications")
    .find({ testId: new ObjectId(testId) })
    .toArray();
}

beforeAll(async () => {
  mail = new EmailStub();
  const resendApiBase = await mail.start();

  harness = await startHarness({ resendApiBase });
  mongo = new MongoClient(harness.mongoUri);
  await mongo.connect();

  admin = new Client(harness.baseUrl);
  await admin.post("/api/auth/signup", {
    schoolName: "Notify High",
    name: "Notify Admin",
    email: "notify-admin@notify.test",
    password: "a-long-enough-password",
  });

  sectionA = (await admin.post("/api/sections", { name: "Notify 9A", grade: 9 })).body.section.id;
  sectionB = (await admin.post("/api/sections", { name: "Notify 9B", grade: 9 })).body.section.id;
  subjectId = (await admin.post("/api/subjects", { name: "Physics" })).body.subject.id;

  await admin.post("/api/teachers", {
    name: "Notify Teacher",
    email: "notify-teacher@notify.test",
    password: "teacher password",
  });
  teacher = new Client(harness.baseUrl);
  await teacher.post("/api/auth/login", {
    email: "notify-teacher@notify.test",
    password: "teacher password",
  });

  const rows = ["subject,question,optionA,optionB,optionC,optionD,correct,difficulty"];
  for (let i = 0; i < 5; i++) rows.push(`Physics,Q${i}?,A,B,C,D,A,easy`);
  expect((await teacher.post("/api/questions/bulk", { csv: rows.join("\n") + "\n" })).body.created).toBe(5);

  questionIds = (
    await teacher.get(`/api/questions?subjectId=${subjectId}&pageSize=50`)
  ).body.questions.map((q: { id: string }) => q.id);
}, 180_000);

afterAll(async () => {
  await mongo?.close();
  await harness?.stop();
  await mail?.stop();
});

// ---------------------------------------------------------------------------

describe("when a paper is set", () => {
  it("emails every student in the assigned class, and nobody else", async () => {
    await makeStudent("Anna Assigned", "anna@notify.test", sectionA);
    await makeStudent("Ajay Assigned", "ajay@notify.test", sectionA);
    await makeStudent("Bala Bystander", "bala@notify.test", sectionB);

    mail.clear();
    await makeTest("Unit 1 — Assigned");
    await mail.settle(2);

    expect(mail.sent).toHaveLength(2);

    const recipients = mail.sent.flatMap((m) => m.to).sort();
    expect(recipients).toEqual(["ajay@notify.test", "anna@notify.test"]);
    // The other class was not set this paper.
    expect(mail.to("bala@notify.test")).toHaveLength(0);

    const one = mail.to("anna@notify.test")[0];
    expect(one.subject).toContain("Unit 1 — Assigned");
    expect(one.subject).toContain("Physics");
    // On brand rather than a wall of plain text, and with a way back in.
    // The wordmark is split across two coloured spans, so the contiguous
    // name appears in the footer line rather than the header.
    expect(one.html).toContain("Sent by your school through Shalasys");
    expect(one.html).toContain(`${harness.baseUrl}/student`);
    // And readable without HTML at all.
    expect(one.text).toContain("Unit 1 — Assigned");
    expect(one.text).toContain("45 minutes");
  });

  it("records one notification per student", async () => {
    const testId = (await teacher.get("/api/tests")).body.tests.find(
      (t: { title: string }) => t.title === "Unit 1 — Assigned"
    ).id;

    const rows = await notificationsFor(testId);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.kind === "test_assigned")).toBe(true);
    expect(rows.every((r) => r.status === "sent")).toBe(true);
    expect(rows.every((r) => typeof r.providerId === "string")).toBe(true);
  });

  it("does not tell the same class twice when a paper is reassigned", async () => {
    mail.clear();
    const testId = await makeTest("Unit 2 — Reassigned");
    await mail.settle(2);
    expect(mail.sent).toHaveLength(2);

    mail.clear();
    // The same sections again — a teacher opening the assign dialog and
    // pressing save without changing anything.
    const again = await teacher.request(`/api/tests/${testId}/assignments`, {
      method: "PUT",
      json: { sectionIds: [sectionA] },
    });
    expect(again.status).toBe(200);
    await mail.settle(1, 4000);

    expect(mail.sent).toHaveLength(0);
  });

  it("tells only the newly added class when one is added", async () => {
    const testId = await makeTest("Unit 3 — Widened");
    await mail.settle(2);

    mail.clear();
    const widened = await teacher.request(`/api/tests/${testId}/assignments`, {
      method: "PUT",
      json: { sectionIds: [sectionA, sectionB] },
    });
    expect(widened.status).toBe(200);
    await mail.settle(1);

    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toEqual(["bala@notify.test"]);
  });

  it("says nothing about a draft", async () => {
    mail.clear();
    const res = await teacher.post("/api/tests", {
      title: "Unit 4 — Still a draft",
      subjectId,
      durationMinutes: 45,
      questionIds: questionIds.slice(0, 3),
      opensAt: new Date(Date.now() - 60_000).toISOString(),
      closesAt: new Date(Date.now() + 7_200_000).toISOString(),
      sectionIds: [sectionA],
      publish: false,
    });
    expect(res.status).toBe(201);
    await mail.settle(1, 4000);

    expect(mail.sent).toHaveLength(0);
    expect(await notificationsFor(res.body.test.id)).toHaveLength(0);
  });

  it("tells the class when that draft is finally published", async () => {
    const draft = (await teacher.get("/api/tests")).body.tests.find(
      (t: { title: string }) => t.title === "Unit 4 — Still a draft"
    );

    mail.clear();
    const published = await teacher.patch(`/api/tests/${draft.id}`, {
      title: "Unit 4 — Now published",
      subjectId,
      durationMinutes: 45,
      questionIds: questionIds.slice(0, 3),
      opensAt: new Date(Date.now() - 60_000).toISOString(),
      closesAt: new Date(Date.now() + 7_200_000).toISOString(),
      sectionIds: [sectionA],
      publish: true,
    });
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    await mail.settle(2);

    expect(mail.sent).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------

describe("when results come out", () => {
  it("waits until the paper has closed, then mails the mark", async () => {
    const testId = await makeTest("Unit 5 — Marked", { closesInSec: 7200 });
    await mail.settle(2);

    const student = new Client(harness.baseUrl);
    await student.post("/api/auth/login", {
      email: "anna@notify.test",
      password: "student password",
    });

    const started = await student.post("/api/attempts/start", { testId });
    expect(started.status).toBe(200);
    await student.patch(`/api/attempts/${testId}/responses`, {
      responses: started.body.test.questions.map((q: { id: string }, i: number) => ({
        questionId: q.id,
        selectedOptionIndex: i === 0 ? 0 : 1,
        markedForReview: false,
      })),
    });
    expect((await student.post(`/api/attempts/${testId}/submit`)).status).toBe(200);

    // Submitted and graded — but the paper is still open, so nothing is said.
    mail.clear();
    await student.get("/api/student/tests");
    await mail.settle(1, 4000);
    expect(mail.sent).toHaveLength(0);

    // The window shuts.
    await db()
      .collection("tests")
      .updateOne(
        { _id: new ObjectId(testId) },
        { $set: { closesAt: new Date(Date.now() - 1000) } }
      );

    // Any ordinary request sweeps and announces.
    await student.get("/api/student/tests");
    await mail.settle(1);

    expect(mail.sent).toHaveLength(1);
    const sent = mail.sent[0];
    expect(sent.to).toEqual(["anna@notify.test"]);
    expect(sent.subject).toContain("Unit 5 — Marked");
    // The mark itself, and a link that now actually resolves.
    expect(sent.text).toContain("1/3");
    expect(sent.html).toContain(`${harness.baseUrl}/student/tests/${testId}/result`);
  });

  it("does not mail the same result twice, however often the sweep runs", async () => {
    mail.clear();

    const student = new Client(harness.baseUrl);
    await student.post("/api/auth/login", {
      email: "anna@notify.test",
      password: "student password",
    });

    for (let i = 0; i < 4; i++) await student.get("/api/student/tests");
    await mail.settle(1, 4000);

    expect(mail.sent).toHaveLength(0);
  });

  it("says nothing to a student who never sat it", async () => {
    const testId = await makeTest("Unit 6 — Nobody sat it");
    await mail.settle(2);

    await db()
      .collection("tests")
      .updateOne(
        { _id: new ObjectId(testId) },
        { $set: { closesAt: new Date(Date.now() - 1000) } }
      );

    mail.clear();
    await admin.get("/api/students");
    await mail.settle(1, 4000);

    expect(mail.sent).toHaveLength(0);
    const rows = await notificationsFor(testId);
    expect(rows.filter((r) => r.kind === "results_published")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe("when the mail provider is broken", () => {
  it("assigns the paper anyway", async () => {
    mail.failing = true;
    mail.clear();

    try {
      const testId = await makeTest("Unit 7 — Provider down");

      // The thing that actually matters happened.
      const test = (await teacher.get("/api/tests")).body.tests.find(
        (t: { id: string }) => t.id === testId
      );
      expect(test.state).toBe("open");
      expect(test.sections).toHaveLength(1);

      // And the students can see it, which is the point of assigning it.
      const student = new Client(harness.baseUrl);
      await student.post("/api/auth/login", {
        email: "anna@notify.test",
        password: "student password",
      });
      const visible = await student.get("/api/student/tests");
      expect(visible.status).toBe(200);
      expect(
        visible.body.tests.some((t: { id: string }) => t.id === testId)
      ).toBe(true);

      // The failure is recorded rather than silently forgotten, so it can be
      // chased later.
      await new Promise((r) => setTimeout(r, 2500));
      const rows = await notificationsFor(testId);
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.status === "failed")).toBe(true);
      expect(rows.every((r) => typeof r.error === "string" && r.error.length > 0)).toBe(true);
    } finally {
      mail.failing = false;
    }
  });

  it("still lets a student sit and submit that paper", async () => {
    const testId = (await teacher.get("/api/tests")).body.tests.find(
      (t: { title: string }) => t.title === "Unit 7 — Provider down"
    ).id;

    const student = new Client(harness.baseUrl);
    await student.post("/api/auth/login", {
      email: "ajay@notify.test",
      password: "student password",
    });

    const started = await student.post("/api/attempts/start", { testId });
    expect(started.status).toBe(200);
    expect((await student.post(`/api/attempts/${testId}/submit`)).status).toBe(200);

    const attempt = await db()
      .collection("attempts")
      .findOne({ testId: new ObjectId(testId) });
    expect(attempt!.status).toBe("submitted");
    expect(attempt!.gradedAt).toBeInstanceOf(Date);
  });
});
