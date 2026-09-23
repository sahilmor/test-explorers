import { APP_NAME } from "@/lib/brand";
/**
 * Sending email, through Resend's REST API.
 *
 * No SDK, for the same reason lib/razorpay.ts has none: this is one
 * authenticated POST, and a dependency that wraps one POST is a dependency
 * that can break a build for nothing.
 *
 * The contract every caller relies on: **this never throws**. Notification
 * delivery is not allowed to become a way for a test assignment or a result to
 * fail. A missing key, a refused request, a timeout — all of them come back as
 * `{ ok: false }` with a reason, and the caller carries on.
 */

/**
 * Resend's endpoint.
 *
 * Overridable so the test suite can point sending at a stub it controls and
 * assert on what actually left the building. Same seam as RAZORPAY_API_BASE,
 * and the same reasoning: it changes where the request goes, not what is in
 * it or whether it is checked.
 */
function apiUrl(): string {
  const base = process.env.RESEND_API_BASE?.trim();
  return base ? `${base.replace(/\/+$/, "")}/emails` : "https://api.resend.com/emails";
}

/** How long to wait before giving up. An email is never worth a hung request. */
const TIMEOUT_MS = 10_000;

export type EmailResult =
  | { ok: true; id: string | null; skipped?: false }
  | { ok: false; skipped: boolean; reason: string };

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export function emailConfig(): { apiKey: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;

  return {
    apiKey,
    // Resend accepts onboarding@resend.dev with no domain verification, which
    // is enough to prove delivery before a domain is set up. Override it with
    // EMAIL_FROM once yours is verified.
    from: process.env.EMAIL_FROM?.trim() || `${APP_NAME} <onboarding@resend.dev>`,
  };
}

/** Where the links in an email should point. */
export function appUrl(path = ""): string {
  const base =
    process.env.APP_URL?.trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");

  return `${base.replace(/\/+$/, "")}${path}`;
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const config = emailConfig();

  // Not an error. An install that has never set up email should run normally
  // and say what it would have done, rather than fail an assignment over it.
  if (!config) {
    console.info(
      `[email] no RESEND_API_KEY — would have sent "${message.subject}" to ${message.to}`
    );
    return { ok: false, skipped: true, reason: "Email is not configured." };
  }

  try {
    const response = await fetch(apiUrl(), {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const body = (await response.json().catch(() => null)) as
      | { id?: string; message?: string; name?: string }
      | null;

    if (!response.ok) {
      const reason = body?.message ?? `Resend answered ${response.status}.`;
      console.error(`[email] send failed for ${message.to}: ${reason}`);
      return { ok: false, skipped: false, reason };
    }

    return { ok: true, id: body?.id ?? null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[email] send threw for ${message.to}: ${reason}`);
    return { ok: false, skipped: false, reason };
  }
}
