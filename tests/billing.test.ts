import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId } from "mongodb";
import {
  Client,
  startHarness,
  TEST_OWNER_EMAIL,
  TEST_RAZORPAY_WEBHOOK_SECRET,
  type Harness,
} from "./harness";
import { RazorpayStub, webhookSignature } from "./razorpay-stub";

/**
 * Billing, and the enforcement that makes it mean something.
 *
 * The failure this file exists to prevent is a complete billing data model
 * that never changes what anyone can do — plans and prices and a history
 * array, with every feature still wide open. So the claims here are, in order
 * of how much they would cost to get wrong:
 *
 *  1. A verified payment actually changes the school: plan, validity and cap.
 *  2. An *unverified* one does not. A forged signature, a declined card and a
 *     short payment all leave the school exactly as it was.
 *  3. Applying the same payment twice does not buy two years. Razorpay sends
 *     the callback and the webhook for the same money, and retries webhooks.
 *  4. Expiry and the student cap really block the three growth actions, and
 *     really do not block reads or a sitting already in progress.
 *  5. The owner view reads across tenants, and nobody else can open it.
 *
 * The payment flow runs against a stub Razorpay over real HTTP — see
 * tests/razorpay-stub.ts. Nothing inside the app is mocked, and every
 * signature is computed with the same HMAC production uses.
 */

const ANNUAL_PAISE = 999_900;
const ANNUAL_MAX_STUDENTS = 500;
const TRIAL_MAX_STUDENTS = 50;

let harness: Harness;
let mongo: MongoClient;
let stub: RazorpayStub;

let admin: Client;
let teacher: Client;
let schoolId = "";
let sectionId = "";
let subjectId = "";
let questionIds: string[] = [];

function db() {
  return mongo.db("sotm_test");
}

async function schoolDoc(id = schoolId) {
  return db().collection("schools").findOne({ _id: new ObjectId(id) });
}

/** Drags a school's plan validity into the past, the way real time would. */
async function expireSchool(id = schoolId) {
  await db()
    .collection("schools")
    .updateOne(
      { _id: new ObjectId(id) },
      { $set: { planValidUntil: new Date(Date.now() - 60_000) } }
    );
}

async function restoreTrial(id = schoolId, days = 30) {
  await db()
    .collection("schools")
    .updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          plan: "trial",
          planValidUntil: new Date(Date.now() + days * 86_400_000),
          maxStudents: TRIAL_MAX_STUDENTS,
        },
      }
    );
}

/** Signs up a school and returns its admin client plus the school id. */
async function signUpSchool(name: string, email: string) {
  const client = new Client(harness.baseUrl);
  const res = await client.post("/api/auth/signup", {
    schoolName: name,
    name: "An Admin",
    email,
    password: "a-long-enough-password",
  });
  expect(res.status, JSON.stringify(res.body)).toBeLessThan(400);

  const school = await db().collection("schools").findOne({ name });
  return { client, schoolId: String(school!._id) };
}

async function makeTest(client: Client, title: string, opts: { closesInSec?: number } = {}) {
  return client.post("/api/tests", {
    title,
    subjectId,
    durationMinutes: 60,
    questionIds: questionIds.slice(0, 3),
    opensAt: new Date(Date.now() - 60_000).toISOString(),
    closesAt: new Date(Date.now() + (opts.closesInSec ?? 7200) * 1000).toISOString(),
    sectionIds: [sectionId],
    publish: true,
  });
}

/** Posts a webhook exactly as Razorpay would, signature and all. */
async function sendWebhook(
  event: string,
  payment: Record<string, unknown>,
  options: { secret?: string } = {}
) {
  const raw = JSON.stringify({ event, payload: { payment: { entity: payment } } });

  const response = await fetch(`${harness.baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-razorpay-signature": webhookSignature(
        raw,
        options.secret ?? TEST_RAZORPAY_WEBHOOK_SECRET
      ),
    },
    body: raw,
  });

  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

beforeAll(async () => {
  stub = new RazorpayStub("harness-key-secret");
  const apiBase = await stub.start();

  // Self-serve checkout is off for schools by default; this suite exists to
  // keep the dormant integration honest, so it opts in.
  harness = await startHarness({ razorpayApiBase: apiBase, selfServeBilling: true });
  mongo = new MongoClient(harness.mongoUri);
  await mongo.connect();

  const signedUp = await signUpSchool("Billing High", "billing-admin@riverbend.test");
  admin = signedUp.client;
  schoolId = signedUp.schoolId;

  sectionId = (
    await admin.post("/api/sections", { name: "Grade 9 - Bill", grade: 9 })
  ).body.section.id;
  subjectId = (await admin.post("/api/subjects", { name: "Physics" })).body.subject.id;

  await admin.post("/api/teachers", {
    name: "Billing Teacher",
    email: "billing-teacher@riverbend.test",
    password: "teacher password",
  });
  teacher = new Client(harness.baseUrl);
  await teacher.post("/api/auth/login", {
    email: "billing-teacher@riverbend.test",
    password: "teacher password",
  });

  const rows = ["subject,question,optionA,optionB,optionC,optionD,correct,difficulty"];
  for (let i = 0; i < 5; i++) {
    rows.push(`Physics,Question ${i}?,A${i},B${i},C${i},D${i},A,easy`);
  }
  expect((await teacher.post("/api/questions/bulk", { csv: rows.join("\n") + "\n" })).body.created).toBe(5);

  questionIds = (
    await teacher.get(`/api/questions?subjectId=${subjectId}&pageSize=50`)
  ).body.questions.map((q: { id: string }) => q.id);
}, 180_000);

afterAll(async () => {
  await mongo?.close();
  await harness?.stop();
  await stub?.stop();
});

// ---------------------------------------------------------------------------

describe("what a new school gets", () => {
  it("starts on a trial with a real end date and a real cap", async () => {
    const school = await schoolDoc();

    expect(school!.plan).toBe("trial");
    expect(school!.maxStudents).toBe(TRIAL_MAX_STUDENTS);
    expect(school!.planValidUntil).toBeInstanceOf(Date);
    expect(school!.planValidUntil.getTime()).toBeGreaterThan(Date.now());
    expect(school!.subscriptionHistory).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe("the student cap", () => {
  it("fills the trial's places and then refuses, saying why", async () => {
    const { client, schoolId: capSchool } = await signUpSchool(
      "Cap High",
      "cap-admin@caphigh.test"
    );
    const section = (
      await client.post("/api/sections", { name: "Cap 9", grade: 9 })
    ).body.section.id;

    // One admin already exists, but the cap counts students only.
    const csv = ["name,email,section"];
    for (let i = 0; i < TRIAL_MAX_STUDENTS; i++) {
      csv.push(`Student ${i},cap${i}@caphigh.test,Cap 9`);
    }

    const filled = await client.post("/api/students/bulk", { csv: csv.join("\n") + "\n" });
    expect(filled.status).toBe(200);
    expect(filled.body.created).toBe(TRIAL_MAX_STUDENTS);

    const overflow = await client.post("/api/students", {
      name: "One Too Many",
      email: "overflow@caphigh.test",
      sectionId: section,
      password: "student password",
    });

    expect(overflow.status).toBe(402);
    expect(overflow.body.planBlock?.reason).toBe("student_cap");
    // The message has to carry the numbers, not just say "no".
    expect(overflow.body.error).toContain(String(TRIAL_MAX_STUDENTS));
    expect(overflow.body.error).toContain(String(ANNUAL_MAX_STUDENTS));

    // And nothing was written.
    const count = await db()
      .collection("users")
      .countDocuments({ schoolId: new ObjectId(capSchool), role: "student" });
    expect(count).toBe(TRIAL_MAX_STUDENTS);
  });

  it("an import fills the places that are left and skips the rest with a reason", async () => {
    const { client } = await signUpSchool("Partial High", "partial-admin@partial.test");
    await client.post("/api/sections", { name: "Part 9", grade: 9 });

    // Three places short of the cap.
    const first = ["name,email,section"];
    for (let i = 0; i < TRIAL_MAX_STUDENTS - 3; i++) {
      first.push(`Early ${i},early${i}@partial.test,Part 9`);
    }
    expect((await client.post("/api/students/bulk", { csv: first.join("\n") + "\n" })).body.created)
      .toBe(TRIAL_MAX_STUDENTS - 3);

    const second = ["name,email,section"];
    for (let i = 0; i < 10; i++) {
      second.push(`Late ${i},late${i}@partial.test,Part 9`);
    }

    const res = await client.post("/api/students/bulk", { csv: second.join("\n") + "\n" });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(3);
    expect(res.body.skipped).toBe(7);

    const reasons: string[] = res.body.results
      .filter((r: { status: string }) => r.status === "skipped")
      .map((r: { reason: string }) => r.reason);

    expect(reasons).toHaveLength(7);
    for (const reason of reasons) {
      expect(reason).toContain(String(TRIAL_MAX_STUDENTS));
    }
  });
});

// ---------------------------------------------------------------------------

describe("an expired plan", () => {
  it("blocks setting a paper, adding a student, and starting a sitting", async () => {
    await expireSchool();

    const paper = await makeTest(teacher, "Should not exist");
    expect(paper.status).toBe(402);
    expect(paper.body.planBlock?.reason).toBe("expired");

    const student = await admin.post("/api/students", {
      name: "Blocked Student",
      email: "blocked@riverbend.test",
      sectionId,
      password: "student password",
    });
    expect(student.status).toBe(402);
    expect(student.body.planBlock?.reason).toBe("expired");

    const imported = await admin.post("/api/students/bulk", {
      csv: "name,email,section\nBulk Blocked,bulkblocked@riverbend.test,Grade 9 - Bill\n",
    });
    expect(imported.status).toBe(402);

    await restoreTrial();
  });

  it("leaves reading alone — this is a pause, not a lockout", async () => {
    // Something to read, made while the plan was still good.
    const paper = await makeTest(teacher, "Readable paper");
    expect(paper.status).toBe(201);

    await expireSchool();

    expect((await teacher.get("/api/tests")).status).toBe(200);
    expect((await admin.get("/api/students")).status).toBe(200);
    expect((await admin.get("/api/sections")).status).toBe(200);
    expect((await teacher.get(`/api/questions?subjectId=${subjectId}`)).status).toBe(200);

    const tests = await teacher.get("/api/tests");
    expect(tests.body.tests.length).toBeGreaterThan(0);

    await restoreTrial();
  });

  it("does not strand a student already sitting a paper", async () => {
    const paper = await makeTest(teacher, "Mid-sitting expiry");
    const testId = paper.body.test.id;

    const created = await admin.post("/api/students", {
      name: "Mid Sitting",
      email: "midsitting@riverbend.test",
      sectionId,
      password: "student password",
    });
    expect(created.status).toBe(201);

    const student = new Client(harness.baseUrl);
    await student.post("/api/auth/login", {
      email: "midsitting@riverbend.test",
      password: "student password",
    });

    const started = await student.post("/api/attempts/start", { testId });
    expect(started.status).toBe(200);

    // The invoice lapses mid-paper. Their work is their work.
    await expireSchool();

    const saved = await student.patch(`/api/attempts/${testId}/responses`, {
      responses: [
        {
          questionId: started.body.test.questions[0].id,
          selectedOptionIndex: 0,
          markedForReview: false,
        },
      ],
    });
    expect(saved.status).toBe(200);

    const submitted = await student.post(`/api/attempts/${testId}/submit`);
    expect(submitted.status).toBe(200);

    const attempt = await db()
      .collection("attempts")
      .findOne({ testId: new ObjectId(testId) });
    expect(attempt!.status).toBe("submitted");
    // Graded, too — Phase 6's guarantee survives Phase 7's gate.
    expect(attempt!.gradedAt).toBeInstanceOf(Date);

    await restoreTrial();
  });

  it("refuses a *new* sitting with an explanation rather than a 404", async () => {
    const paper = await makeTest(teacher, "No new sittings");
    const testId = paper.body.test.id;

    const created = await admin.post("/api/students", {
      name: "Late Starter",
      email: "latestarter@riverbend.test",
      sectionId,
      password: "student password",
    });
    expect(created.status).toBe(201);

    const student = new Client(harness.baseUrl);
    await student.post("/api/auth/login", {
      email: "latestarter@riverbend.test",
      password: "student password",
    });

    await expireSchool();

    const blocked = await student.post("/api/attempts/start", { testId });

    expect(blocked.status).toBe(402);
    expect(blocked.body.planBlock?.reason).toBe("expired");
    // A student is not the one who pays, so the message must not read as
    // their fault or send them to a billing page.
    expect(blocked.body.error).toMatch(/teacher/i);

    const attempts = await db()
      .collection("attempts")
      .countDocuments({ testId: new ObjectId(testId) });
    expect(attempts).toBe(0);

    await restoreTrial();
  });
});

// ---------------------------------------------------------------------------

describe("paying", () => {
  it("opens an order for the plan's own amount, not one from the request", async () => {
    const res = await admin.post("/api/billing/order");

    expect(res.status).toBe(201);
    expect(res.body.order.amountPaise).toBe(ANNUAL_PAISE);
    expect(res.body.order.currency).toBe("INR");
    expect(res.body.order.testMode).toBe(true);

    const sent = stub.createdOrders.at(-1)!;
    expect(sent.amount).toBe(ANNUAL_PAISE);
    expect(sent.notes.schoolId).toBe(schoolId);

    // Recorded as started, so an abandoned order still explains itself later.
    const school = await schoolDoc();
    const entry = school!.subscriptionHistory.at(-1);
    expect(entry.status).toBe("created");
    expect(entry.razorpayOrderId).toBe(res.body.order.orderId);
    expect(entry.razorpayPaymentId).toBeNull();
  });

  it("turns a verified payment into an active plan", async () => {
    await restoreTrial();

    const order = (await admin.post("/api/billing/order")).body.order;
    const payment = stub.settle(order.orderId);

    const before = await schoolDoc();

    const res = await admin.post("/api/billing/verify", {
      razorpay_order_id: order.orderId,
      razorpay_payment_id: payment.id,
      razorpay_signature: stub.checkoutSignature(order.orderId, payment.id),
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.activated).toBe(true);

    const school = await schoolDoc();

    expect(school!.plan).toBe("active");
    expect(school!.maxStudents).toBe(ANNUAL_MAX_STUDENTS);
    // A year on, and later than it was.
    expect(school!.planValidUntil.getTime()).toBeGreaterThan(
      before!.planValidUntil.getTime()
    );

    const entry = school!.subscriptionHistory.find(
      (e: { razorpayOrderId: string }) => e.razorpayOrderId === order.orderId
    );
    expect(entry.status).toBe("captured");
    expect(entry.razorpayPaymentId).toBe(payment.id);
    expect(entry.amount).toBe(ANNUAL_PAISE);
  });

  it("lets a paid school do the things an expired one could not", async () => {
    const paper = await makeTest(teacher, "Paid for this one");
    expect(paper.status).toBe(201);

    const student = await admin.post("/api/students", {
      name: "Paid Student",
      email: "paidstudent@riverbend.test",
      sectionId,
      password: "student password",
    });
    expect(student.status).toBe(201);
  });

  it("does not sell two years for one payment", async () => {
    const school = await schoolDoc();
    const paid = school!.subscriptionHistory.find(
      (e: { status: string }) => e.status === "captured"
    );

    const validUntilBefore = school!.planValidUntil.getTime();

    // The webhook for the payment the callback already applied.
    const replay = await sendWebhook("payment.captured", {
      id: paid.razorpayPaymentId,
      order_id: paid.razorpayOrderId,
      amount: ANNUAL_PAISE,
      currency: "INR",
    });

    expect(replay.status).toBe(200);
    expect(replay.body.alreadyApplied).toBe(true);

    const after = await schoolDoc();
    expect(after!.planValidUntil.getTime()).toBe(validUntilBefore);
    expect(
      after!.subscriptionHistory.filter((e: { status: string }) => e.status === "captured")
    ).toHaveLength(1);
  });

  it("renews from the end of the current term, not from today", async () => {
    const before = await schoolDoc();
    const runsUntil = before!.planValidUntil.getTime();

    const order = (await admin.post("/api/billing/order")).body.order;
    const payment = stub.settle(order.orderId);

    await admin.post("/api/billing/verify", {
      razorpay_order_id: order.orderId,
      razorpay_payment_id: payment.id,
      razorpay_signature: stub.checkoutSignature(order.orderId, payment.id),
    });

    const after = await schoolDoc();

    // Roughly a year past where it already ran to, not a year from now.
    const added = after!.planValidUntil.getTime() - runsUntil;
    expect(added).toBeGreaterThan(360 * 86_400_000);
    expect(added).toBeLessThan(370 * 86_400_000);
  });
});

// ---------------------------------------------------------------------------

describe("payments that must change nothing", () => {
  it("refuses a forged checkout signature", async () => {
    const { client, schoolId: forgedSchool } = await signUpSchool(
      "Forgery High",
      "forgery-admin@forgery.test"
    );

    const order = (await client.post("/api/billing/order")).body.order;
    const payment = stub.settle(order.orderId);

    const res = await client.post("/api/billing/verify", {
      razorpay_order_id: order.orderId,
      razorpay_payment_id: payment.id,
      // What an attacker can produce without the key secret: anything at all.
      razorpay_signature: "0".repeat(64),
    });

    expect(res.status).toBe(400);

    const school = await schoolDoc(forgedSchool);
    expect(school!.plan).toBe("trial");
    expect(school!.maxStudents).toBe(TRIAL_MAX_STUDENTS);
    expect(
      school!.subscriptionHistory.find(
        (e: { razorpayOrderId: string }) => e.razorpayOrderId === order.orderId
      ).status
    ).toBe("failed");
  });

  it("refuses a declined card", async () => {
    const { client, schoolId: declinedSchool } = await signUpSchool(
      "Declined High",
      "declined-admin@declined.test"
    );

    const order = (await client.post("/api/billing/order")).body.order;
    const payment = stub.settle(order.orderId, {
      status: "failed",
      errorDescription: "Your card was declined.",
    });

    const res = await client.post("/api/billing/verify", {
      razorpay_order_id: order.orderId,
      razorpay_payment_id: payment.id,
      razorpay_signature: stub.checkoutSignature(order.orderId, payment.id),
    });

    expect(res.status).toBe(402);

    const school = await schoolDoc(declinedSchool);
    expect(school!.plan).toBe("trial");

    const entry = school!.subscriptionHistory.find(
      (e: { razorpayOrderId: string }) => e.razorpayOrderId === order.orderId
    );
    expect(entry.status).toBe("failed");
    expect(entry.failureReason).toContain("declined");
  });

  it("refuses a payment for less than the plan costs", async () => {
    const { client, schoolId: shortSchool } = await signUpSchool(
      "Short High",
      "short-admin@short.test"
    );

    const order = (await client.post("/api/billing/order")).body.order;
    // A valid signature over a real payment — for one rupee.
    const payment = stub.settle(order.orderId, { amount: 100 });

    const res = await client.post("/api/billing/verify", {
      razorpay_order_id: order.orderId,
      razorpay_payment_id: payment.id,
      razorpay_signature: stub.checkoutSignature(order.orderId, payment.id),
    });

    expect(res.status).toBe(400);
    expect((await schoolDoc(shortSchool))!.plan).toBe("trial");
  });

  it("records a cancelled payment without touching the plan", async () => {
    const { client, schoolId: cancelledSchool } = await signUpSchool(
      "Cancelled High",
      "cancelled-admin@cancelled.test"
    );

    const order = (await client.post("/api/billing/order")).body.order;

    const res = await client.post("/api/billing/verify", {
      razorpay_order_id: order.orderId,
      cancelled: true,
      reason: "Closed the payment window.",
    });

    expect(res.status).toBe(200);
    expect(res.body.cancelled).toBe(true);
    expect(res.body.error).toMatch(/nothing was charged/i);

    const school = await schoolDoc(cancelledSchool);
    expect(school!.plan).toBe("trial");
    expect(
      school!.subscriptionHistory.find(
        (e: { razorpayOrderId: string }) => e.razorpayOrderId === order.orderId
      ).status
    ).toBe("failed");
  });

  it("refuses a webhook that isn't signed with the webhook secret", async () => {
    const { client, schoolId: webhookSchool } = await signUpSchool(
      "Webhook High",
      "webhook-admin@webhook.test"
    );

    const order = (await client.post("/api/billing/order")).body.order;
    const payment = stub.settle(order.orderId);

    const res = await sendWebhook(
      "payment.captured",
      {
        id: payment.id,
        order_id: order.orderId,
        amount: ANNUAL_PAISE,
        currency: "INR",
      },
      { secret: "not-the-webhook-secret" }
    );

    expect(res.status).toBe(400);
    expect((await schoolDoc(webhookSchool))!.plan).toBe("trial");
  });

  it("refuses a webhook with no signature at all", async () => {
    const raw = JSON.stringify({ event: "payment.captured", payload: {} });
    const response = await fetch(`${harness.baseUrl}/api/billing/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: raw,
    });

    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------

describe("the webhook on its own", () => {
  it("activates a school whose browser never came back", async () => {
    const { client, schoolId: webhookOnly } = await signUpSchool(
      "Lost Browser High",
      "lostbrowser-admin@lost.test"
    );

    const order = (await client.post("/api/billing/order")).body.order;
    const payment = stub.settle(order.orderId);

    // No call to /api/billing/verify at all — the laptop died.
    const res = await sendWebhook("payment.captured", {
      id: payment.id,
      order_id: order.orderId,
      amount: ANNUAL_PAISE,
      currency: "INR",
    });

    expect(res.status).toBe(200);
    expect(res.body.activated).toBe(true);

    const school = await schoolDoc(webhookOnly);
    expect(school!.plan).toBe("active");
    expect(school!.maxStudents).toBe(ANNUAL_MAX_STUDENTS);
  });

  it("records a failure without disturbing anything", async () => {
    const { client, schoolId: failSchool } = await signUpSchool(
      "Webhook Fail High",
      "webhookfail-admin@wfail.test"
    );

    const order = (await client.post("/api/billing/order")).body.order;

    const res = await sendWebhook("payment.failed", {
      id: "pay_neverworked",
      order_id: order.orderId,
      amount: ANNUAL_PAISE,
      currency: "INR",
      error_description: "Insufficient funds.",
    });

    expect(res.status).toBe(200);

    const school = await schoolDoc(failSchool);
    expect(school!.plan).toBe("trial");
    expect(
      school!.subscriptionHistory.find(
        (e: { razorpayOrderId: string }) => e.razorpayOrderId === order.orderId
      ).failureReason
    ).toContain("Insufficient funds");
  });

  it("acknowledges an event it has no use for rather than asking for a retry", async () => {
    const res = await sendWebhook("subscription.charged", { id: "pay_x" });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------

describe("one school's payment is its own", () => {
  it("cannot be redirected onto another school", async () => {
    const { schoolId: victimSchool } = await signUpSchool(
      "Victim High",
      "victim-admin@victim.test"
    );
    const { client: attacker } = await signUpSchool(
      "Attacker High",
      "attacker-admin@attacker.test"
    );

    // The attacker opens their own order and pays it properly…
    const order = (await attacker.post("/api/billing/order")).body.order;
    const payment = stub.settle(order.orderId);

    await attacker.post("/api/billing/verify", {
      razorpay_order_id: order.orderId,
      razorpay_payment_id: payment.id,
      razorpay_signature: stub.checkoutSignature(order.orderId, payment.id),
    });

    // …which must have done nothing whatsoever to anybody else.
    const victim = await schoolDoc(victimSchool);
    expect(victim!.plan).toBe("trial");
    expect(victim!.maxStudents).toBe(TRIAL_MAX_STUDENTS);
    expect(victim!.subscriptionHistory).toEqual([]);
  });

  it("refuses a payment against an order this school never opened", async () => {
    const { client: outsider } = await signUpSchool(
      "Outsider High",
      "outsider-admin@outsider.test"
    );
    const { client: owner } = await signUpSchool("Owner High", "ownerhigh-admin@ownerhigh.test");

    const order = (await owner.post("/api/billing/order")).body.order;
    const payment = stub.settle(order.orderId);

    // A correct signature, for somebody else's order.
    const res = await outsider.post("/api/billing/verify", {
      razorpay_order_id: order.orderId,
      razorpay_payment_id: payment.id,
      razorpay_signature: stub.checkoutSignature(order.orderId, payment.id),
    });

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------

describe("the platform owner's view", () => {
  let owner: Client;

  beforeAll(async () => {
    const { client } = await signUpSchool("Owner's Own School", TEST_OWNER_EMAIL);
    owner = client;
  });

  it("is a 404 for a signed-out visitor", async () => {
    const stranger = new Client(harness.baseUrl);
    expect((await stranger.get("/api/platform")).status).toBe(404);
  });

  it("is a 404 for an ordinary admin, not a 403", async () => {
    // A 403 would confirm the page is there.
    expect((await admin.get("/api/platform")).status).toBe(404);
  });

  it("is a 404 for a teacher", async () => {
    expect((await teacher.get("/api/platform")).status).toBe(404);
  });

  it("shows every school and counts only money that actually arrived", async () => {
    const res = await owner.get("/api/platform");

    expect(res.status).toBe(200);

    const names: string[] = res.body.schools.map((s: { name: string }) => s.name);
    expect(names).toContain("Billing High");
    expect(names).toContain("Cap High");
    expect(names).toContain("Victim High");

    const billing = res.body.schools.find((s: { name: string }) => s.name === "Billing High");
    expect(billing.plan).toBe("active");
    // Two captures on this school across the tests above.
    expect(billing.revenuePaise).toBe(ANNUAL_PAISE * 2);
    expect(billing.studentCount).toBeGreaterThan(0);

    // A school that only ever opened orders and never completed one is worth
    // nothing, and must not be counted as revenue.
    const cancelled = res.body.schools.find(
      (s: { name: string }) => s.name === "Cancelled High"
    );
    expect(cancelled.revenuePaise).toBe(0);
    expect(cancelled.plan).toBe("trial");

    // The total is the sum of the parts, not a separate guess at it.
    const summed = res.body.schools.reduce(
      (total: number, s: { revenuePaise: number }) => total + s.revenuePaise,
      0
    );
    expect(res.body.totals.revenuePaise).toBe(summed);
    expect(res.body.totals.schools).toBe(res.body.schools.length);
  });

  it("reports a lapsed school as expired even though nothing flipped the field", async () => {
    const { schoolId: lapsed } = await signUpSchool("Lapsed High", "lapsed-admin@lapsed.test");
    await expireSchool(lapsed);

    const res = await owner.get("/api/platform");
    const row = res.body.schools.find((s: { name: string }) => s.name === "Lapsed High");

    // Stored as trial, read as expired. No cron ran in between.
    expect(row.storedPlan).toBe("trial");
    expect(row.plan).toBe("expired");
  });
});
