import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient } from "mongodb";
import { Client, startHarness, type Harness } from "./harness";

/**
 * Scheduling a paper across labs, days and periods.
 *
 * Two claims carry this feature:
 *
 *  1. A lab cannot hold two classes at once. Enforced by a unique index
 *     rather than a read-then-write check, because two teachers booking the
 *     same period at the same moment is exactly what a check loses.
 *  2. Once a class has a slot, that slot is the *only* time its students can
 *     start — not the paper's own window. Early is refused, late is refused,
 *     and another class's slot does not help.
 *
 * A paper with no slots keeps working exactly as before, which is what a
 * school that does not use labs gets.
 */

let harness: Harness;
let mongo: MongoClient;

let admin: Client;
let teacher: Client;
let sectionA = "";
let sectionB = "";
let subjectId = "";
let questionIds: string[] = [];
let labId = "";
let otherLabId = "";

/** Today, as the scheduler writes it: local "YYYY-MM-DD". */
function dayKey(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The period that contains *now*, for this lab's timing, so a test can book a
 * slot that is genuinely live rather than waiting for one.
 */
function livePeriod(firstStart: string, periodMinutes: number): number {
  const [h, m] = firstStart.split(":").map(Number);
  const start = new Date();
  start.setHours(h, m, 0, 0);
  const elapsed = (Date.now() - start.getTime()) / 60_000;
  return Math.floor(elapsed / periodMinutes) + 1;
}

async function makeTest(title: string, sections: string[]) {
  const res = await teacher.post("/api/tests", {
    title,
    subjectId,
    durationMinutes: 30,
    questionIds: questionIds.slice(0, 3),
    opensAt: new Date(Date.now() - 86_400_000).toISOString(),
    closesAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    sectionIds: sections,
    publish: true,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.test.id as string;
}

beforeAll(async () => {
  harness = await startHarness();
  mongo = new MongoClient(harness.mongoUri);
  await mongo.connect();

  admin = new Client(harness.baseUrl);
  await admin.post("/api/auth/signup", {
    schoolName: "Lab High",
    name: "Lab Admin",
    email: "lab-admin@lab.test",
    password: "a-long-enough-password",
  });

  sectionA = (await admin.post("/api/sections", { name: "Lab 9A", grade: 9 })).body.section.id;
  sectionB = (await admin.post("/api/sections", { name: "Lab 9B", grade: 9 })).body.section.id;
  subjectId = (await admin.post("/api/subjects", { name: "Physics" })).body.subject.id;

  // A day that started well before now, so early periods are already past and
  // a later one is live.
  const lab = await admin.post("/api/labs", {
    name: "Computer Lab 1",
    capacity: 40,
    periodsPerDay: 12,
    firstPeriodStartsAt: "00:00",
    periodMinutes: 60,
  });
  expect(lab.status, JSON.stringify(lab.body)).toBe(201);
  labId = lab.body.lab.id;

  otherLabId = (
    await admin.post("/api/labs", {
      name: "Computer Lab 2",
      periodsPerDay: 12,
      firstPeriodStartsAt: "00:00",
      periodMinutes: 60,
    })
  ).body.lab.id;

  await admin.post("/api/teachers", {
    name: "Lab Teacher",
    email: "lab-teacher@lab.test",
    password: "teacher password",
  });
  teacher = new Client(harness.baseUrl);
  await teacher.post("/api/auth/login", {
    email: "lab-teacher@lab.test",
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

describe("labs", () => {
  it("computes each period's clock time from the lab's own day", async () => {
    const res = await admin.get("/api/labs");
    const lab = res.body.labs.find((l: { id: string }) => l.id === labId);

    expect(lab.periodLabels).toHaveLength(12);
    expect(lab.periodLabels[0].label).toBe("00:00 – 01:00");
    expect(lab.periodLabels[2].label).toBe("02:00 – 03:00");
  });

  it("refuses two labs with the same name", async () => {
    const res = await admin.post("/api/labs", {
      name: "Computer Lab 1",
      periodsPerDay: 6,
      firstPeriodStartsAt: "09:00",
      periodMinutes: 45,
    });

    expect(res.status).toBe(409);
  });

  it("is admin-only to create", async () => {
    const res = await teacher.post("/api/labs", {
      name: "Sneaky Lab",
      periodsPerDay: 6,
      firstPeriodStartsAt: "09:00",
      periodMinutes: 45,
    });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------

describe("booking a lab", () => {
  let testId = "";

  beforeAll(async () => {
    testId = await makeTest("Rollout paper", [sectionA, sectionB]);
  });

  it("books a class into a lab, date and period", async () => {
    const res = await teacher.request(`/api/tests/${testId}/schedule`, {
      method: "PUT",
      json: { sectionId: sectionA, labId, day: dayKey(1), period: 3 },
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.slot.labName).toBe("Computer Lab 1");
    expect(res.body.slot.period).toBe(3);
    expect(res.body.slot.sectionName).toBe("Lab 9A");
  });

  it("refuses a second class in the same lab, day and period", async () => {
    const res = await teacher.request(`/api/tests/${testId}/schedule`, {
      method: "PUT",
      json: { sectionId: sectionB, labId, day: dayKey(1), period: 3 },
    });

    expect(res.status).toBe(409);
    // The message has to name what is in the way, or the teacher is guessing.
    expect(res.body.error).toContain("Computer Lab 1");
    expect(res.body.error).toContain("Lab 9A");
  });

  it("allows the same period in a different lab", async () => {
    const res = await teacher.request(`/api/tests/${testId}/schedule`, {
      method: "PUT",
      json: { sectionId: sectionB, labId: otherLabId, day: dayKey(1), period: 3 },
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it("moving a class frees the period it was in", async () => {
    const moved = await teacher.request(`/api/tests/${testId}/schedule`, {
      method: "PUT",
      json: { sectionId: sectionA, labId, day: dayKey(1), period: 5 },
    });
    expect(moved.status).toBe(200);

    // Period 3 in Lab 1 is now free, so another class can take it.
    const reused = await teacher.request(`/api/tests/${testId}/schedule`, {
      method: "PUT",
      json: { sectionId: sectionB, labId, day: dayKey(1), period: 3 },
    });
    expect(reused.status, JSON.stringify(reused.body)).toBe(200);
  });

  it("a class has one slot per paper, not a pile of them", async () => {
    const schedule = await teacher.get(`/api/tests/${testId}/schedule`);
    const forA = schedule.body.schedule.slots.filter(
      (s: { sectionId: string }) => s.sectionId === sectionA
    );

    expect(forA).toHaveLength(1);
  });

  it("refuses a period the lab does not have", async () => {
    const res = await teacher.request(`/api/tests/${testId}/schedule`, {
      method: "PUT",
      json: { sectionId: sectionA, labId, day: dayKey(2), period: 99 },
    });

    expect(res.status).toBe(400);
  });

  it("refuses a class that was never set the paper", async () => {
    const soloTest = await makeTest("Only 9A", [sectionA]);

    const res = await teacher.request(`/api/tests/${soloTest}/schedule`, {
      method: "PUT",
      json: { sectionId: sectionB, labId, day: dayKey(3), period: 1 },
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/isn't set this paper/i);
  });

  it("cancels a slot", async () => {
    const res = await teacher.request(
      `/api/tests/${testId}/schedule?sectionId=${sectionB}`,
      { method: "DELETE" }
    );

    expect(res.status).toBe(200);

    const schedule = await teacher.get(`/api/tests/${testId}/schedule`);
    expect(
      schedule.body.schedule.sections.find((s: { id: string }) => s.id === sectionB).slot
    ).toBeNull();
  });

  it("is not reachable by a student", async () => {
    await admin.post("/api/students", {
      name: "Nosy Pupil",
      email: "nosy@lab.test",
      sectionId: sectionA,
      password: "student password",
    });
    const pupil = new Client(harness.baseUrl);
    await pupil.post("/api/auth/login", { email: "nosy@lab.test", password: "student password" });

    expect((await pupil.get(`/api/tests/${testId}/schedule`)).status).toBe(403);
    expect(
      (await pupil.request(`/api/tests/${testId}/schedule`, {
        method: "PUT",
        json: { sectionId: sectionA, labId, day: dayKey(1), period: 1 },
      })).status
    ).toBe(403);
  });
});

// ---------------------------------------------------------------------------

describe("the slot decides when a student may start", () => {
  let testId = "";
  let pupilA: Client;
  let pupilB: Client;

  beforeAll(async () => {
    testId = await makeTest("Timed rollout", [sectionA, sectionB]);

    await admin.post("/api/students", {
      name: "Pupil A",
      email: "pupila@lab.test",
      sectionId: sectionA,
      password: "student password",
    });
    await admin.post("/api/students", {
      name: "Pupil B",
      email: "pupilb@lab.test",
      sectionId: sectionB,
      password: "student password",
    });

    pupilA = new Client(harness.baseUrl);
    await pupilA.post("/api/auth/login", { email: "pupila@lab.test", password: "student password" });
    pupilB = new Client(harness.baseUrl);
    await pupilB.post("/api/auth/login", { email: "pupilb@lab.test", password: "student password" });
  }, 120_000);

  it("lets anyone start while the paper is merely open and unscheduled", async () => {
    // No slot yet — the paper's own window governs, exactly as before labs
    // existed. This is the behaviour a school not using labs keeps.
    const res = await pupilA.post("/api/attempts/start", { testId });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it("refuses a start before the class's slot", async () => {
    // Pupil B has not started yet, so the slot still governs their first start.
    const booked = await teacher.request(`/api/tests/${testId}/schedule`, {
      method: "PUT",
      json: { sectionId: sectionB, labId, day: dayKey(3), period: 2 },
    });
    expect(booked.status, JSON.stringify(booked.body)).toBe(200);

    const res = await pupilB.post("/api/attempts/start", { testId });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Computer Lab 1");
    expect(res.body.error).toMatch(/can't start before then/i);
  });

  it("refuses a start after the class's slot has finished", async () => {
    const moved = await teacher.request(`/api/tests/${testId}/schedule`, {
      method: "PUT",
      json: { sectionId: sectionB, labId, day: dayKey(-2), period: 1 },
    });
    expect(moved.status).toBe(200);

    const res = await pupilB.post("/api/attempts/start", { testId });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/has finished/i);
  });

  it("lets them start inside it", async () => {
    const period = livePeriod("00:00", 60);

    const moved = await teacher.request(`/api/tests/${testId}/schedule`, {
      method: "PUT",
      json: { sectionId: sectionB, labId: otherLabId, day: dayKey(0), period },
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(moved.body.slot.state).toBe("live");

    const res = await pupilB.post("/api/attempts/start", { testId });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it("another class's live slot does not let you in", async () => {
    // 9B is sitting right now in Lab 2. 9A is booked for next week, and a
    // pupil in 9A must not be able to ride along.
    const otherTest = await makeTest("Separate slots", [sectionA, sectionB]);

    await teacher.request(`/api/tests/${otherTest}/schedule`, {
      method: "PUT",
      json: { sectionId: sectionB, labId: otherLabId, day: dayKey(0), period: livePeriod("00:00", 60) },
    });
    await teacher.request(`/api/tests/${otherTest}/schedule`, {
      method: "PUT",
      json: { sectionId: sectionA, labId, day: dayKey(6), period: 4 },
    });

    expect((await pupilB.post("/api/attempts/start", { testId: otherTest })).status).toBe(200);

    const res = await pupilA.post("/api/attempts/start", { testId: otherTest });
    expect(res.status).toBe(403);
  });

  it("a student already sitting is never thrown out when the slot ends", async () => {
    // Pupil B is mid-paper in "Separate slots". Move their slot into the past.
    const moved = await teacher.request(`/api/tests/${await (async () => {
      const schedule = await teacher.get(`/api/tests/${testId}/schedule`);
      return schedule.body.schedule.test.id;
    })()}/schedule`, {
      method: "PUT",
      json: { sectionId: sectionB, labId, day: dayKey(-5), period: 1 },
    });
    expect(moved.status).toBe(200);

    // Resuming and submitting still work — the slot guards a *new* start only,
    // the same way the paper's own window always has.
    const resumed = await pupilB.post("/api/attempts/start", { testId });
    expect(resumed.status).toBe(200);
    expect((await pupilB.post(`/api/attempts/${testId}/submit`)).status).toBe(200);
  });
});
