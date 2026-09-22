import { NextResponse } from "next/server";
import { applyVerifiedPayment, recordFailure } from "@/lib/billing";
import { razorpayConfig, verifyWebhookSignature } from "@/lib/razorpay";
import { reportAlert, reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";
// node:crypto signs the comparison, and the raw body has to survive intact.
export const runtime = "nodejs";

/**
 * Razorpay's own account of what happened.
 *
 * This is the authoritative path, not the browser callback. A customer whose
 * laptop dies between paying and being redirected still gets their plan,
 * because this arrives regardless — and it is the reason activation had to be
 * idempotent in the first place.
 *
 * Unauthenticated by design: there is no session on a server-to-server call.
 * What stands in for one is the signature over the raw body, computed with the
 * webhook secret. Without a configured secret the route refuses everything
 * rather than trusting an unsigned POST from the open internet.
 */
export async function POST(request: Request) {
  const config = razorpayConfig();

  if (!config?.webhookSecret) {
    // Worth an alert, not just a log: if this is production, money is moving
    // and nothing is being recorded against it.
    await reportAlert("Razorpay webhook arrived with no RAZORPAY_WEBHOOK_SECRET set", {
      where: "billing.webhook",
    });
    return NextResponse.json({ error: "Webhooks aren't configured." }, { status: 501 });
  }

  // The exact bytes Razorpay signed. Parsing first and re-serialising would
  // change whitespace or key order and fail the check every time.
  const raw = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!signature || !verifyWebhookSignature(raw, signature, config.webhookSecret)) {
    // Either the secret drifted from the dashboard, or somebody is posting
    // made-up payments at the endpoint. Both are worth knowing about tonight.
    await reportAlert("Razorpay webhook failed signature verification", {
      where: "billing.webhook",
      extra: { hasSignature: Boolean(signature) },
    });
    return NextResponse.json({ error: "Bad signature." }, { status: 400 });
  }

  let event: {
    event?: string;
    payload?: {
      payment?: {
        entity?: {
          id?: string;
          order_id?: string;
          amount?: number;
          currency?: string;
          error_description?: string | null;
        };
      };
    };
  };

  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Unreadable payload." }, { status: 400 });
  }

  const payment = event.payload?.payment?.entity;

  // Anything we don't act on is still acknowledged. Answering non-2xx makes
  // Razorpay retry an event we were never going to use.
  if (!payment?.id || !payment.order_id) {
    return NextResponse.json({ ok: true, ignored: event.event ?? "unknown" });
  }

  try {
    if (event.event === "payment.captured") {
      const result = await applyVerifiedPayment({
        orderId: payment.order_id,
        paymentId: payment.id,
        amountPaise: payment.amount ?? 0,
        currency: payment.currency,
      });

      return NextResponse.json({
        ok: true,
        activated: result.activated,
        alreadyApplied: result.alreadyApplied,
      });
    }

    if (event.event === "payment.failed") {
      await reportAlert("A Razorpay payment failed", {
        where: "billing.payment_failed",
        level: "warning",
        extra: {
          orderId: payment.order_id,
          paymentId: payment.id,
          reason: payment.error_description ?? null,
        },
      });

      await recordFailure({
        orderId: payment.order_id,
        paymentId: payment.id,
        reason: payment.error_description ?? "Razorpay reported the payment failed.",
      });

      return NextResponse.json({ ok: true, recorded: "failed" });
    }

    return NextResponse.json({ ok: true, ignored: event.event ?? "unknown" });
  } catch (error) {
    // A 500 here asks Razorpay to deliver it again, which is what we want if
    // the database was briefly unreachable. It is also the worst kind of
    // failure in this app — a verified payment we could not record — so it
    // goes straight to the alerting.
    await reportError(error, {
      where: "billing.webhook",
      extra: { event: event.event, orderId: payment.order_id, paymentId: payment.id },
    });
    return NextResponse.json({ error: "Could not apply that event." }, { status: 500 });
  }
}
