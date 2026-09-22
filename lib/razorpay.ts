import { createHmac, timingSafeEqual } from "node:crypto";
import { SetupError } from "@/lib/errors";

/**
 * Razorpay, over its REST API.
 *
 * No SDK. Everything this app needs is one authenticated POST to create an
 * order and two HMACs to check that what came back is genuine, and a
 * dependency that wraps three HTTP calls is a dependency that can break a
 * build for no benefit. `node:crypto` does the signing, so these routes run on
 * the Node runtime — which is the default, and is asserted below.
 */

/**
 * Razorpay's API host.
 *
 * Overridable so the test suite can point the whole flow at a stub it
 * controls and exercise order creation, capture, decline and a tampered
 * amount for real over HTTP. It is configuration, not a bypass: every
 * signature is still checked and every amount is still compared against the
 * plan, whichever host answers.
 */
function apiBase(): string {
  return process.env.RAZORPAY_API_BASE?.trim() || "https://api.razorpay.com/v1";
}

export type RazorpayConfig = {
  keyId: string;
  keySecret: string;
  /** Separate from the key secret — Razorpay signs webhooks with its own. */
  webhookSecret: string | null;
};

/**
 * Reads the keys, or says plainly that it cannot.
 *
 * Deliberately not throwing at import time: the rest of the app has to keep
 * working — and keep being deployable — on an install that has never touched
 * payments. What must never happen is a checkout that *looks* like it worked
 * without keys, so every path that needs them fails loudly instead.
 */
export function razorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

  if (!keyId || !keySecret) return null;

  return {
    keyId,
    keySecret,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || null,
  };
}

export function requireRazorpayConfig(): RazorpayConfig {
  const config = razorpayConfig();

  if (!config) {
    throw new SetupError(
      "Payments aren't switched on for this deployment yet. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET and try again.",
      501
    );
  }

  return config;
}

/** Test keys start `rzp_test_`, live ones `rzp_live_`. Worth showing an admin. */
export function isTestMode(keyId: string): boolean {
  return keyId.startsWith("rzp_test_");
}

function authHeader(config: RazorpayConfig): string {
  return `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`;
}

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt: string | null;
};

/**
 * Creates an order.
 *
 * The amount is fixed here, on the server, from the plan constants — never
 * taken from the request. A price that arrives in a request body is a price
 * the customer chooses.
 */
export async function createOrder(options: {
  amountPaise: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  const config = requireRazorpayConfig();

  const response = await fetch(`${apiBase()}/orders`, {
    method: "POST",
    headers: {
      authorization: authHeader(config),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      amount: options.amountPaise,
      currency: options.currency,
      receipt: options.receipt,
      notes: options.notes ?? {},
      payment_capture: 1,
    }),
  });

  const body = (await response.json().catch(() => null)) as
    | (RazorpayOrder & { error?: { description?: string } })
    | null;

  if (!response.ok || !body?.id) {
    const detail = body?.error?.description;
    throw new SetupError(
      detail
        ? `Razorpay refused the order: ${detail}`
        : "Razorpay wouldn't open a payment just now. Nothing has been charged — try again in a moment.",
      502
    );
  }

  return body;
}

export type RazorpayPayment = {
  id: string;
  order_id: string;
  status: string;
  amount: number;
  currency: string;
  error_description?: string | null;
};

/** Asks Razorpay what actually happened, rather than believing the browser. */
export async function fetchPayment(paymentId: string): Promise<RazorpayPayment> {
  const config = requireRazorpayConfig();

  const response = await fetch(`${apiBase()}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { authorization: authHeader(config) },
  });

  const body = (await response.json().catch(() => null)) as RazorpayPayment | null;

  if (!response.ok || !body?.id) {
    throw new SetupError("Couldn't confirm that payment with Razorpay.", 502);
  }

  return body;
}

/** Constant-time compare that survives being handed a wrong-length string. */
function signaturesMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Checks the signature Checkout hands back.
 *
 * `HMAC_SHA256(order_id + "|" + payment_id, key_secret)`. Only someone holding
 * the key secret can produce this, so it is what separates a real payment from
 * a browser posting whatever it likes to the callback — which is exactly the
 * hole a client-side "payment succeeded" leaves open.
 */
export function verifyCheckoutSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  config: RazorpayConfig = requireRazorpayConfig()
): boolean {
  const expected = createHmac("sha256", config.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  return signaturesMatch(expected, signature);
}

/**
 * Checks a webhook.
 *
 * Signed over the *raw* body with the webhook secret, which is a different
 * secret from the API key. Re-serialising parsed JSON before hashing changes
 * a byte somewhere and fails every time, so the caller must pass the exact
 * text it received.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  webhookSecret: string
): boolean {
  const expected = createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  return signaturesMatch(expected, signature);
}
