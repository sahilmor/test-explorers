import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { Client, startHarness, type Harness } from "./harness";

/**
 * The question bank, end to end over HTTP against the production build.
 *
 * Three things are being proved:
 *
 *  1. A teacher can fill a subject's bank from a CSV in one go, and the list
 *     view's filters and search then narrow it correctly.
 *  2. Validation rejects the things that would produce a broken answer key —
 *     wrong option count, an out-of-range correct index, a blank option.
 *  3. Students cannot reach any of it, and one school cannot touch another's
 *     questions.
 */

let harness: Harness;

let teacher: Client; // Riverbend's teacher
let admin: Client; // Riverbend's admin
let student: Client; // Riverbend's student
let other: Client; // Northgate's admin

let physicsId = "";
let historyId = "";
let otherSubjectId = "";
let otherQuestionId = "";

const TEACHER = { email: "dana@riverbend.test", password: "teacher password" };
const STUDENT = { email: "sam@riverbend.test", password: "student password" };

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
  await admin.post("/api/subjects", { name: "Biology" }); // stays empty on purpose
  physicsId = physics.body.subject.id;
  historyId = history.body.subject.id;

  const section = await admin.post("/api/sections", { name: "Grade 9 - A", grade: 9 });

  await admin.post("/api/teachers", {
    name: "Dana Mehta",
    email: TEACHER.email,
    password: TEACHER.password,
    subjectIds: [physicsId],
  });
  await admin.post("/api/students", {
    name: "Sam Student",
    email: STUDENT.email,
    password: STUDENT.password,
    sectionId: section.body.section.id,
  });

  teacher = new Client(harness.baseUrl);
  await teacher.post("/api/auth/login", TEACHER);

  student = new Client(harness.baseUrl);
  await student.post("/api/auth/login", STUDENT);

  // A second school, to aim cross-tenant attempts at.
  const otherSignup = await other.post("/api/auth/signup", {
    schoolName: "Northgate Academy",
    name: "Bruno Adams",
    email: "bruno@northgate.test",
    password: "northgate admin pw",
  });
  expect(otherSignup.status).toBe(201);

  const otherSubject = await other.post("/api/subjects", { name: "Northgate Physics" });
  otherSubjectId = otherSubject.body.subject.id;

  const otherQuestion = await other.post("/api/questions", {
    subjectId: otherSubjectId,
    text: "A Northgate-only question",
    options: ["W", "X", "Y", "Z"],
    correctOptionIndex: 2,
    difficulty: "easy",
  });
  expect(otherQuestion.status, JSON.stringify(otherQuestion.body)).toBe(201);
  otherQuestionId = otherQuestion.body.question.id;
}, 180_000);

afterAll(async () => {
  await harness?.stop();
});

describe("the bank starts empty and says so per subject", () => {
  it("reports every subject, zeroes included", async () => {
    const res = await teacher.get("/api/questions/summary");

    expect(res.status).toBe(200);
    // The zeroes are the point — they show where the bank is thin.
    expect(res.body.subjects).toEqual([
      { subjectId: expect.any(String), subjectName: "Biology", count: 0 },
      { subjectId: expect.any(String), subjectName: "History", count: 0 },
      { subjectId: expect.any(String), subjectName: "Physics", count: 0 },
    ]);
  });
});

describe("writing one question by hand", () => {
  it("creates it and returns it in the list", async () => {
    const res = await teacher.post("/api/questions", {
      subjectId: physicsId,
      text: "What is the SI unit of force?",
      options: ["Newton", "Joule", "Watt", "Pascal"],
      correctOptionIndex: 0,
      difficulty: "easy",
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.question.correctOptionIndex).toBe(0);

    const list = await teacher.get("/api/questions");
    expect(list.body.total).toBe(1);
    expect(list.body.questions[0].subjectName).toBe("Physics");
  });

  it("rejects three options", async () => {
    const res = await teacher.post("/api/questions", {
      subjectId: physicsId,
      text: "Too few options",
      options: ["A", "B", "C"],
      correctOptionIndex: 0,
      difficulty: "easy",
    });

    expect(res.status).toBe(400);
    expect(res.body.fields.options).toMatch(/exactly 4 options/i);
  });

  it("rejects five options", async () => {
    const res = await teacher.post("/api/questions", {
      subjectId: physicsId,
      text: "Too many options",
      options: ["A", "B", "C", "D", "E"],
      correctOptionIndex: 0,
      difficulty: "easy",
    });

    expect(res.status).toBe(400);
    expect(res.body.fields.options).toMatch(/exactly 4 options/i);
  });

  it("rejects a blank option", async () => {
    const res = await teacher.post("/api/questions", {
      subjectId: physicsId,
      text: "One option is empty",
      options: ["Newton", "   ", "Watt", "Pascal"],
      correctOptionIndex: 0,
      difficulty: "easy",
    });

    expect(res.status).toBe(400);
    // Reported against the option that is actually wrong, not the whole array.
    expect(res.body.fields["options.1"]).toMatch(/needs some text/i);
  });

  it("rejects a correct index outside 0–3", async () => {
    for (const index of [-1, 4, 99]) {
      const res = await teacher.post("/api/questions", {
        subjectId: physicsId,
        text: `Out of range ${index}`,
        options: ["A", "B", "C", "D"],
        correctOptionIndex: index,
        difficulty: "easy",
      });

      expect(res.status, `index ${index}`).toBe(400);
      expect(res.body.fields.correctOptionIndex).toBeTruthy();
    }
  });

  it("rejects empty question text", async () => {
    const res = await teacher.post("/api/questions", {
      subjectId: physicsId,
      text: "   ",
      options: ["A", "B", "C", "D"],
      correctOptionIndex: 0,
      difficulty: "easy",
    });

    expect(res.status).toBe(400);
    expect(res.body.fields.text).toMatch(/needs some text/i);
  });

  it("rejects a difficulty that is not easy, medium or hard", async () => {
    const res = await teacher.post("/api/questions", {
      subjectId: physicsId,
      text: "Impossible",
      options: ["A", "B", "C", "D"],
      correctOptionIndex: 0,
      difficulty: "nightmare",
    });

    expect(res.status).toBe(400);
    expect(res.body.fields.difficulty).toMatch(/easy, medium or hard/i);
  });

  it("refuses a subject from another school", async () => {
    const res = await teacher.post("/api/questions", {
      subjectId: otherSubjectId,
      text: "Cross-tenant subject",
      options: ["A", "B", "C", "D"],
      correctOptionIndex: 0,
      difficulty: "easy",
    });

    expect(res.status).toBe(400);
    expect(res.body.fields.subjectId).toMatch(/subject that exists in your school/i);
  });
});

describe("filling a subject from a CSV", () => {
  function buildCsv(count: number, subject = "Physics"): string {
    const lines = ["subject,question,optionA,optionB,optionC,optionD,correct,difficulty"];
    const letters = ["A", "B", "C", "D"];
    const levels = ["easy", "medium", "hard"];

    for (let i = 1; i <= count; i++) {
      lines.push(
        [
          subject,
          `Imported question ${i}: what is the value of x when i = ${i}?`,
          `Option A ${i}`,
          `Option B ${i}`,
          `Option C ${i}`,
          `Option D ${i}`,
          letters[i % 4],
          levels[i % 3],
        ].join(",")
      );
    }
    return lines.join("\n") + "\n";
  }

  it("imports 60 questions in one upload", async () => {
    const res = await teacher.post("/api/questions/bulk", { csv: buildCsv(60) });

    expect(res.status, JSON.stringify(res.body).slice(0, 400)).toBe(200);
    expect(res.body.created).toBe(60);
    expect(res.body.skipped).toBe(0);

    const summary = await teacher.get("/api/questions/summary");
    const physics = summary.body.subjects.find(
      (s: { subjectName: string }) => s.subjectName === "Physics"
    );
    // 60 imported plus the one written by hand earlier.
    expect(physics.count).toBe(61);
  }, 120_000);

  it("keeps the correct letter from the file", async () => {
    const res = await teacher.get("/api/questions?q=Imported%20question%204%3A");

    expect(res.body.questions).toHaveLength(1);
    // Row 4 was given "A" (4 % 4 === 0).
    expect(res.body.questions[0].correctOptionIndex).toBe(0);
  });

  it("handles a quoted field containing a comma", async () => {
    const csv = [
      "subject,question,optionA,optionB,optionC,optionD,correct,difficulty",
      `History,"In 1815, which battle ended the Napoleonic Wars?",Waterloo,Trafalgar,Austerlitz,Borodino,A,medium`,
    ].join("\n");

    const res = await teacher.post("/api/questions/bulk", { csv });

    expect(res.body.created).toBe(1);

    const found = await teacher.get("/api/questions?q=Napoleonic");
    expect(found.body.questions[0].text).toBe(
      "In 1815, which battle ended the Napoleonic Wars?"
    );
  });

  it("accepts 1–4 as well as A–D, because spreadsheets do that", async () => {
    const csv = [
      "subject,question,optionA,optionB,optionC,optionD,correct,difficulty",
      "History,Numeric correct column,W,X,Y,Z,3,easy",
    ].join("\n");

    const res = await teacher.post("/api/questions/bulk", { csv });

    expect(res.body.created).toBe(1);

    const found = await teacher.get("/api/questions?q=Numeric%20correct");
    expect(found.body.questions[0].correctOptionIndex).toBe(2);
  });
});

describe("CSV error handling — one bad row never sinks the batch", () => {
  it("creates the good rows and explains every skipped one", async () => {
    const csv = [
      "subject,question,optionA,optionB,optionC,optionD,correct,difficulty",
      "Physics,Good question one,A,B,C,D,A,easy", // fine
      ",Missing subject,A,B,C,D,A,easy", // no subject
      "Astrology,Unknown subject,A,B,C,D,A,easy", // subject not in this school
      "Physics,,A,B,C,D,A,easy", // no question text
      "Physics,Missing option C,A,B,,D,A,easy", // blank option
      "Physics,All options blank,,,,,A,easy", // every option blank
      "Physics,Bad correct letter,A,B,C,D,Z,easy", // not A-D
      "Physics,Missing correct,A,B,C,D,,easy", // no correct column value
      "Physics,Bad difficulty,A,B,C,D,A,impossible", // not a difficulty
      "Physics,Good question two,A,B,C,D,D,hard", // fine
      "",
    ].join("\n");

    const res = await teacher.post("/api/questions/bulk", { csv });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(2);
    expect(res.body.skipped).toBe(8);

    const reasonFor = (question: string) =>
      res.body.results.find((r: { question: string }) => r.question === question)
        ?.reason;

    expect(reasonFor("Missing subject")).toMatch(/missing a subject/i);
    expect(reasonFor("Unknown subject")).toMatch(/no subject called "Astrology"/i);
    expect(reasonFor("")).toMatch(/missing the question text/i);
    expect(reasonFor("Missing option C")).toMatch(/option C is empty/i);
    expect(reasonFor("All options blank")).toMatch(/all four options are empty/i);
    expect(reasonFor("Bad correct letter")).toMatch(/isn't a correct option.*A, B, C or D/i);
    expect(reasonFor("Missing correct")).toMatch(/missing the correct option/i);
    expect(reasonFor("Bad difficulty")).toMatch(/isn't a difficulty.*easy, medium or hard/i);

    // Every result carries the line it came from.
    for (const row of res.body.results) {
      expect(typeof row.line).toBe("number");
      expect(row.line).toBeGreaterThan(1);
    }
  }, 60_000);

  it("names a missing column rather than failing vaguely", async () => {
    const res = await teacher.post("/api/questions/bulk", {
      csv: "subject,question,optionA,optionB,optionC,optionD,correct\nPhysics,No difficulty column,A,B,C,D,A\n",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/difficulty/);
  });

  it("refuses a file over the row cap instead of timing out", async () => {
    const lines = ["subject,question,optionA,optionB,optionC,optionD,correct,difficulty"];
    for (let i = 0; i < 501; i++) {
      lines.push(`Physics,Bulk ${i},A,B,C,D,A,easy`);
    }

    const res = await teacher.post("/api/questions/bulk", { csv: lines.join("\n") });

    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/at most 500/i);
  });
});

describe("filtering and search actually narrow the list", () => {
  it("pages rather than returning everything at once", async () => {
    const res = await teacher.get("/api/questions");

    expect(res.body.questions.length).toBe(res.body.pageSize);
    expect(res.body.total).toBeGreaterThan(res.body.pageSize);
    expect(res.body.pageCount).toBeGreaterThan(1);
  });

  it("returns different questions on page 2", async () => {
    const one = await teacher.get("/api/questions?page=1");
    const two = await teacher.get("/api/questions?page=2");

    const idsOne = one.body.questions.map((q: { id: string }) => q.id);
    const idsTwo = two.body.questions.map((q: { id: string }) => q.id);

    expect(idsTwo.some((id: string) => idsOne.includes(id))).toBe(false);
  });

  it("filters by subject", async () => {
    const res = await teacher.get(`/api/questions?subjectId=${historyId}`);

    expect(res.body.total).toBeGreaterThan(0);
    expect(
      res.body.questions.every(
        (q: { subjectName: string }) => q.subjectName === "History"
      )
    ).toBe(true);

    const all = await teacher.get("/api/questions");
    expect(res.body.total).toBeLessThan(all.body.total);
  });

  it("filters by difficulty", async () => {
    const res = await teacher.get("/api/questions?difficulty=hard");

    expect(res.body.total).toBeGreaterThan(0);
    expect(
      res.body.questions.every((q: { difficulty: string }) => q.difficulty === "hard")
    ).toBe(true);
  });

  it("searches question text", async () => {
    const res = await teacher.get("/api/questions?q=SI%20unit%20of%20force");

    expect(res.body.total).toBe(1);
    expect(res.body.questions[0].text).toMatch(/SI unit of force/);
  });

  it("combines subject, difficulty and search", async () => {
    const res = await teacher.get(
      `/api/questions?subjectId=${physicsId}&difficulty=easy&q=Imported`
    );

    expect(res.body.total).toBeGreaterThan(0);
    expect(
      res.body.questions.every(
        (q: { subjectName: string; difficulty: string; text: string }) =>
          q.subjectName === "Physics" &&
          q.difficulty === "easy" &&
          q.text.includes("Imported")
      )
    ).toBe(true);
  });

  it("treats the search term as text, not a regular expression", async () => {
    // An unescaped ".*" would match every question in the bank.
    const res = await teacher.get("/api/questions?q=.*");
    expect(res.body.total).toBe(0);
  });

  it("returns nothing for a search that matches nothing", async () => {
    const res = await teacher.get("/api/questions?q=zzzznothinghere");

    expect(res.body.total).toBe(0);
    expect(res.body.questions).toEqual([]);
  });
});

describe("editing and deleting", () => {
  it("edits a question and the change sticks", async () => {
    const created = await teacher.post("/api/questions", {
      subjectId: physicsId,
      text: "Original wording",
      options: ["A", "B", "C", "D"],
      correctOptionIndex: 0,
      difficulty: "easy",
    });
    const id = created.body.question.id;

    const res = await teacher.patch(`/api/questions/${id}`, {
      subjectId: historyId,
      text: "Rewritten wording",
      options: ["W", "X", "Y", "Z"],
      correctOptionIndex: 3,
      difficulty: "hard",
    });

    expect(res.status).toBe(200);
    expect(res.body.question.text).toBe("Rewritten wording");
    expect(res.body.question.correctOptionIndex).toBe(3);
    expect(res.body.question.subjectName).toBe("History");
  });

  it("rejects an edit that would leave three options", async () => {
    const created = await teacher.post("/api/questions", {
      subjectId: physicsId,
      text: "Will not be broken",
      options: ["A", "B", "C", "D"],
      correctOptionIndex: 0,
      difficulty: "easy",
    });

    const res = await teacher.patch(`/api/questions/${created.body.question.id}`, {
      subjectId: physicsId,
      text: "Will not be broken",
      options: ["A", "B", "C"],
      correctOptionIndex: 0,
      difficulty: "easy",
    });

    expect(res.status).toBe(400);
  });

  it("deletes a question and drops the subject's count", async () => {
    const created = await teacher.post("/api/questions", {
      subjectId: historyId,
      text: "Doomed question",
      options: ["A", "B", "C", "D"],
      correctOptionIndex: 0,
      difficulty: "easy",
    });

    const before = await teacher.get("/api/questions/summary");
    const countBefore = before.body.subjects.find(
      (s: { subjectName: string }) => s.subjectName === "History"
    ).count;

    const res = await teacher.request(`/api/questions/${created.body.question.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);

    const after = await teacher.get("/api/questions/summary");
    const countAfter = after.body.subjects.find(
      (s: { subjectName: string }) => s.subjectName === "History"
    ).count;

    expect(countAfter).toBe(countBefore - 1);
  });

  it("returns 404 for an id that does not exist", async () => {
    const res = await teacher.request("/api/questions/0123456789abcdef01234567", {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
  });
});

describe("students never reach the question bank", () => {
  it("refuses every question endpoint with 403", async () => {
    const attempts = await Promise.all([
      student.get("/api/questions"),
      student.get("/api/questions/summary"),
      student.post("/api/questions", {
        subjectId: physicsId,
        text: "Student-written question",
        options: ["A", "B", "C", "D"],
        correctOptionIndex: 0,
        difficulty: "easy",
      }),
      student.post("/api/questions/bulk", { csv: "subject\n" }),
      student.post("/api/uploads/question-image", {}),
    ]);

    for (const res of attempts) {
      expect(res.status).toBe(403);
    }
  });

  it("bounces a student who types the question-bank URL", async () => {
    const res = await student.get("/teacher/question-bank");

    // Server-side redirect, not a rendered page.
    expect([302, 303, 307]).toContain(res.status);
    expect(res.headers.get("location")).toContain("/student");
    expect(String(res.body)).not.toContain("SI unit of force");
  });

  it("refuses a caller with no session at all", async () => {
    const anon = new Client(harness.baseUrl);

    expect((await anon.get("/api/questions")).status).toBe(401);
    expect((await anon.get("/api/questions/summary")).status).toBe(401);
  });
});

describe("admins can use the bank too", () => {
  it("lets an admin list and write questions", async () => {
    const list = await admin.get("/api/questions");
    expect(list.status).toBe(200);
    expect(list.body.total).toBeGreaterThan(0);

    const created = await admin.post("/api/questions", {
      subjectId: physicsId,
      text: "Written by the admin",
      options: ["A", "B", "C", "D"],
      correctOptionIndex: 1,
      difficulty: "medium",
    });
    expect(created.status).toBe(201);
  });

  it("lets an admin open /teacher/question-bank", async () => {
    const res = await admin.get("/teacher/question-bank");
    expect(res.status).toBe(200);
  });

  it("still sends an admin away from the teacher home", async () => {
    const res = await admin.get("/teacher");

    expect([302, 303, 307]).toContain(res.status);
    expect(res.headers.get("location")).toContain("/admin");
  });
});

describe("one school cannot touch another's questions", () => {
  it("shows each school only its own", async () => {
    const mine = await teacher.get("/api/questions?q=Northgate-only");
    expect(mine.body.total).toBe(0);

    const theirs = await other.get("/api/questions");
    expect(theirs.body.total).toBe(1);
  });

  it("returns 404 reading another school's question by its real id", async () => {
    const res = await teacher.patch(`/api/questions/${otherQuestionId}`, {
      subjectId: physicsId,
      text: "Owned by Riverbend now",
      options: ["A", "B", "C", "D"],
      correctOptionIndex: 0,
      difficulty: "easy",
    });

    expect(res.status).toBe(404);

    // Northgate's question is untouched.
    const check = await other.get("/api/questions");
    expect(check.body.questions[0].text).toBe("A Northgate-only question");
  });

  it("returns 404 deleting another school's question", async () => {
    const res = await teacher.request(`/api/questions/${otherQuestionId}`, {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
    expect((await other.get("/api/questions")).body.total).toBe(1);
  });

  it("ignores another school's subjectId used as a filter", async () => {
    const res = await teacher.get(`/api/questions?subjectId=${otherSubjectId}`);

    // The school filter goes on first, so this narrows to nothing rather than
    // reaching into Northgate.
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it("will not import questions into another school's subject", async () => {
    const res = await other.post("/api/questions/bulk", {
      csv: "subject,question,optionA,optionB,optionC,optionD,correct,difficulty\nPhysics,Sneaky,A,B,C,D,A,easy\n",
    });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(0);
    expect(res.body.results[0].reason).toMatch(/no subject called "Physics"/i);
  });

  it("keeps each school's summary to itself", async () => {
    const theirs = await other.get("/api/questions/summary");

    expect(theirs.body.subjects).toHaveLength(1);
    expect(theirs.body.subjects[0].subjectName).toBe("Northgate Physics");
  });
});

describe("a valid token whose account is gone", () => {
  /*
   * Regression: /login sent a signed-in visitor to their role home, which
   * could not find the user and sent them straight back to /login. The browser
   * looped until it gave up. Found by pointing a dev server at a different
   * database with a live cookie still in the browser — but it happens in
   * production too, any time an account is removed while its session is alive.
   */
  it("shows the login page instead of bouncing in a loop", async () => {
    // A correctly signed, unexpired session naming a user that is not there.
    const orphan = await new SignJWT({
      schoolId: "0123456789abcdef01234567",
      role: "admin",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("0123456789abcdef01234567")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(
        new TextEncoder().encode("test-secret-that-is-definitely-long-enough-32+")
      );

    const orphaned = new Client(harness.baseUrl);
    orphaned.setCookie("sotm_session", orphan);

    const res = await orphaned.get("/login");

    expect(res.status).toBe(200);
    expect(String(res.body)).toContain("Sign in");
  });
});
