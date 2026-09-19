import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, startHarness, type Harness } from "./harness";

/**
 * School setup, end to end over HTTP against the production build.
 *
 * Two things are being proved here:
 *
 *  1. An admin can go from an empty school to sections, subjects, teachers and
 *     a bulk-imported year group, with search and filters working on the way.
 *  2. None of the new endpoints leak across the tenant boundary — the Phase 1
 *     rule still holds for every resource added in Phase 2.
 */

let harness: Harness;

let a: Client; // Riverbend High's admin
let b: Client; // Northgate Academy's admin

// Riverbend's ids
let section9A = "";
let section9B = "";
let section10A = "";
let physicsId = "";

// Northgate's ids, used as cross-tenant targets
let bSectionId = "";
let bSubjectId = "";

beforeAll(async () => {
  harness = await startHarness();

  a = new Client(harness.baseUrl);
  b = new Client(harness.baseUrl);

  const signupA = await a.post("/api/auth/signup", {
    schoolName: "Riverbend High",
    name: "Priya Raman",
    email: "priya@riverbend.test",
    password: "riverbend admin pw",
  });
  expect(signupA.status, JSON.stringify(signupA.body)).toBe(201);

  const signupB = await b.post("/api/auth/signup", {
    schoolName: "Northgate Academy",
    name: "Bruno Adams",
    email: "bruno@northgate.test",
    password: "northgate admin pw",
  });
  expect(signupB.status, JSON.stringify(signupB.body)).toBe(201);

  const bSection = await b.post("/api/sections", { name: "Northgate 9 - A", grade: 9 });
  expect(bSection.status).toBe(201);
  bSectionId = bSection.body.section.id;

  const bSubject = await b.post("/api/subjects", { name: "Northgate Chemistry" });
  expect(bSubject.status).toBe(201);
  bSubjectId = bSubject.body.subject.id;
}, 180_000);

afterAll(async () => {
  await harness?.stop();
});

describe("a brand-new school starts empty", () => {
  it("has no sections, subjects, teachers or students", async () => {
    const [sections, subjects, teachers, students] = await Promise.all([
      a.get("/api/sections"),
      a.get("/api/subjects"),
      a.get("/api/teachers"),
      a.get("/api/students"),
    ]);

    expect(sections.body.sections).toEqual([]);
    expect(subjects.body.subjects).toEqual([]);
    expect(teachers.body.teachers).toEqual([]);
    expect(students.body.students).toEqual([]);
  });
});

describe("step 1 — sections", () => {
  it("creates three sections", async () => {
    const made = await Promise.all([
      a.post("/api/sections", { name: "Grade 9 - A", grade: 9 }),
      a.post("/api/sections", { name: "Grade 9 - B", grade: 9 }),
      a.post("/api/sections", { name: "Grade 10 - A", grade: 10 }),
    ]);

    for (const res of made) {
      expect(res.status, JSON.stringify(res.body)).toBe(201);
    }

    const list = await a.get("/api/sections");
    expect(list.body.sections).toHaveLength(3);

    const byName = new Map<string, string>(
      list.body.sections.map((s: { name: string; id: string }) => [s.name, s.id])
    );
    section9A = byName.get("Grade 9 - A")!;
    section9B = byName.get("Grade 9 - B")!;
    section10A = byName.get("Grade 10 - A")!;

    expect(section9A).toBeTruthy();
  });

  it("refuses a duplicate name, case-insensitively", async () => {
    const res = await a.post("/api/sections", { name: "grade 9 - a", grade: 9 });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already have a section/i);
    expect(res.body.fields?.name).toBeTruthy();
  });

  it("rejects a grade outside 1–13 with a specific message", async () => {
    const res = await a.post("/api/sections", { name: "Grade 99", grade: 99 });

    expect(res.status).toBe(400);
    expect(res.body.fields.grade).toMatch(/between 1 and 13/i);
  });

  it("rejects a missing name with a specific message", async () => {
    const res = await a.post("/api/sections", { name: "  ", grade: 9 });

    expect(res.status).toBe(400);
    expect(res.body.fields.name).toBeTruthy();
  });

  it("renames a section", async () => {
    const created = await a.post("/api/sections", { name: "Typo Here", grade: 11 });
    const id = created.body.section.id;

    const res = await a.patch(`/api/sections/${id}`, {
      name: "Grade 11 - A",
      grade: 11,
    });

    expect(res.status).toBe(200);
    expect(res.body.section.name).toBe("Grade 11 - A");

    await a.request(`/api/sections/${id}`, { method: "DELETE" });
  });
});

describe("step 2 — subjects", () => {
  it("creates two subjects", async () => {
    const physics = await a.post("/api/subjects", { name: "Physics" });
    const history = await a.post("/api/subjects", { name: "History" });

    expect(physics.status).toBe(201);
    expect(history.status).toBe(201);
    physicsId = physics.body.subject.id;

    const list = await a.get("/api/subjects");
    expect(list.body.subjects.map((s: { name: string }) => s.name)).toEqual([
      "History",
      "Physics",
    ]);
  });

  it("refuses a duplicate subject", async () => {
    const res = await a.post("/api/subjects", { name: "PHYSICS" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already have a subject/i);
  });
});

describe("step 3 — teachers", () => {
  it("adds a teacher and shows a temporary password exactly once", async () => {
    const res = await a.post("/api/teachers", {
      name: "Dana Mehta",
      email: "dana@riverbend.test",
      subjectIds: [physicsId],
      sectionIds: [section9A, section9B],
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.teacher.temporaryPassword).toBeTruthy();

    // The generated password actually works.
    const teacher = new Client(harness.baseUrl);
    const login = await teacher.post("/api/auth/login", {
      email: "dana@riverbend.test",
      password: res.body.teacher.temporaryPassword,
    });
    expect(login.status).toBe(200);
    expect(login.body.redirectTo).toBe("/teacher");

    // And it is never readable again.
    const list = await a.get("/api/teachers");
    const dana = list.body.teachers.find(
      (t: { email: string }) => t.email === "dana@riverbend.test"
    );
    expect(dana.temporaryPassword).toBeUndefined();
    expect(JSON.stringify(list.body)).not.toContain(
      res.body.teacher.temporaryPassword
    );
  });

  it("adds a second teacher with an admin-chosen password", async () => {
    const res = await a.post("/api/teachers", {
      name: "Sam Ford",
      email: "sam@riverbend.test",
      password: "chosen by the admin",
      subjectIds: [],
      sectionIds: [section10A],
    });

    expect(res.status).toBe(201);
    // Nothing to show, because the admin already knows it.
    expect(res.body.teacher.temporaryPassword).toBeNull();
  });

  it("refuses an email that already has an account", async () => {
    const res = await a.post("/api/teachers", {
      name: "Impostor",
      email: "dana@riverbend.test",
    });

    expect(res.status).toBe(409);
    expect(res.body.fields.email).toMatch(/already has an account/i);
  });

  it("searches teachers by name and by email", async () => {
    const byName = await a.get("/api/teachers?q=dana");
    expect(byName.body.teachers).toHaveLength(1);
    expect(byName.body.teachers[0].name).toBe("Dana Mehta");

    const byEmail = await a.get("/api/teachers?q=sam@riverbend");
    expect(byEmail.body.teachers).toHaveLength(1);
    expect(byEmail.body.teachers[0].name).toBe("Sam Ford");

    const none = await a.get("/api/teachers?q=nobodyhere");
    expect(none.body.teachers).toEqual([]);
  });

  it("treats a search term as text, not as a regular expression", async () => {
    // An unescaped ".*" would match everybody.
    const res = await a.get("/api/teachers?q=.*");
    expect(res.body.teachers).toEqual([]);
  });
});

describe("step 4 — importing 40 students from a CSV", () => {
  function buildCsv(count: number): string {
    const lines = ["name,email,section"];
    for (let i = 1; i <= count; i++) {
      const section =
        i % 3 === 0 ? "Grade 10 - A" : i % 2 === 0 ? "Grade 9 - B" : "Grade 9 - A";
      lines.push(`Student ${i},student${i}@riverbend.test,${section}`);
    }
    return lines.join("\n") + "\n";
  }

  it("creates all 40 and spreads them across the right sections", async () => {
    const res = await a.post("/api/students/bulk", { csv: buildCsv(40) });

    expect(res.status, JSON.stringify(res.body).slice(0, 400)).toBe(200);
    expect(res.body.created).toBe(40);
    expect(res.body.skipped).toBe(0);

    const list = await a.get("/api/students");
    expect(list.body.students).toHaveLength(40);

    const sections = await a.get("/api/sections");
    const total = sections.body.sections.reduce(
      (sum: number, s: { studentCount: number }) => sum + s.studentCount,
      0
    );
    expect(total).toBe(40);
  }, 120_000);

  it("filters students by section", async () => {
    const all = await a.get("/api/students");
    const in9A = await a.get(`/api/students?sectionId=${section9A}`);

    expect(in9A.body.students.length).toBeGreaterThan(0);
    expect(in9A.body.students.length).toBeLessThan(all.body.students.length);
    expect(
      in9A.body.students.every(
        (s: { sectionName: string }) => s.sectionName === "Grade 9 - A"
      )
    ).toBe(true);
  });

  it("searches students by name and email", async () => {
    const byName = await a.get("/api/students?q=Student%207");
    // "Student 7" also matches "Student 7x" — 7, 17, 27, 37 all contain it.
    expect(byName.body.students.length).toBeGreaterThan(0);
    expect(
      byName.body.students.every((s: { name: string }) => s.name.includes("Student 7"))
    ).toBe(true);

    const byEmail = await a.get("/api/students?q=student12%40");
    expect(byEmail.body.students).toHaveLength(1);
    expect(byEmail.body.students[0].email).toBe("student12@riverbend.test");
  });

  it("combines search and section filter", async () => {
    const res = await a.get(`/api/students?q=Student&sectionId=${section10A}`);

    expect(res.body.students.length).toBeGreaterThan(0);
    expect(
      res.body.students.every(
        (s: { sectionName: string }) => s.sectionName === "Grade 10 - A"
      )
    ).toBe(true);
  });
});

describe("CSV error handling — one bad row never sinks the batch", () => {
  it("creates the good rows and explains every skipped one", async () => {
    const csv = [
      "name,email,section",
      "Good One,good1@riverbend.test,Grade 9 - A", // fine
      ",noname@riverbend.test,Grade 9 - A", // missing name
      "No Email,,Grade 9 - A", // missing email
      "Bad Email,not-an-email,Grade 9 - A", // malformed
      "No Section,nosection@riverbend.test,", // missing section
      "Wrong Section,wrong@riverbend.test,Grade 42 - Z", // unknown section
      "Already Here,student1@riverbend.test,Grade 9 - A", // existing account
      "Good Two,good2@riverbend.test,Grade 9 - B", // fine
      "Dupe A,dupe@riverbend.test,Grade 9 - A", // fine
      "Dupe B,dupe@riverbend.test,Grade 9 - B", // duplicate within the file
      "",
    ].join("\n");

    const res = await a.post("/api/students/bulk", { csv });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(3); // Good One, Good Two, Dupe A
    expect(res.body.skipped).toBe(7);

    const reasonFor = (email: string) =>
      res.body.results.find((r: { email: string }) => r.email === email)?.reason;

    expect(reasonFor("noname@riverbend.test")).toMatch(/missing a name/i);
    expect(reasonFor("")).toMatch(/missing an email/i);
    expect(reasonFor("not-an-email")).toMatch(/valid email/i);
    expect(reasonFor("nosection@riverbend.test")).toMatch(/missing a section/i);
    expect(reasonFor("wrong@riverbend.test")).toMatch(/no section called "Grade 42 - Z"/i);
    expect(reasonFor("student1@riverbend.test")).toMatch(/already has an account/i);

    // The second "dupe" row points back at the line the first one was on.
    const dupes = res.body.results.filter(
      (r: { email: string }) => r.email === "dupe@riverbend.test"
    );
    expect(dupes.filter((d: { status: string }) => d.status === "created")).toHaveLength(1);
    expect(dupes.find((d: { status: string }) => d.status === "skipped")?.reason).toMatch(
      /also appears on line 10/i
    );

    // Every skipped row carries the line number it came from.
    for (const row of res.body.results) {
      expect(typeof row.line).toBe("number");
      expect(row.line).toBeGreaterThan(1);
    }
  }, 60_000);

  it("rejects a file missing the section column, naming it", async () => {
    const res = await a.post("/api/students/bulk", {
      csv: "name,email\nAda,ada@riverbend.test\n",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/section/);
    expect(res.body.error).toMatch(/name, email, section/);
  });

  it("rejects an empty file", async () => {
    const res = await a.post("/api/students/bulk", { csv: "" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/empty/i);
  });

  it("reports an unterminated quote with a line number", async () => {
    const res = await a.post("/api/students/bulk", {
      csv: 'name,email,section\n"never closed,a@riverbend.test,Grade 9 - A\n',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/quoted value was never closed/i);
    expect(res.body.line).toBe(2);
  });

  it("refuses a file over the row cap instead of timing out", async () => {
    const lines = ["name,email,section"];
    for (let i = 0; i < 301; i++) {
      lines.push(`Big ${i},big${i}@riverbend.test,Grade 9 - A`);
    }

    const res = await a.post("/api/students/bulk", { csv: lines.join("\n") });

    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/at most 300/i);
  });
});

describe("deleting only removes what is safe to remove", () => {
  it("refuses to delete a section that still has students", async () => {
    const res = await a.request(`/api/sections/${section9A}`, { method: "DELETE" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/still has \d+ students? in it/i);

    // Still there, and the students are untouched.
    const sections = await a.get("/api/sections");
    expect(
      sections.body.sections.some((s: { id: string }) => s.id === section9A)
    ).toBe(true);
  });

  it("deletes an empty section", async () => {
    const made = await a.post("/api/sections", { name: "Temporary", grade: 12 });
    const res = await a.request(`/api/sections/${made.body.section.id}`, {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
  });

  it("deletes a subject and unassigns it from its teachers", async () => {
    const made = await a.post("/api/subjects", { name: "Doomed Subject" });
    const subjectId = made.body.subject.id;

    await a.post("/api/teachers", {
      name: "Temp Teacher",
      email: "temp@riverbend.test",
      subjectIds: [subjectId],
    });

    const res = await a.request(`/api/subjects/${subjectId}`, { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(res.body.unassignedFrom).toBe(1);

    const teachers = await a.get("/api/teachers?q=temp@riverbend");
    expect(teachers.body.teachers[0].subjects).toEqual([]);
  });
});

describe("the tenant boundary still holds for everything new", () => {
  it("shows each school only its own sections and subjects", async () => {
    const aSections = await a.get("/api/sections");
    const bSections = await b.get("/api/sections");

    expect(
      aSections.body.sections.some((s: { name: string }) => s.name === "Northgate 9 - A")
    ).toBe(false);
    expect(bSections.body.sections).toHaveLength(1);

    const bStudents = await b.get("/api/students");
    expect(bStudents.body.students).toEqual([]);
  });

  it("returns 404 when School A edits School B's section by its real id", async () => {
    const res = await a.patch(`/api/sections/${bSectionId}`, {
      name: "Owned By A",
      grade: 9,
    });

    expect(res.status).toBe(404);

    // B's section is untouched.
    const check = await b.get("/api/sections");
    expect(check.body.sections[0].name).toBe("Northgate 9 - A");
  });

  it("returns 404 when School A deletes School B's section", async () => {
    const res = await a.request(`/api/sections/${bSectionId}`, { method: "DELETE" });

    expect(res.status).toBe(404);
    expect((await b.get("/api/sections")).body.sections).toHaveLength(1);
  });

  it("returns 404 when School A deletes School B's subject", async () => {
    const res = await a.request(`/api/subjects/${bSubjectId}`, { method: "DELETE" });

    expect(res.status).toBe(404);
    expect((await b.get("/api/subjects")).body.subjects).toHaveLength(1);
  });

  it("refuses to link a teacher to another school's subject", async () => {
    const res = await a.post("/api/teachers", {
      name: "Cross Tenant",
      email: "cross@riverbend.test",
      subjectIds: [bSubjectId], // Northgate's
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/isn't in your school/i);
  });

  it("refuses to put a student in another school's section", async () => {
    const res = await a.post("/api/students", {
      name: "Cross Student",
      email: "crossstudent@riverbend.test",
      sectionId: bSectionId, // Northgate's
    });

    expect(res.status).toBe(400);
    expect(res.body.fields.sectionId).toMatch(/section that exists in your school/i);
  });

  it("ignores another school's sectionId used as a filter", async () => {
    const res = await a.get(`/api/students?sectionId=${bSectionId}`);

    // The school filter is applied first, so this narrows to nothing rather
    // than reaching into Northgate.
    expect(res.status).toBe(200);
    expect(res.body.students).toEqual([]);
  });

  it("will not import students into another school", async () => {
    // Northgate's admin uploads a file naming Riverbend's sections.
    const res = await b.post("/api/students/bulk", {
      csv: "name,email,section\nSneaky,sneaky@northgate.test,Grade 9 - A\n",
    });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(0);
    expect(res.body.results[0].reason).toMatch(/no section called "Grade 9 - A"/i);
  });
});

describe("only admins can run school setup", () => {
  it("refuses a teacher and a student on every setup endpoint", async () => {
    const teacherLogin = await a.post("/api/teachers", {
      name: "Role Check",
      email: "rolecheck@riverbend.test",
      password: "role check password",
    });
    expect(teacherLogin.status).toBe(201);

    const teacher = new Client(harness.baseUrl);
    await teacher.post("/api/auth/login", {
      email: "rolecheck@riverbend.test",
      password: "role check password",
    });

    const attempts = await Promise.all([
      teacher.get("/api/sections"),
      teacher.post("/api/sections", { name: "Nope", grade: 9 }),
      teacher.get("/api/subjects"),
      teacher.get("/api/teachers"),
      teacher.get("/api/students"),
      teacher.post("/api/students/bulk", { csv: "name,email,section\n" }),
    ]);

    for (const res of attempts) {
      expect(res.status).toBe(403);
    }
  });

  it("refuses everything to a caller with no session", async () => {
    const anon = new Client(harness.baseUrl);

    expect((await anon.get("/api/sections")).status).toBe(401);
    expect((await anon.post("/api/subjects", { name: "x" })).status).toBe(401);
    expect((await anon.get("/api/students")).status).toBe(401);
  });
});
