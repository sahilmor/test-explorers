import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { Client, startHarness, type Harness } from "./harness";

/**
 * Tenant isolation.
 *
 * Two real schools are created through the real signup endpoint. Then School
 * A's admin — holding a genuine, valid session — tries every way we could
 * think of to reach School B's data, over HTTP, against the production build.
 *
 * Every one of those attempts must fail, and must fail without revealing
 * whether the thing it asked for exists.
 */

let harness: Harness;

const SCHOOL_A = {
  schoolName: "Riverbend High",
  name: "Ada Admin",
  email: "ada@riverbend.test",
  password: "correct horse battery",
};

const SCHOOL_B = {
  schoolName: "Northgate Academy",
  name: "Bruno Admin",
  email: "bruno@northgate.test",
  password: "stapler mango velvet",
};

let a: Client; // signed in as School A's admin
let b: Client; // signed in as School B's admin

let schoolAId: string;
let schoolBId: string;
let adminAId: string;
let adminBId: string;
let studentBId: string;

beforeAll(async () => {
  harness = await startHarness();

  a = new Client(harness.baseUrl);
  b = new Client(harness.baseUrl);

  const signupA = await a.post("/api/auth/signup", SCHOOL_A);
  expect(signupA.status, JSON.stringify(signupA.body)).toBe(201);
  schoolAId = signupA.body.school.id;
  adminAId = signupA.body.user.id;

  const signupB = await b.post("/api/auth/signup", SCHOOL_B);
  expect(signupB.status, JSON.stringify(signupB.body)).toBe(201);
  schoolBId = signupB.body.school.id;
  adminBId = signupB.body.user.id;

  // Give School B a student, so A has a second real target to aim at.
  const studentB = await b.post("/api/users", {
    name: "Bea Student",
    email: "bea@northgate.test",
    password: "northgate student pw",
    role: "student",
  });
  expect(studentB.status, JSON.stringify(studentB.body)).toBe(201);
  studentBId = studentB.body.user.id;
}, 180_000);

afterAll(async () => {
  await harness?.stop();
});

describe("setup produced two genuinely separate schools", () => {
  it("gave each school its own id", () => {
    expect(schoolAId).not.toBe(schoolBId);
  });

  it("signed each admin into their own school", async () => {
    const meA = await a.get("/api/me");
    const meB = await b.get("/api/me");

    expect(meA.status).toBe(200);
    expect(meB.status).toBe(200);
    expect(meA.body.school.id).toBe(schoolAId);
    expect(meB.body.school.id).toBe(schoolBId);
    expect(meA.body.user.role).toBe("admin");
  });

  it("created the school and its admin together", async () => {
    // If the transaction had half-failed we would have a school with no admin.
    const users = await a.get("/api/users");
    expect(users.status).toBe(200);
    expect(users.body.users).toHaveLength(1);
    expect(users.body.users[0].email).toBe(SCHOOL_A.email);
    expect(users.body.users[0].role).toBe("admin");
  });
});

describe("School A cannot READ School B's data", () => {
  it("listing users only ever returns School A's people", async () => {
    const res = await a.get("/api/users");

    expect(res.status).toBe(200);
    const emails = res.body.users.map((u: { email: string }) => u.email);
    expect(emails).toContain(SCHOOL_A.email);
    expect(emails).not.toContain(SCHOOL_B.email);
    expect(emails).not.toContain("bea@northgate.test");
  });

  it("fetching School B's admin by their real id returns 404", async () => {
    // A has the exact id — no guessing involved. It still must not resolve.
    const res = await a.get(`/api/users/${adminBId}`);

    expect(res.status).toBe(404);
    expect(res.body.user).toBeUndefined();
  });

  it("fetching School B's student by their real id returns 404", async () => {
    const res = await a.get(`/api/users/${studentBId}`);
    expect(res.status).toBe(404);
  });

  it("returns the same 404 for a real foreign id as for one that does not exist", async () => {
    // Identical responses, so the endpoint cannot be used to test whether an
    // id exists somewhere in the system.
    const foreign = await a.get(`/api/users/${adminBId}`);
    const nonexistent = await a.get("/api/users/0123456789abcdef01234567");

    expect(foreign.status).toBe(nonexistent.status);
    expect(foreign.body).toEqual(nonexistent.body);
  });

  it("cannot widen the query with a schoolId parameter", async () => {
    const res = await a.get(`/api/users?schoolId=${schoolBId}`);

    expect(res.status).toBe(200);
    const emails = res.body.users.map((u: { email: string }) => u.email);
    expect(emails).not.toContain(SCHOOL_B.email);
    expect(emails).toEqual([SCHOOL_A.email]);
  });
});

describe("School A cannot WRITE to School B's data", () => {
  it("cannot rename School B's admin", async () => {
    const res = await a.patch(`/api/users/${adminBId}`, { name: "Owned By A" });
    expect(res.status).toBe(404);

    // And B still sees the original name.
    const check = await b.get(`/api/users/${adminBId}`);
    expect(check.status).toBe(200);
    expect(check.body.user.name).toBe(SCHOOL_B.name);
  });

  it("ignores a schoolId smuggled into a create-user body", async () => {
    const res = await a.post("/api/users", {
      name: "Trojan Teacher",
      email: "trojan@riverbend.test",
      password: "smuggled password",
      role: "teacher",
      schoolId: schoolBId, // the attack
    });

    expect(res.status).toBe(201);
    // Created under A, not B — the body field was ignored, not obeyed.
    expect(res.body.user.schoolId).toBe(schoolAId);

    // B's user list is untouched.
    const bUsers = await b.get("/api/users");
    const bEmails = bUsers.body.users.map((u: { email: string }) => u.email);
    expect(bEmails).not.toContain("trojan@riverbend.test");
  });

  it("ignores schoolId even when it is also in the query string", async () => {
    const res = await a.request(`/api/users?schoolId=${schoolBId}`, {
      method: "POST",
      json: {
        name: "Query Trojan",
        email: "query-trojan@riverbend.test",
        password: "smuggled password",
        role: "student",
        schoolId: schoolBId,
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.user.schoolId).toBe(schoolAId);
  });
});

describe("the session cookie is the only thing that decides schoolId", () => {
  it("rejects requests with no cookie at all", async () => {
    const anonymous = new Client(harness.baseUrl);
    const res = await anonymous.get("/api/users");

    expect(res.status).toBe(401);
  });

  it("rejects a token forged with the wrong secret", async () => {
    // Same shape, same claims, correct school — but signed by an attacker.
    const forged = await new SignJWT({ schoolId: schoolBId, role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(adminBId)
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(new TextEncoder().encode("an-attackers-secret-also-long-enough-32"));

    const attacker = new Client(harness.baseUrl);
    attacker.setCookie("sotm_session", forged);

    const res = await attacker.get("/api/users");
    expect(res.status).toBe(401);
  });

  it("rejects an expired token even though it is correctly signed", async () => {
    const expired = await new SignJWT({ schoolId: schoolAId, role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(adminAId)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(new TextEncoder().encode("test-secret-that-is-definitely-long-enough-32+"));

    const stale = new Client(harness.baseUrl);
    stale.setCookie("sotm_session", expired);

    const res = await stale.get("/api/users");
    expect(res.status).toBe(401);
  });

  it("rejects a tampered payload in an otherwise real token", async () => {
    // Take A's genuine cookie and swap the middle segment for one claiming B.
    const real = a.cookie("sotm_session")!;
    expect(real).toBeTruthy();

    const [header, , signature] = real.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        sub: adminBId,
        schoolId: schoolBId,
        role: "admin",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString("base64url");

    const attacker = new Client(harness.baseUrl);
    attacker.setCookie("sotm_session", `${header}.${tamperedPayload}.${signature}`);

    const res = await attacker.get("/api/users");
    expect(res.status).toBe(401);
  });
});

describe("roles are enforced server-side", () => {
  const studentA = { email: "sam@riverbend.test", password: "student password a" };

  beforeAll(async () => {
    const created = await a.post("/api/users", {
      name: "Sam Student",
      email: studentA.email,
      password: studentA.password,
      role: "student",
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
  });

  it("sends each role to its own area on login", async () => {
    const student = new Client(harness.baseUrl);
    const res = await student.post("/api/auth/login", studentA);

    expect(res.status).toBe(200);
    expect(res.body.redirectTo).toBe("/student");
  });

  it("bounces a student who types /admin into the address bar", async () => {
    const student = new Client(harness.baseUrl);
    await student.post("/api/auth/login", studentA);

    const res = await student.get("/admin");

    // Server-side redirect, not a rendered admin page.
    expect([302, 303, 307]).toContain(res.status);
    expect(res.headers.get("location")).toContain("/student");
  });

  it("lets the admin into /admin", async () => {
    const res = await a.get("/admin");
    expect(res.status).toBe(200);
  });

  it("refuses to let a student create users", async () => {
    const student = new Client(harness.baseUrl);
    await student.post("/api/auth/login", studentA);

    const res = await student.post("/api/users", {
      name: "Self Promoted",
      email: "promoted@riverbend.test",
      password: "should not work",
      role: "admin",
    });

    expect(res.status).toBe(403);
  });
});

describe("logout", () => {
  it("clears the cookie and the session stops working", async () => {
    const session = new Client(harness.baseUrl);
    await session.post("/api/auth/login", {
      email: SCHOOL_A.email,
      password: SCHOOL_A.password,
    });

    expect((await session.get("/api/me")).status).toBe(200);

    const out = await session.post("/api/auth/logout");
    expect(out.status).toBe(200);
    expect(session.cookie("sotm_session")).toBeUndefined();

    expect((await session.get("/api/me")).status).toBe(401);
  });
});

describe("the forms are safe when JavaScript has not run", () => {
  /*
   * A <form> with no method submits as GET, which would put the password in
   * the URL, the server log, browser history and the Referer header. These
   * tests exercise exactly what an unhydrated browser sends: a plain
   * form-encoded POST.
   */

  async function formPost(client: Client, path: string, fields: Record<string, string>) {
    return client.request(path, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    });
  }

  it("signs up from a plain form POST and redirects to the admin area", async () => {
    const client = new Client(harness.baseUrl);

    const res = await formPost(client, "/api/auth/signup", {
      schoolName: "No JavaScript Grammar",
      name: "Nell Nojs",
      email: "nell@nojs.test",
      password: "works without js",
    });

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/admin");
    expect(client.cookie("sotm_session")).toBeTruthy();

    // The session it issued is real.
    const me = await client.get("/api/me");
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("nell@nojs.test");
  });

  it("logs in from a plain form POST", async () => {
    const client = new Client(harness.baseUrl);

    const res = await formPost(client, "/api/auth/login", {
      email: "nell@nojs.test",
      password: "works without js",
    });

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/admin");
  });

  it("bounces a failed form login back to /login without echoing the password", async () => {
    const client = new Client(harness.baseUrl);

    const res = await formPost(client, "/api/auth/login", {
      email: "nell@nojs.test",
      password: "the wrong password",
    });

    expect(res.status).toBe(303);
    const location = res.headers.get("location")!;
    expect(location).toContain("/login");
    expect(location).toContain("error=bad");
    // The thing that actually matters: no credentials in the URL.
    expect(location).not.toContain("the wrong password");
    expect(location).not.toContain("nell@nojs.test");
  });
});

describe("login does not leak which emails exist", () => {
  it("gives the same answer for a wrong password and an unknown account", async () => {
    const client = new Client(harness.baseUrl);

    const wrongPassword = await client.post("/api/auth/login", {
      email: SCHOOL_A.email,
      password: "not the right password",
    });
    const unknownEmail = await client.post("/api/auth/login", {
      email: "nobody@nowhere.test",
      password: "not the right password",
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });
});

describe("a school cannot reach a checkout", () => {
  /**
   * Plans are sold outside the app and set by a super-admin, so self-serve
   * billing is off by default (lib/billing-access.ts) and no school-facing
   * route reaches Razorpay. This harness does not enable it, which is the
   * production configuration.
   *
   * The integration itself is still exercised — tests/billing.test.ts turns
   * the flag on and keeps it honest — so "dormant" does not decay into
   * "broken".
   */
  it("answers 404, not 403, for the order and verify routes", async () => {
    // 403 would confirm the endpoint is there and merely forbidden, which is
    // information a school has no use for.
    expect((await a.post("/api/billing/order")).status).toBe(404);
    expect(
      (await a.post("/api/billing/verify", {
        razorpay_order_id: "order_whatever",
        cancelled: true,
      })).status
    ).toBe(404);
  });

  it("does not offer a way in from the dashboard", async () => {
    const dashboard = await a.get("/admin");

    expect(dashboard.status).toBe(200);
    // No link to a billing page, and no purchase language.
    expect(dashboard.body).not.toContain("/admin/billing");
    expect(dashboard.body).not.toContain("Upgrade");
  });

  it("has no billing page left to find", async () => {
    expect((await a.get("/admin/billing")).status).toBe(404);
  });

  it("still accepts webhooks, because Razorpay is not a school", async () => {
    // A payment taken out-of-band must still be recordable. The webhook is
    // authenticated by signature rather than by a session, so switching
    // self-serve off does not touch it — it refuses on the signature, which
    // is its own guard, not on the flag.
    const response = await fetch(`${harness.baseUrl}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": "not-a-real-signature",
      },
      body: JSON.stringify({ event: "payment.captured", payload: {} }),
    });

    expect(response.status).not.toBe(404);
    expect([400, 501]).toContain(response.status);
  });
});
