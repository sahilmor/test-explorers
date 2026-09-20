import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, startHarness, type Harness } from "./harness";
import { humanGap } from "@/lib/tests-shared";

/**
 * Test creation and assignment, end to end over HTTP against the production
 * build.
 *
 * The thing that matters most here is timing: a paper must appear on a
 * student's dashboard exactly when `opensAt` passes and drop off it when
 * `closesAt` does, without a background job flipping rows over. The tests
 * therefore create tests with windows a few seconds wide and watch them cross.
 */

let harness: Harness;

let teacher: Client;
let admin: Client;
let studentA: Client; // in Grade 9 - A
let studentB: Client; // in Grade 9 - B, should never see A's papers
let other: Client; // another school

let physicsId = "";
let historyId = "";
let sectionAId = "";
let sectionBId = "";
let otherSectionId = "";
let otherTestId = "";

const TEACHER = { email: "dana@riverbend.test", password: "teacher password" };
const STUDENT_A = { email: "ada@riverbend.test", password: "student a password" };
const STUDENT_B = { email: "bo@riverbend.test", password: "student b password" };

/** A window, expressed in seconds from now. */
function window_(fromSec: number, toSec: number) {
  return {
    opensAt: new Date(Date.now() + fromSec * 1000).toISOString(),
    closesAt: new Date(Date.now() + toSec * 1000).toISOString(),
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  harness = await startHarness();

  admin = new Client(harness.baseUrl);
  other = new Client(harness.baseUrl);

  const signup = await admin.post("/api/auth/signup", {
    schoolName: "Riverbend High",
    name: "Priya Raman",
    email: "priya@riverbend.test",
    password: "riverbend admin pw",
  });
  expect(signup.status, JSON.stringify(signup.body)).toBe(201);

  const physics = await admin.post("/api/subjects", { name: "Physics" });
  const history = await admin.post("/api/subjects", { name: "History" });
  physicsId = physics.body.subject.id;
  historyId = history.body.subject.id;

  const sectionA = await admin.post("/api/sections", { name: "Grade 9 - A", grade: 9 });
  const sectionB = await admin.post("/api/sections", { name: "Grade 9 - B", grade: 9 });
  sectionAId = sectionA.body.section.id;
  sectionBId = sectionB.body.section.id;

  await admin.post("/api/teachers", {
    name: "Dana Mehta",
    email: TEACHER.email,
    password: TEACHER.password,
    subjectIds: [physicsId],
  });
  await admin.post("/api/students", {
    name: "Ada Student",
    email: STUDENT_A.email,
    password: STUDENT_A.password,
    sectionId: sectionAId,
  });
  await admin.post("/api/students", {
    name: "Bo Student",
    email: STUDENT_B.email,
    password: STUDENT_B.password,
    sectionId: sectionBId,
  });

  teacher = new Client(harness.baseUrl);
  await teacher.post("/api/auth/login", TEACHER);
  studentA = new Client(harness.baseUrl);
  await studentA.post("/api/auth/login", STUDENT_A);
  studentB = new Client(harness.baseUrl);
  await studentB.post("/api/auth/login", STUDENT_B);

  // A bank to build papers from: 12 Physics, 3 History.
  const rows = ["subject,question,optionA,optionB,optionC,optionD,correct,difficulty"];
  const letters = ["A", "B", "C", "D"];
  const levels = ["easy", "medium", "hard"];
  for (let i = 1; i <= 12; i++) {
    rows.push(`Physics,Physics question ${i}?,W${i},X${i},Y${i},Z${i},${letters[i % 4]},${levels[i % 3]}`);
  }
  for (let i = 1; i <= 3; i++) {
    rows.push(`History,History question ${i}?,W${i},X${i},Y${i},Z${i},A,easy`);
  }
  const imported = await teacher.post("/api/questions/bulk", { csv: rows.join("\n") + "\n" });
  expect(imported.body.created).toBe(15);

  // A second school, to aim cross-tenant attempts at.
  const otherSignup = await other.post("/api/auth/signup", {
    schoolName: "Northgate Academy",
    name: "Bruno Adams",
    email: "bruno@northgate.test",
    password: "northgate admin pw",
  });
  expect(otherSignup.status).toBe(201);

  const otherSubject = await other.post("/api/subjects", { name: "Northgate Physics" });
  const otherSection = await other.post("/api/sections", { name: "Northgate 9 - A", grade: 9 });
  otherSectionId = otherSection.body.section.id;

  const otherQuestion = await other.post("/api/questions", {
    subjectId: otherSubject.body.subject.id,
    text: "A Northgate-only question",
    options: ["W", "X", "Y", "Z"],
    correctOptionIndex: 0,
    difficulty: "easy",
  });

  const otherTest = await other.post("/api/tests", {
    title: "Northgate-only paper",
    subjectId: otherSubject.body.subject.id,
    durationMinutes: 30,
    questionIds: [otherQuestion.body.question.id],
    ...window_(-60, 3600),
    sectionIds: [otherSectionId],
    publish: true,
  });
  expect(otherTest.status, JSON.stringify(otherTest.body)).toBe(201);
  otherTestId = otherTest.body.test.id;
}, 180_000);

afterAll(async () => {
  await harness?.stop();
});

async function questionIds(count: number, subjectId = physicsId): Promise<string[]> {
  const res = await teacher.get(`/api/questions?subjectId=${subjectId}&pageSize=100`);
  return res.body.questions.slice(0, count).map((q: { id: string }) => q.id);
}

describe("creating a test by picking questions", () => {
  it("saves a draft that no student can see", async () => {
    const res = await teacher.post("/api/tests", {
      title: "Draft paper",
      subjectId: physicsId,
      durationMinutes: 45,
      questionIds: await questionIds(5),
      ...window_(-60, 3600), // window is open, but it is still a draft
      sectionIds: [sectionAId],
      publish: false,
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.test.state).toBe("draft");
    // A draft is assigned to nobody, whatever sections were sent.
    expect(res.body.test.sections).toEqual([]);

    const dashboard = await studentA.get("/api/student/tests");
    expect(
      dashboard.body.tests.some((t: { title: string }) => t.title === "Draft paper")
    ).toBe(false);
  });

  it("publishes a test into an open window and the student sees it", async () => {
    const res = await teacher.post("/api/tests", {
      title: "Open now paper",
      subjectId: physicsId,
      durationMinutes: 30,
      questionIds: await questionIds(4),
      ...window_(-60, 3600),
      sectionIds: [sectionAId],
      publish: true,
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.test.state).toBe("open");
    expect(res.body.test.sections.map((s: { name: string }) => s.name)).toEqual([
      "Grade 9 - A",
    ]);

    const dashboard = await studentA.get("/api/student/tests");
    const seen = dashboard.body.tests.find(
      (t: { title: string }) => t.title === "Open now paper"
    );
    expect(seen).toBeTruthy();
    expect(seen.state).toBe("open");
    expect(seen.questionCount).toBe(4);
  });

  it("keeps the teacher's question order", async () => {
    const ids = await questionIds(5);
    const reversed = [...ids].reverse();

    const created = await teacher.post("/api/tests", {
      title: "Ordered paper",
      subjectId: physicsId,
      durationMinutes: 30,
      questionIds: reversed,
      ...window_(-60, 3600),
      publish: false,
    });

    const fetched = await teacher.get(`/api/tests/${created.body.test.id}`);
    expect(fetched.body.test.questionIds).toEqual(reversed);
  });

  it("does not show one section's paper to another section", async () => {
    const dashboard = await studentB.get("/api/student/tests");

    expect(
      dashboard.body.tests.some((t: { title: string }) => t.title === "Open now paper")
    ).toBe(false);
  });
});

describe("auto-generating a paper", () => {
  it("picks the number asked for", async () => {
    const res = await teacher.post("/api/tests/auto-select", {
      subjectId: physicsId,
      count: 8,
    });

    expect(res.status).toBe(200);
    expect(res.body.questions).toHaveLength(8);
    expect(res.body.available).toBe(12);
    expect(new Set(res.body.questions.map((q: { id: string }) => q.id)).size).toBe(8);
  });

  it("returns what exists and says so when the bank is short", async () => {
    // History holds 3; ask for 10.
    const res = await teacher.post("/api/tests/auto-select", {
      subjectId: historyId,
      count: 10,
    });

    expect(res.status).toBe(200);
    expect(res.body.questions).toHaveLength(3);
    expect(res.body.available).toBe(3);
    expect(res.body.requested).toBe(10);
  });

  it("can narrow to one difficulty", async () => {
    const res = await teacher.post("/api/tests/auto-select", {
      subjectId: physicsId,
      count: 5,
      difficulty: "hard",
    });

    expect(res.status).toBe(200);
    expect(
      res.body.questions.every((q: { difficulty: string }) => q.difficulty === "hard")
    ).toBe(true);
  });

  it("actually randomises", async () => {
    // Two draws of 6 from 12 landing on the same set every time would mean
    // $sample is not doing its job.
    const draws = await Promise.all(
      Array.from({ length: 6 }, () =>
        teacher.post("/api/tests/auto-select", { subjectId: physicsId, count: 6 })
      )
    );
    const signatures = draws.map((d) =>
      d.body.questions
        .map((q: { id: string }) => q.id)
        .sort()
        .join(",")
    );

    expect(new Set(signatures).size).toBeGreaterThan(1);
  });

  it("refuses a subject from another school", async () => {
    const res = await teacher.post("/api/tests/auto-select", {
      subjectId: (await other.get("/api/subjects")).body.subjects[0].id,
      count: 1,
    });

    expect(res.status).toBe(400);
    expect(res.body.fields.subjectId).toMatch(/subject that exists in your school/i);
  });

  it("builds a publishable test from an auto-selection", async () => {
    const picked = await teacher.post("/api/tests/auto-select", {
      subjectId: physicsId,
      count: 7,
    });

    const res = await teacher.post("/api/tests", {
      title: "Auto-generated paper",
      subjectId: physicsId,
      durationMinutes: 40,
      questionIds: picked.body.questions.map((q: { id: string }) => q.id),
      ...window_(-60, 3600),
      sectionIds: [sectionAId],
      publish: true,
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.test.questionCount).toBe(7);
  });
});

describe("validation", () => {
  it("rejects a window that closes before it opens", async () => {
    const res = await teacher.post("/api/tests", {
      title: "Backwards window",
      subjectId: physicsId,
      durationMinutes: 30,
      questionIds: await questionIds(2),
      opensAt: new Date(Date.now() + 3600_000).toISOString(),
      closesAt: new Date(Date.now() + 60_000).toISOString(),
      publish: false,
    });

    expect(res.status).toBe(400);
    expect(res.body.fields.closesAt).toMatch(/after the opening time/i);
  });

  it("rejects a zero or negative duration", async () => {
    for (const durationMinutes of [0, -30]) {
      const res = await teacher.post("/api/tests", {
        title: `Duration ${durationMinutes}`,
        subjectId: physicsId,
        durationMinutes,
        questionIds: await questionIds(2),
        ...window_(-60, 3600),
        publish: false,
      });

      expect(res.status, `duration ${durationMinutes}`).toBe(400);
      expect(res.body.fields.durationMinutes).toBeTruthy();
    }
  });

  it("caps duration at four hours", async () => {
    const res = await teacher.post("/api/tests", {
      title: "Marathon",
      subjectId: physicsId,
      durationMinutes: 1000,
      questionIds: await questionIds(2),
      ...window_(-60, 3600),
      publish: false,
    });

    expect(res.status).toBe(400);
    expect(res.body.fields.durationMinutes).toMatch(/240 minutes/i);
  });

  it("refuses to publish a test with no questions", async () => {
    const res = await teacher.post("/api/tests", {
      title: "Empty paper",
      subjectId: physicsId,
      durationMinutes: 30,
      questionIds: [],
      ...window_(-60, 3600),
      sectionIds: [sectionAId],
      publish: true,
    });

    expect(res.status).toBe(400);
    expect(res.body.fields.questionIds).toMatch(/at least one question/i);
  });

  it("allows an empty draft, because a teacher is still working on it", async () => {
    const res = await teacher.post("/api/tests", {
      title: "Work in progress",
      subjectId: physicsId,
      durationMinutes: 30,
      questionIds: [],
      ...window_(-60, 3600),
      publish: false,
    });

    expect(res.status).toBe(201);
    expect(res.body.test.state).toBe("draft");
  });

  it("refuses questions from a different subject", async () => {
    const res = await teacher.post("/api/tests", {
      title: "Mixed subjects",
      subjectId: physicsId,
      // History questions, under a Physics paper.
      questionIds: await questionIds(2, historyId),
      durationMinutes: 30,
      ...window_(-60, 3600),
      publish: false,
    });

    expect(res.status).toBe(400);
    expect(res.body.fields.questionIds).toMatch(/aren't in this subject's bank/i);
  });

  it("refuses a missing title", async () => {
    const res = await teacher.post("/api/tests", {
      title: "   ",
      subjectId: physicsId,
      durationMinutes: 30,
      questionIds: await questionIds(2),
      ...window_(-60, 3600),
      publish: false,
    });

    expect(res.status).toBe(400);
    expect(res.body.fields.title).toBeTruthy();
  });
});

describe("assigning", () => {
  let draftId = "";
  let publishedId = "";

  beforeAll(async () => {
    const draft = await teacher.post("/api/tests", {
      title: "Assignment draft",
      subjectId: physicsId,
      durationMinutes: 30,
      questionIds: await questionIds(3),
      ...window_(-60, 3600),
      publish: false,
    });
    draftId = draft.body.test.id;

    const published = await teacher.post("/api/tests", {
      title: "Assignment published",
      subjectId: physicsId,
      durationMinutes: 30,
      questionIds: await questionIds(3),
      ...window_(-60, 3600),
      publish: true,
    });
    publishedId = published.body.test.id;
  });

  it("refuses to assign a draft to a section", async () => {
    const res = await teacher.request(`/api/tests/${draftId}/assignments`, {
      method: "PUT",
      json: { sectionIds: [sectionAId] },
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/still a draft/i);
  });

  it("assigns a published test to two sections at once", async () => {
    const res = await teacher.request(`/api/tests/${publishedId}/assignments`, {
      method: "PUT",
      json: { sectionIds: [sectionAId, sectionBId] },
    });

    expect(res.status).toBe(200);
    expect(res.body.test.sections.map((s: { name: string }) => s.name).sort()).toEqual([
      "Grade 9 - A",
      "Grade 9 - B",
    ]);

    // Both students now see it.
    for (const student of [studentA, studentB]) {
      const dash = await student.get("/api/student/tests");
      expect(
        dash.body.tests.some((t: { title: string }) => t.title === "Assignment published")
      ).toBe(true);
    }
  });

  it("re-assigning the same section twice is a no-op, not an error", async () => {
    const res = await teacher.request(`/api/tests/${publishedId}/assignments`, {
      method: "PUT",
      json: { sectionIds: [sectionAId, sectionAId, sectionBId] },
    });

    expect(res.status).toBe(200);
    expect(res.body.test.sections).toHaveLength(2);
  });

  it("withdraws from a section that is removed from the list", async () => {
    const res = await teacher.request(`/api/tests/${publishedId}/assignments`, {
      method: "PUT",
      json: { sectionIds: [sectionAId] },
    });

    expect(res.status).toBe(200);
    expect(res.body.test.sections).toHaveLength(1);

    const dashB = await studentB.get("/api/student/tests");
    expect(
      dashB.body.tests.some((t: { title: string }) => t.title === "Assignment published")
    ).toBe(false);
  });

  it("refuses a section from another school", async () => {
    const res = await teacher.request(`/api/tests/${publishedId}/assignments`, {
      method: "PUT",
      json: { sectionIds: [otherSectionId] },
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/isn't in your school/i);
  });

  it("un-publishing back to draft withdraws it from every section", async () => {
    const res = await teacher.patch(`/api/tests/${publishedId}`, {
      title: "Assignment published",
      subjectId: physicsId,
      durationMinutes: 30,
      questionIds: await questionIds(3),
      ...window_(-60, 3600),
      sectionIds: [sectionAId],
      publish: false,
    });

    expect(res.status).toBe(200);
    expect(res.body.test.state).toBe("draft");
    expect(res.body.test.sections).toEqual([]);

    const dash = await studentA.get("/api/student/tests");
    expect(
      dash.body.tests.some((t: { title: string }) => t.title === "Assignment published")
    ).toBe(false);
  });
});

describe("the window is what decides visibility", () => {
  it("a scheduled test is visible but not startable, then opens on time", async () => {
    // Opens in 3 seconds, closes in 60.
    const created = await teacher.post("/api/tests", {
      title: "Opens shortly",
      subjectId: physicsId,
      durationMinutes: 10,
      questionIds: await questionIds(3),
      ...window_(3, 60),
      sectionIds: [sectionAId],
      publish: true,
    });

    expect(created.status, JSON.stringify(created.body)).toBe(201);
    // Stored as "scheduled" because opensAt was in the future when saved.
    expect(created.body.test.status).toBe("scheduled");
    expect(created.body.test.state).toBe("scheduled");

    const before = await studentA.get("/api/student/tests");
    const seenBefore = before.body.tests.find(
      (t: { title: string }) => t.title === "Opens shortly"
    );
    expect(seenBefore, "a scheduled test should still be listed").toBeTruthy();
    expect(seenBefore.state).toBe("scheduled");

    // Starting it early is refused.
    const early = await studentA.get(`/student/tests/${created.body.test.id}`);
    expect(early.status).toBe(404);

    await wait(3500);

    // No job ran, nothing was written — the state is recomputed from the dates.
    const after = await studentA.get("/api/student/tests");
    const seenAfter = after.body.tests.find(
      (t: { title: string }) => t.title === "Opens shortly"
    );
    expect(seenAfter.state).toBe("open");

    const now = await studentA.get(`/student/tests/${created.body.test.id}`);
    expect(now.status).toBe(200);

    // The stored status is still the stale "scheduled" — proving nothing
    // important is decided from it.
    const asTeacher = await teacher.get(`/api/tests/${created.body.test.id}`);
    expect(asTeacher.body.test.status).toBe("scheduled");
    expect(asTeacher.body.test.state).toBe("open");
  }, 30_000);

  it("a test drops off the dashboard the moment it closes", async () => {
    // Open now, closes in 3 seconds.
    const created = await teacher.post("/api/tests", {
      title: "Closes shortly",
      subjectId: physicsId,
      durationMinutes: 10,
      questionIds: await questionIds(3),
      ...window_(-30, 3),
      sectionIds: [sectionAId],
      publish: true,
    });

    expect(created.status).toBe(201);

    const before = await studentA.get("/api/student/tests");
    expect(
      before.body.tests.some((t: { title: string }) => t.title === "Closes shortly")
    ).toBe(true);

    await wait(3500);

    const after = await studentA.get("/api/student/tests");
    expect(
      after.body.tests.some((t: { title: string }) => t.title === "Closes shortly")
    ).toBe(false);

    // And it cannot be started any more.
    const late = await studentA.get(`/student/tests/${created.body.test.id}`);
    expect(late.status).toBe(404);

    // The teacher still sees it, marked closed.
    const asTeacher = await teacher.get(`/api/tests/${created.body.test.id}`);
    expect(asTeacher.body.test.state).toBe("closed");
  }, 30_000);

  it("a student with no section sees nothing rather than everything", async () => {
    // Reachable state: /api/users creates a student without a section.
    // The dashboard must return an empty list, not fall back to the whole
    // school's papers.
    const created = await admin.post("/api/users", {
      name: "Unassigned Student",
      email: "orphan@riverbend.test",
      password: "orphan student password",
      role: "student",
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);

    const orphan = new Client(harness.baseUrl);
    await orphan.post("/api/auth/login", {
      email: "orphan@riverbend.test",
      password: "orphan student password",
    });

    const res = await orphan.get("/api/student/tests");
    expect(res.status).toBe(200);
    expect(res.body.tests).toEqual([]);

    // A classmate who does have a section still sees theirs, so this is the
    // section check doing the work rather than everything being broken.
    const classmate = await studentA.get("/api/student/tests");
    expect(classmate.body.tests.length).toBeGreaterThan(0);
  });
});

describe("only teachers and admins can set papers", () => {
  it("refuses a student on every test endpoint", async () => {
    const attempts = await Promise.all([
      studentA.get("/api/tests"),
      studentA.post("/api/tests", {
        title: "Student-written paper",
        subjectId: physicsId,
        durationMinutes: 30,
        questionIds: [],
        ...window_(-60, 3600),
        publish: false,
      }),
      studentA.post("/api/tests/auto-select", { subjectId: physicsId, count: 1 }),
    ]);

    for (const res of attempts) {
      expect(res.status).toBe(403);
    }
  });

  it("refuses a teacher on the student dashboard endpoint", async () => {
    const res = await teacher.get("/api/student/tests");
    expect(res.status).toBe(403);
  });

  it("bounces a student who types the teacher's tests URL", async () => {
    const res = await studentA.get("/teacher/tests");

    expect([302, 303, 307]).toContain(res.status);
    expect(res.headers.get("location")).toContain("/student");
  });

  it("lets an admin manage tests too", async () => {
    const list = await admin.get("/api/tests");
    expect(list.status).toBe(200);
    expect(list.body.tests.length).toBeGreaterThan(0);
  });

  it("refuses a caller with no session", async () => {
    const anon = new Client(harness.baseUrl);
    expect((await anon.get("/api/tests")).status).toBe(401);
    expect((await anon.get("/api/student/tests")).status).toBe(401);
  });
});

describe("one school cannot touch another's tests", () => {
  it("shows each school only its own", async () => {
    const mine = await teacher.get("/api/tests");
    expect(
      mine.body.tests.some((t: { title: string }) => t.title === "Northgate-only paper")
    ).toBe(false);

    const theirs = await other.get("/api/tests");
    expect(theirs.body.tests).toHaveLength(1);
  });

  it("returns 404 reading another school's test by its real id", async () => {
    const res = await teacher.get(`/api/tests/${otherTestId}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 editing another school's test", async () => {
    const res = await teacher.patch(`/api/tests/${otherTestId}`, {
      title: "Owned by Riverbend now",
      subjectId: physicsId,
      durationMinutes: 30,
      questionIds: await questionIds(2),
      ...window_(-60, 3600),
      publish: false,
    });

    expect(res.status).toBe(404);

    const check = await other.get("/api/tests");
    expect(check.body.tests[0].title).toBe("Northgate-only paper");
  });

  it("returns 404 deleting another school's test", async () => {
    const res = await teacher.request(`/api/tests/${otherTestId}`, { method: "DELETE" });

    expect(res.status).toBe(404);
    expect((await other.get("/api/tests")).body.tests).toHaveLength(1);
  });

  it("returns 404 assigning another school's test", async () => {
    const res = await teacher.request(`/api/tests/${otherTestId}/assignments`, {
      method: "PUT",
      json: { sectionIds: [sectionAId] },
    });

    expect(res.status).toBe(404);
  });

  it("never shows another school's paper to a student", async () => {
    const dash = await studentA.get("/api/student/tests");
    expect(
      dash.body.tests.some((t: { title: string }) => t.title === "Northgate-only paper")
    ).toBe(false);
  });
});

describe("deleting a test", () => {
  it("removes it from the students it was assigned to", async () => {
    const created = await teacher.post("/api/tests", {
      title: "Doomed paper",
      subjectId: physicsId,
      durationMinutes: 30,
      questionIds: await questionIds(3),
      ...window_(-60, 3600),
      sectionIds: [sectionAId],
      publish: true,
    });

    const before = await studentA.get("/api/student/tests");
    expect(
      before.body.tests.some((t: { title: string }) => t.title === "Doomed paper")
    ).toBe(true);

    const res = await teacher.request(`/api/tests/${created.body.test.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);

    const after = await studentA.get("/api/student/tests");
    expect(
      after.body.tests.some((t: { title: string }) => t.title === "Doomed paper")
    ).toBe(false);
  });
});

describe("the countdown copy", () => {
  /*
   * "Closes in 0 minutes" is what rounding to minutes produces in the last
   * half-minute of a window. It reads as a bug rather than as urgency, which
   * is the opposite of what a student needs at that moment.
   */
  it("never says zero of anything", () => {
    const base = new Date("2026-01-01T12:00:00Z");
    const at = (ms: number) => humanGap(base, new Date(base.getTime() + ms));

    expect(at(0)).toBe("now");
    expect(at(-5_000)).toBe("now");
    expect(at(1_000)).toBe("under a minute");
    expect(at(29_000)).toBe("under a minute");
    expect(at(59_000)).toBe("under a minute");

    expect(at(60_000)).toBe("1 minute");
    expect(at(120_000)).toBe("2 minutes");
    expect(at(45 * 60_000)).toBe("45 minutes");
    expect(at(3 * 60 * 60_000)).toBe("3 hours");
    expect(at(3 * 24 * 60 * 60_000)).toBe("3 days");

    // Whatever the gap, the number in the string is never 0.
    for (let ms = 1_000; ms < 5 * 24 * 60 * 60_000; ms += 37_000) {
      expect(at(ms), `gap ${ms}ms`).not.toMatch(/\b0 /);
    }
  });
});
