import { connectToDatabase } from "@/lib/db";
import { SetupError } from "@/lib/errors";
import { ANNUAL_PLAN, addMonths, renewalFrom } from "@/lib/plans";
import {
  createOrder,
  fetchPayment,
  isTestMode,
  requireRazorpayConfig,
  verifyCheckoutSignature,
} from "@/lib/razorpay";
import { reportAlert } from "@/lib/observability";
import School from "@/models/School";

/**
 * Buying a plan.
 *
 * Three things have to hold here, and the rest is detail.
 *
 * 1. The amount comes from `ANNUAL_PLAN`, on the server. Nothing in a request
 *    body influences what is charged.
 * 2. Nothing about the school changes until a signature has been checked
 *    against the key secret. A browser saying "that worked" is not evidence.
 * 3. Activating is idempotent. Razorpay will tell us about the same payment
 *    twice — once when Checkout returns and again by webhook, and again if the
 *    webhook is retried — and a school must not get two years for one payment.
 */

export type UpgradeOrder = {
  orderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
  testMode: boolean;
  schoolName: string;
  planName: string;
};

/** Razorpay caps receipts at 40 characters. */
function receiptFor(schoolId: string): string {
  return `sotm_${schoolId}`.slice(0, 40);
}

/**
 * Opens a payment. Creates the Razorpay order and records it as `created`, so
 * an order that is never paid still leaves a trace to explain later.
 */
export async function startUpgrade(schoolId: string): Promise<UpgradeOrder> {
  await connectToDatabase();

  const config = requireRazorpayConfig();

  const school = await School.findById(schoolId).select("name").lean();
  if (!school) throw new SetupError("No such school.", 404);

  const order = await createOrder({
    amountPaise: ANNUAL_PLAN.amountPaise,
    currency: ANNUAL_PLAN.currency,
    receipt: receiptFor(schoolId),
    notes: { schoolId, plan: ANNUAL_PLAN.id },
  });

  await School.updateOne(
    { _id: schoolId },
    {
      $push: {
        subscriptionHistory: {
          amount: order.amount,
          currency: order.currency,
          razorpayOrderId: order.id,
          razorpayPaymentId: null,
          status: "created" as const,
          createdAt: new Date(),
        },
      },
    }
  );

  return {
    orderId: order.id,
    amountPaise: order.amount,
    currency: order.currency,
    keyId: config.keyId,
    testMode: isTestMode(config.keyId),
    schoolName: school.name,
    planName: ANNUAL_PLAN.name,
  };
}

export type ActivationResult = {
  activated: boolean;
  /** True when this payment had already been applied. Not an error. */
  alreadyApplied: boolean;
  planValidUntil: Date | null;
};

/**
 * Applies a payment that has already been verified by the caller.
 *
 * The update is guarded on the order still being unpaid, so whichever of the
 * callback and the webhook arrives second matches nothing and reports
 * `alreadyApplied` rather than extending the plan a second time. Same shape as
 * `finishAttempt` in Phase 6: the guard lives in the query, not in an `if`
 * somewhere above it.
 */
export async function applyVerifiedPayment(options: {
  schoolId?: string;
  orderId: string;
  paymentId: string;
  amountPaise: number;
  currency?: string;
  now?: Date;
}): Promise<ActivationResult> {
  await connectToDatabase();

  const now = options.now ?? new Date();

  // The order is the authority on which school this belongs to — a schoolId
  // from a request body would let one school pay onto another's account.
  const school = await School.findOne({
    ...(options.schoolId ? { _id: options.schoolId } : {}),
    "subscriptionHistory.razorpayOrderId": options.orderId,
  })
    .select("planValidUntil subscriptionHistory")
    .lean();

  if (!school) {
    throw new SetupError(
      "That payment doesn't match an order we opened.",
      404
    );
  }

  const already = (school.subscriptionHistory ?? []).some(
    (entry) =>
      entry.razorpayOrderId === options.orderId && entry.status === "captured"
  );

  if (already) {
    return {
      activated: false,
      alreadyApplied: true,
      planValidUntil: school.planValidUntil ?? null,
    };
  }

  // Renewing early adds to whatever is left rather than discarding it.
  const planValidUntil = addMonths(
    renewalFrom(school.planValidUntil, now),
    ANNUAL_PLAN.months
  );

  const result = await School.updateOne(
    {
      _id: school._id,
      subscriptionHistory: {
        $elemMatch: {
          razorpayOrderId: options.orderId,
          status: { $ne: "captured" },
        },
      },
    },
    {
      $set: {
        plan: "active",
        planValidUntil,
        maxStudents: ANNUAL_PLAN.maxStudents,
        "subscriptionHistory.$.status": "captured",
        "subscriptionHistory.$.razorpayPaymentId": options.paymentId,
        "subscriptionHistory.$.amount": options.amountPaise,
        ...(options.currency
          ? { "subscriptionHistory.$.currency": options.currency }
          : {}),
        "subscriptionHistory.$.failureReason": null,
      },
    }
  );

  if (result.matchedCount === 0) {
    // Someone else captured it between the read and the write.
    const fresh = await School.findById(school._id).select("planValidUntil").lean();
    return {
      activated: false,
      alreadyApplied: true,
      planValidUntil: fresh?.planValidUntil ?? null,
    };
  }

  return { activated: true, alreadyApplied: false, planValidUntil };
}

/**
 * The Checkout callback.
 *
 * Verifies the signature, then asks Razorpay directly what the payment's
 * status and amount actually are — because a valid signature proves the
 * message is ours, not that the money arrived or that the right amount did.
 */
export async function completeCheckout(options: {
  schoolId: string;
  orderId: string;
  paymentId: string;
  signature: string;
  now?: Date;
}): Promise<ActivationResult> {
  const config = requireRazorpayConfig();

  if (
    !verifyCheckoutSignature(
      options.orderId,
      options.paymentId,
      options.signature,
      config
    )
  ) {
    await reportAlert("A checkout callback failed signature verification", {
      where: "billing.verify",
      extra: { schoolId: options.schoolId, orderId: options.orderId, paymentId: options.paymentId },
    });

    await recordFailure({
      schoolId: options.schoolId,
      orderId: options.orderId,
      paymentId: options.paymentId,
      reason: "The payment signature didn't check out.",
    });

    throw new SetupError(
      "That payment couldn't be verified, so nothing has been changed on your account. If money did leave your account it will be returned — send us the payment id and we'll chase it.",
      400
    );
  }

  const payment = await fetchPayment(options.paymentId);

  if (payment.status !== "captured" && payment.status !== "authorized") {
    await recordFailure({
      schoolId: options.schoolId,
      orderId: options.orderId,
      paymentId: options.paymentId,
      reason: payment.error_description ?? `Razorpay reported "${payment.status}".`,
    });

    throw new SetupError(
      "That payment didn't go through, so your plan is exactly as it was.",
      402
    );
  }

  if (payment.amount < ANNUAL_PLAN.amountPaise) {
    await reportAlert("A payment cleared for less than the plan price", {
      where: "billing.verify",
      extra: {
        schoolId: options.schoolId,
        paymentId: options.paymentId,
        paid: payment.amount,
        expected: ANNUAL_PLAN.amountPaise,
      },
    });

    await recordFailure({
      schoolId: options.schoolId,
      orderId: options.orderId,
      paymentId: options.paymentId,
      reason: `Paid ${payment.amount} paise against a ${ANNUAL_PLAN.amountPaise} paise plan.`,
    });

    throw new SetupError(
      "The amount paid doesn't match the plan, so nothing has been changed. Get in touch and we'll sort it out.",
      400
    );
  }

  return applyVerifiedPayment({
    schoolId: options.schoolId,
    orderId: options.orderId,
    paymentId: options.paymentId,
    amountPaise: payment.amount,
    currency: payment.currency,
    now: options.now,
  });
}

/**
 * Marks an order as failed, leaving everything else alone.
 *
 * Guarded on the order not already being captured, so a late "failed" notice
 * can never undo a payment that worked.
 */
export async function recordFailure(options: {
  schoolId?: string;
  orderId: string;
  paymentId?: string | null;
  reason: string;
}): Promise<void> {
  await connectToDatabase();

  await School.updateOne(
    {
      ...(options.schoolId ? { _id: options.schoolId } : {}),
      subscriptionHistory: {
        $elemMatch: {
          razorpayOrderId: options.orderId,
          status: { $ne: "captured" },
        },
      },
    },
    {
      $set: {
        "subscriptionHistory.$.status": "failed",
        "subscriptionHistory.$.razorpayPaymentId": options.paymentId ?? null,
        "subscriptionHistory.$.failureReason": options.reason.slice(0, 300),
      },
    }
  );
}

/** A school's own payment history, newest first. */
export async function listPayments(schoolId: string) {
  await connectToDatabase();

  const school = await School.findById(schoolId)
    .select("subscriptionHistory")
    .lean();

  return [...(school?.subscriptionHistory ?? [])]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((entry) => ({
      id: String(entry._id),
      amount: entry.amount,
      currency: entry.currency,
      razorpayOrderId: entry.razorpayOrderId,
      razorpayPaymentId: entry.razorpayPaymentId ?? null,
      status: entry.status,
      failureReason: entry.failureReason ?? null,
      createdAt: entry.createdAt.toISOString(),
    }));
}
