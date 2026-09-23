import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId } from "mongodb";
import { Client, startHarness, TEST_OWNER_EMAIL, type Harness } from "./harness";

/**
 * The owner managing somebody else's school.
 *
 * Everything here crosses the tenant boundary on purpose, which makes the gate
 * the entire security story. So the first and longest describe block is about
 * who cannot get in — a school admin, a teacher, a student and a stranger —
 * and only then what the owner can actually do.
 *
 * The other claim worth proving: the owner bypasses the student cap. A school
 * hands over a roster during onboarding and it gets typed in here, and having
 * to raise a cap first would be friction for no benefit. The cap still binds
 * the school itself.
 */

let harness: Harness;
let mongo: MongoClient;

let owner: Client;
let schoolAdmin: Client;
let teacher: Client;
let student: Client;
let stranger: Client;

let targetSchoolId = "";
let targetSectionId = "";

function db() {
  return mongo.db("sotm_test");
}

beforeAll(async () => {
  harness = await startHarness();
  mongo = new MongoClient(harness.mongoUri);
  await mongo.connect();

  // The school being managed.
  schoolAdmin = new Client(harness.baseUrl);
  await schoolAdmin.post("/api/auth/signup", {
    schoolName: "Managed High",
    name: "Managed Admin",
    email: "managed-admin@managed.test",
    password: "a-long-enough-password",
  });

  const school = await db().collection("schools").findOne({ name: "Managed High" });
  targetSchoolId = String(school!._id);

  targetSectionId = (
    await schoolAdmin.post("/api/sections", { name: "Managed 9", grade: 9 })
  ).body.section.id;

  await schoolAdmin.post("/api/teachers", {
    name: "Managed Teacher",
    email: "managed-teacher@managed.test",
    password: "teacher password",
  });
  teacher = new Client(harness.baseUrl);
  await teacher.post("/api/auth/login", {
    email: "managed-teacher@managed.test",
    password: "teacher password",
  });

  await schoolAdmin.post("/api/students", {
    name: "Managed Student",
    email: "managed-student@managed.test",
    sectionId: targetSectionId,
    password: "student password",
  });
  student = new Client(harness.baseUrl);
  await student.post("/api/auth/login", {
    email: "managed-student@managed.test",
    password: "student password",
  });

  stranger = new Client(harness.baseUrl);

  // The owner runs their own school like anybody else; it is the email that
  // makes them the owner, not a role.
  owner = new Client(harness.baseUrl);
  await owner.post("/api/auth/signup", {
    schoolName: "Owner's Own School",
    name: "The Owner",
    email: TEST_OWNER_EMAIL,
    password: "a-long-enough-password",
  });
}, 180_000);

afterAll(async () => {
  await mongo?.close();
  await harness?.stop();
});

// ---------------------------------------------------------------------------

describe("who cannot manage a school", () => {
  const routes = (id: string) => [
    { method: "GET", path: `/api/platform/schools/${id}` },
    { method: "PATCH", path: `/api/platform/schools/${id}` },
    { method: "POST", path: `/api/platform/schools/${id}/people` },
  ];

  async function attempt(client: Client, route: { method: string; path: string }) {
    return client.request(route.path, {
      method: route.method,
      json: route.method === "GET" ? undefined : {},
    });
  }

  it("a school's own admin cannot — not even for their own school", async () => {
    for (const route of routes(targetSchoolId)) {
      const res = await attempt(schoolAdmin, route);
      // 404, not 403: a 403 confirms the route is real.
      expect(res.status, `${route.method} ${route.path}`).toBe(404);
    }
  });

  it("a teacher cannot", async () => {
    for (const route of routes(targetSchoolId)) {
      expect((await attempt(teacher, route)).status).toBe(404);
    }
  });

  it("a student cannot", async () => {
    for (const route of routes(targetSchoolId)) {
      expect((await attempt(student, route)).status).toBe(404);
    }
  });

  it("a signed-out stranger cannot", async () => {
    for (const route of routes(targetSchoolId)) {
      expect((await attempt(stranger, route)).status).toBe(404);
    }
  });

  it("nor can they reach the page by guessing the URL", async () => {
    expect((await schoolAdmin.get(`/platform/schools/${targetSchoolId}`)).status).toBe(404);
    expect((await teacher.get("/platform")).status).toBe(404);
    expect((await stranger.get("/platform")).status).toBe(404);
  });

  it("and none of them changed anything by trying", async () => {
    const school = await db().collection("schools").findOne({ name: "Managed High" });
    expect(school!.plan).toBe("trial");
    expect(
      await db().collection("users").countDocuments({ schoolId: new ObjectId(targetSchoolId) })
    ).toBe(3);
  });
});

// ---------------------------------------------------------------------------

describe("what the owner can do", () => {
  it("reads a school in full", async () => {
    const res = await owner.get(`/api/platform/schools/${targetSchoolId}`);

    expect(res.status).toBe(200);
    expect(res.body.school.name).toBe("Managed High");
    expect(res.body.school.counts.admins).toBe(1);
    expect(res.body.school.counts.teachers).toBe(1);
    expect(res.body.school.counts.students).toBe(1);
    expect(res.body.school.people).toHaveLength(3);
    expect(res.body.school.sections).toHaveLength(1);
  });

  it("sets a plan outright, with no payment anywhere", async () => {
    const until = new Date(Date.now() + 365 * 86_400_000);

    const res = await owner.patch(`/api/platform/schools/${targetSchoolId}`, {
      plan: "active",
      planValidUntil: until.toISOString(),
      maxStudents: 500,
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const school = await db().collection("schools").findOne({ _id: new ObjectId(targetSchoolId) });
    expect(school!.plan).toBe("active");
    expect(school!.maxStudents).toBe(500);
    // Nothing was charged: no payment history was invented along the way.
    expect(school!.subscriptionHistory).toHaveLength(0);
  });

  it("the school feels it immediately", async () => {
    // Previously on a trial; now on a paid plan with a bigger cap.
    const dashboard = await schoolAdmin.get("/admin");
    expect(dashboard.status).toBe(200);
    expect(dashboard.body).toContain("500");
  });

  it("adds a teacher and a student on the school's behalf", async () => {
    const teacherRes = await owner.post(`/api/platform/schools/${targetSchoolId}/people`, {
      role: "teacher",
      name: "Added By Owner",
      email: "owneradded-teacher@managed.test",
    });

    expect(teacherRes.status, JSON.stringify(teacherRes.body)).toBe(201);
    // No password given, so one was generated and handed back exactly once.
    expect(typeof teacherRes.body.temporaryPassword).toBe("string");

    const studentRes = await owner.post(`/api/platform/schools/${targetSchoolId}/people`, {
      role: "student",
      name: "Also By Owner",
      email: "owneradded-student@managed.test",
      sectionId: targetSectionId,
      password: "a-known-password",
    });

    expect(studentRes.status, JSON.stringify(studentRes.body)).toBe(201);
    expect(studentRes.body.person.sectionName).toBe("Managed 9");

    // And they can actually sign in, which is the point.
    const added = new Client(harness.baseUrl);
    const login = await added.post("/api/auth/login", {
      email: "owneradded-student@managed.test",
      password: "a-known-password",
    });
    expect(login.status).toBe(200);
    expect(login.body.redirectTo).toBe("/student");
  });

  it("edits someone, and moves a student between classes", async () => {
    const other = await schoolAdmin.post("/api/sections", { name: "Managed 10", grade: 10 });
    const detail = await owner.get(`/api/platform/schools/${targetSchoolId}`);
    const target = detail.body.school.people.find(
      (p: { email: string }) => p.email === "owneradded-student@managed.test"
    );

    const res = await owner.patch(
      `/api/platform/schools/${targetSchoolId}/people/${target.id}`,
      { name: "Renamed By Owner", sectionId: other.body.section.id }
    );

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.person.name).toBe("Renamed By Owner");
    expect(res.body.person.sectionName).toBe("Managed 10");
  });

  it("hands out a new password for someone who has lost theirs", async () => {
    const detail = await owner.get(`/api/platform/schools/${targetSchoolId}`);
    const target = detail.body.school.people.find(
      (p: { email: string }) => p.email === "managed-student@managed.test"
    );

    const res = await owner.patch(
      `/api/platform/schools/${targetSchoolId}/people/${target.id}`,
      { resetPassword: true }
    );

    expect(res.status).toBe(200);
    expect(typeof res.body.temporaryPassword).toBe("string");

    const reset = new Client(harness.baseUrl);
    const login = await reset.post("/api/auth/login", {
      email: "managed-student@managed.test",
      password: res.body.temporaryPassword,
    });
    expect(login.status).toBe(200);
  });

  it("removes a student, and their sittings go with them", async () => {
    const detail = await owner.get(`/api/platform/schools/${targetSchoolId}`);
    const target = detail.body.school.people.find(
      (p: { name: string }) => p.name === "Renamed By Owner"
    );

    const res = await owner.request(
      `/api/platform/schools/${targetSchoolId}/people/${target.id}`,
      { method: "DELETE" }
    );

    expect(res.status).toBe(200);
    expect(
      await db().collection("users").countDocuments({ _id: new ObjectId(target.id) })
    ).toBe(0);
  });

  it("refuses to remove a school's last admin", async () => {
    const detail = await owner.get(`/api/platform/schools/${targetSchoolId}`);
    const admin = detail.body.school.people.find((p: { role: string }) => p.role === "admin");

    const res = await owner.request(
      `/api/platform/schools/${targetSchoolId}/people/${admin.id}`,
      { method: "DELETE" }
    );

    // Otherwise the school becomes one nobody can sign in to, which is not a
    // state worth being able to reach by clicking Delete twice.
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/only admin/i);
    expect(
      await db().collection("users").countDocuments({ _id: new ObjectId(admin.id) })
    ).toBe(1);
  });

  it("404s for a school that does not exist", async () => {
    const res = await owner.get(`/api/platform/schools/${new ObjectId().toString()}`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------

describe("the student cap binds the school, not the owner", () => {
  let cappedId = "";
  let cappedSection = "";
  let cappedAdmin: Client;

  beforeAll(async () => {
    cappedAdmin = new Client(harness.baseUrl);
    await cappedAdmin.post("/api/auth/signup", {
      schoolName: "Capped High",
      name: "Capped Admin",
      email: "capped-admin@capped.test",
      password: "a-long-enough-password",
    });

    const school = await db().collection("schools").findOne({ name: "Capped High" });
    cappedId = String(school!._id);
    cappedSection = (
      await cappedAdmin.post("/api/sections", { name: "Capped 9", grade: 9 })
    ).body.section.id;

    // A cap of one, so the next student is the one too many.
    await owner.patch(`/api/platform/schools/${cappedId}`, {
      plan: "trial",
      planValidUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      maxStudents: 1,
    });

    await cappedAdmin.post("/api/students", {
      name: "First Student",
      email: "first@capped.test",
      sectionId: cappedSection,
      password: "student password",
    });
  }, 120_000);

  it("stops the school at its cap", async () => {
    const res = await cappedAdmin.post("/api/students", {
      name: "Second Student",
      email: "second@capped.test",
      sectionId: cappedSection,
      password: "student password",
    });

    expect(res.status).toBe(402);
    expect(res.body.planBlock?.reason).toBe("student_cap");
  });

  it("but lets the owner add anyway, because onboarding is their job", async () => {
    const res = await owner.post(`/api/platform/schools/${cappedId}/people`, {
      role: "student",
      name: "Added Over The Cap",
      email: "overcap@capped.test",
      sectionId: cappedSection,
      password: "a-known-password",
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const count = await db()
      .collection("users")
      .countDocuments({ schoolId: new ObjectId(cappedId), role: "student" });
    expect(count).toBe(2);
  });

  it("and the school is still capped afterwards", async () => {
    const res = await cappedAdmin.post("/api/students", {
      name: "Third Student",
      email: "third@capped.test",
      sectionId: cappedSection,
      password: "student password",
    });

    expect(res.status).toBe(402);
  });
});

// ---------------------------------------------------------------------------

describe("one school's management cannot touch another", () => {
  it("adding to school A leaves school B alone", async () => {
    const before = await db()
      .collection("users")
      .countDocuments({ schoolId: new ObjectId(targetSchoolId) });

    const other = await db().collection("schools").findOne({ name: "Capped High" });

    await owner.post(`/api/platform/schools/${String(other!._id)}/people`, {
      role: "teacher",
      name: "Only For Capped",
      email: "onlycapped@capped.test",
    });

    const after = await db()
      .collection("users")
      .countDocuments({ schoolId: new ObjectId(targetSchoolId) });

    expect(after).toBe(before);
  });

  it("a person id from another school is a 404, not an edit", async () => {
    const outsider = await db()
      .collection("users")
      .findOne({ email: "onlycapped@capped.test" });

    // Right person, wrong school in the URL.
    const res = await owner.patch(
      `/api/platform/schools/${targetSchoolId}/people/${String(outsider!._id)}`,
      { name: "Should Not Happen" }
    );

    expect(res.status).toBe(404);

    const unchanged = await db()
      .collection("users")
      .findOne({ email: "onlycapped@capped.test" });
    expect(unchanged!.name).toBe("Only For Capped");
  });
});
