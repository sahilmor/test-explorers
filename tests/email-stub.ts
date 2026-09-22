import { createServer, type Server } from "node:http";

/**
 * A stand-in for Resend.
 *
 * Lets the suite assert on what was actually sent — to whom, with what
 * subject, containing which link — over real HTTP, with nothing inside the app
 * mocked. It can also be told to fail, which is the more important case: the
 * whole point of the notification design is that a broken mail provider must
 * not break a test assignment.
 */
export type SentEmail = {
  to: string[];
  from: string;
  subject: string;
  html: string;
  text: string;
};

export class EmailStub {
  private server: Server | null = null;
  private counter = 0;

  readonly sent: SentEmail[] = [];

  /** Flip to make every send fail, as a provider outage would. */
  failing = false;

  async start(): Promise<string> {
    this.server = createServer((req, res) => {
      if (req.method !== "POST" || !req.url?.endsWith("/emails")) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: "stub: no such route" }));
        return;
      }

      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        if (this.failing) {
          res.writeHead(422, { "content-type": "application/json" });
          res.end(JSON.stringify({ message: "stub: refusing on purpose" }));
          return;
        }

        try {
          this.sent.push(JSON.parse(raw) as SentEmail);
        } catch {
          // A malformed body is itself worth failing on.
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ message: "stub: unreadable body" }));
          return;
        }

        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: `email_stub${++this.counter}` }));
      });
    });

    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
    const address = this.server!.address();
    if (typeof address === "string" || !address) throw new Error("email stub failed to bind");
    return `http://127.0.0.1:${address.port}`;
  }

  async stop() {
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = null;
  }

  clear() {
    this.sent.length = 0;
  }

  /** Every email that went to one address. */
  to(email: string): SentEmail[] {
    return this.sent.filter((m) => m.to.includes(email));
  }

  /**
   * Waits for the expected count to arrive.
   *
   * Sends are scheduled with `after()`, so they land shortly *after* the
   * response the test awaited. Polling is the honest way to observe that
   * rather than pretending it is synchronous.
   */
  async settle(expected: number, timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.sent.length >= expected) {
        // A short grace period, so a test asserting "exactly N" would still
        // catch an N+1 arriving just behind.
        await new Promise((r) => setTimeout(r, 300));
        return;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}
