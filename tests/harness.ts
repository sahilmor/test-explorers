import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { MongoMemoryReplSet } from "mongodb-memory-server";

/**
 * Test harness: a throwaway MongoDB replica set plus the real production
 * build of the app, served over HTTP.
 *
 * The tests talk to the app the way a browser or a curl command would — no
 * mocks, no importing route handlers directly, no test-only bypasses. If the
 * app would leak across tenants in production, it leaks here too.
 *
 * A replica set (rather than a standalone mongod) is used because signup runs
 * in a transaction, and transactions need one.
 */

const ROOT = path.resolve(import.meta.dirname, "..");

export type Harness = {
  baseUrl: string;
  mongoUri: string;
  stop: () => Promise<void>;
};

/** Matches CRON_SECRET below; tests send it to call the sweep endpoint. */
export const TEST_CRON_SECRET = "test-cron-secret";

/** Obviously-fake Razorpay credentials. The stub in billing.test.ts answers. */
export const TEST_RAZORPAY_KEY_ID = "rzp_test_harness";
export const TEST_RAZORPAY_KEY_SECRET = "harness-key-secret";
export const TEST_RAZORPAY_WEBHOOK_SECRET = "harness-webhook-secret";

/** Whoever the platform-owner tests sign in as. */
export const TEST_OWNER_EMAIL = "owner@platform.test";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "string" || address === null) {
        reject(new Error("could not determine a free port"));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(url: string, child: ChildProcess, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next start exited early with code ${child.exitCode}`);
    }
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  throw new Error(`server did not become ready at ${url} within ${timeoutMs}ms`);
}

export async function startHarness(
  options: {
    razorpayApiBase?: string;
    resendApiBase?: string;
    selfServeBilling?: boolean;
  } = {}
): Promise<Harness> {
  // mongodb-memory-server would download a mongod; if Homebrew already put one
  // on this machine, reuse it instead.
  process.env.MONGOMS_SYSTEM_BINARY ??= "/opt/homebrew/bin/mongod";

  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  const mongoUri = replSet.getUri("sotm_test");

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const child = spawn(
    process.execPath,
    [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: "production",
        MONGODB_URI: mongoUri,
        // Fixed, obviously-fake secret: the tests sign their own forged tokens
        // with a *different* one to prove forgeries are rejected.
        JWT_SECRET: "test-secret-that-is-definitely-long-enough-32+",
        // The sweep endpoint refuses unauthenticated calls in production, and
        // the harness runs a production build.
        CRON_SECRET: "test-cron-secret",
        // Billing. The keys are fake and the API base points at a stub the
        // test suite runs, so the whole payment flow is exercised over real
        // HTTP without an account and without the internet. Signatures are
        // still verified and amounts still checked — see lib/razorpay.ts.
        RAZORPAY_KEY_ID: TEST_RAZORPAY_KEY_ID,
        RAZORPAY_KEY_SECRET: TEST_RAZORPAY_KEY_SECRET,
        RAZORPAY_WEBHOOK_SECRET: TEST_RAZORPAY_WEBHOOK_SECRET,
        ...(options.razorpayApiBase
          ? { RAZORPAY_API_BASE: options.razorpayApiBase }
          : {}),
        // Checkout is off for schools by default (see lib/billing-access.ts).
        // The integration is still meant to work, so the billing suite turns
        // it on explicitly and keeps testing it.
        ...(options.selfServeBilling ? { SELF_SERVE_BILLING: "true" } : {}),
        PLATFORM_OWNER_EMAILS: TEST_OWNER_EMAIL,
        // Email. A key has to be present for sending to be attempted at all;
        // the base points at a stub the suite runs, so what gets sent can be
        // asserted on without a provider account.
        ...(options.resendApiBase
          ? {
              RESEND_API_KEY: "re_test_harness",
              RESEND_API_BASE: options.resendApiBase,
              EMAIL_FROM: "Shalasys <tests@harness.invalid>",
              APP_URL: baseUrl,
            }
          : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  const logs: string[] = [];
  child.stdout?.on("data", (b) => logs.push(String(b)));
  child.stderr?.on("data", (b) => logs.push(String(b)));

  try {
    await waitForServer(`${baseUrl}/login`, child);
  } catch (error) {
    child.kill("SIGKILL");
    await replSet.stop();
    throw new Error(`${(error as Error).message}\n--- server output ---\n${logs.join("")}`);
  }

  return {
    baseUrl,
    mongoUri,
    stop: async () => {
      child.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 300));
      if (child.exitCode === null) child.kill("SIGKILL");
      await replSet.stop();
    },
  };
}

// ---------------------------------------------------------------------------
// A tiny HTTP client that keeps one tenant's cookie jar, like a browser would
// ---------------------------------------------------------------------------

export class Client {
  private cookies = new Map<string, string>();

  constructor(private readonly baseUrl: string) {}

  /** The raw session cookie value, for tests that want to inspect or tamper. */
  cookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  setCookie(name: string, value: string) {
    this.cookies.set(name, value);
  }

  private cookieHeader(): string | undefined {
    if (this.cookies.size === 0) return undefined;
    return [...this.cookies]
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("; ");
  }

  private absorb(response: Response) {
    // Node exposes multiple Set-Cookie headers via getSetCookie().
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      const name = pair.slice(0, eq).trim();
      const value = decodeURIComponent(pair.slice(eq + 1).trim());
      if (value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  // Route responses are arbitrary JSON and the tests assert on their shape,
  // so `any` is the honest type here rather than casting at every call site.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  async request(
    path: string,
    init: RequestInit & { json?: unknown } = {}
  ): Promise<{ status: number; body: any; headers: Headers }> {
    const headers = new Headers(init.headers);
    const cookie = this.cookieHeader();
    if (cookie) headers.set("cookie", cookie);

    let body = init.body;
    if (init.json !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(init.json);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      body,
      redirect: "manual",
    });

    this.absorb(response);

    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // HTML page or empty body — leave as text
    }

    return { status: response.status, body: parsed as any, headers: response.headers };
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  get(path: string) {
    return this.request(path, { method: "GET" });
  }

  post(path: string, json?: unknown) {
    return this.request(path, { method: "POST", json });
  }

  patch(path: string, json?: unknown) {
    return this.request(path, { method: "PATCH", json });
  }
}
