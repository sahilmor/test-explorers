import { createServer, type Server } from "node:http";
import { createHmac } from "node:crypto";

/**
 * A stand-in for Razorpay's API.
 *
 * It exists so the payment flow can be exercised end to end — order created,
 * signature computed, callback verified, plan flipped — without an account,
 * without the internet, and without mocking anything inside the app. The app
 * talks real HTTP to this the same way it would to Razorpay; `RAZORPAY_API_BASE`
 * is the only thing that differs, and every signature check and amount check
 * still runs for real against it.
 *
 * What it is not is a way to skip verification. The signatures below are
 * computed with the same HMAC Razorpay uses, so a test that got the algorithm
 * wrong would fail here exactly as it would in production.
 */

export type StubPayment = {
  id: string;
  order_id: string;
  status: "captured" | "authorized" | "failed";
  amount: number;
  currency: string;
  error_description?: string | null;
};

export class RazorpayStub {
  private server: Server | null = null;
  private orders = new Map<string, { id: string; amount: number; currency: string; receipt: string }>();
  private payments = new Map<string, StubPayment>();
  private counter = 0;

  /** Every order this stub was asked to create, for assertions. */
  readonly createdOrders: { amount: number; currency: string; receipt: string; notes: Record<string, string> }[] = [];

  constructor(readonly keySecret: string) {}

  async start(): Promise<string> {
    this.server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://stub");

      if (req.method === "POST" && url.pathname === "/v1/orders") {
        let raw = "";
        req.on("data", (chunk) => (raw += chunk));
        req.on("end", () => {
          const input = JSON.parse(raw || "{}");
          const id = `order_stub${++this.counter}`;
          const order = {
            id,
            amount: input.amount,
            currency: input.currency,
            receipt: input.receipt,
          };
          this.orders.set(id, order);
          this.createdOrders.push({
            amount: input.amount,
            currency: input.currency,
            receipt: input.receipt,
            notes: input.notes ?? {},
          });
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ...order, status: "created" }));
        });
        return;
      }

      const payment = url.pathname.startsWith("/v1/payments/")
        ? this.payments.get(decodeURIComponent(url.pathname.slice("/v1/payments/".length)))
        : undefined;

      if (req.method === "GET" && payment) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(payment));
        return;
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { description: "stub: no such thing" } }));
    });

    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
    const address = this.server!.address();
    if (typeof address === "string" || !address) throw new Error("stub failed to bind");
    return `http://127.0.0.1:${address.port}/v1`;
  }

  async stop() {
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = null;
  }

  /** The most recent order this stub handed out. */
  lastOrderId(): string {
    return `order_stub${this.counter}`;
  }

  /**
   * Records what a payment against an order looks like, so the app's
   * `fetchPayment` can read it back. `amount` defaults to the order's, which
   * is what a real capture would be.
   */
  settle(
    orderId: string,
    options: {
      status?: StubPayment["status"];
      amount?: number;
      errorDescription?: string;
    } = {}
  ): StubPayment {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`stub: unknown order ${orderId}`);

    const payment: StubPayment = {
      id: `pay_stub${orderId.replace("order_stub", "")}`,
      order_id: orderId,
      status: options.status ?? "captured",
      amount: options.amount ?? order.amount,
      currency: order.currency,
      error_description: options.errorDescription ?? null,
    };

    this.payments.set(payment.id, payment);
    return payment;
  }

  /** The signature Razorpay Checkout would hand the browser. */
  checkoutSignature(orderId: string, paymentId: string): string {
    return createHmac("sha256", this.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
  }
}

/** The signature Razorpay puts in `x-razorpay-signature` on a webhook. */
export function webhookSignature(rawBody: string, webhookSecret: string): string {
  return createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
}
