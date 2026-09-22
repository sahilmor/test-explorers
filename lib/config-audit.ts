import { isTestMode, razorpayConfig } from "@/lib/razorpay";
import { emailConfig } from "@/lib/email/send";
import { observabilityEnabled } from "@/lib/observability";
import { platformOwnerEmails } from "@/lib/platform";
import { siteUrl } from "@/lib/site";

/**
 * Is this deployment actually configured?
 *
 * A launch checklist that lives only in a markdown file gets ticked from
 * memory. This reads the running process instead, so "the environment
 * variables are set in production" is something you can look at rather than
 * something you believe.
 *
 * It reports presence and shape, never values. No secret is returned from
 * here, and the route that surfaces it is owner-only anyway.
 */

export type CheckStatus = "ok" | "warn" | "missing";

export type ConfigCheck = {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** True when the app cannot run correctly without it. */
  required: boolean;
};

function present(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

export function auditConfig(): {
  environment: string;
  checks: ConfigCheck[];
  summary: { ok: number; warn: number; missing: number; blocking: number };
} {
  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown";
  const isProduction = environment === "production";

  const checks: ConfigCheck[] = [];

  // --- the things nothing works without --------------------------------
  checks.push({
    key: "MONGODB_URI",
    label: "Database",
    required: true,
    status: present("MONGODB_URI") ? "ok" : "missing",
    detail: present("MONGODB_URI")
      ? "Connection string is set."
      : "No MONGODB_URI. Nothing will load.",
  });

  const secret = process.env.JWT_SECRET?.trim() ?? "";
  checks.push({
    key: "JWT_SECRET",
    label: "Session signing",
    required: true,
    status: !secret ? "missing" : secret.length < 32 ? "warn" : "ok",
    detail: !secret
      ? "No JWT_SECRET. Nobody can sign in."
      : secret.length < 32
        ? `Only ${secret.length} characters — use at least 32.`
        : "Set, and long enough.",
  });

  checks.push({
    key: "APP_URL",
    label: "Public address",
    required: isProduction,
    status: present("APP_URL")
      ? "ok"
      : present("VERCEL_PROJECT_PRODUCTION_URL")
        ? "warn"
        : "missing",
    detail: present("APP_URL")
      ? `Links and canonicals point at ${siteUrl()}.`
      : present("VERCEL_PROJECT_PRODUCTION_URL")
        ? `Falling back to ${siteUrl()}. Set APP_URL once a custom domain is live.`
        : "Email links and OG tags will point at localhost.",
  });

  // --- payments ---------------------------------------------------------
  const razorpay = razorpayConfig();

  if (!razorpay) {
    checks.push({
      key: "RAZORPAY_KEY_ID",
      label: "Payments",
      required: isProduction,
      status: isProduction ? "missing" : "warn",
      detail: "Not configured. The billing page says so and checkout answers 501.",
    });
  } else {
    const test = isTestMode(razorpay.keyId);
    checks.push({
      key: "RAZORPAY_KEY_ID",
      label: "Payments",
      required: isProduction,
      // Test keys in production is the single most expensive mix-up available
      // here: a school "pays" and no money moves.
      status: isProduction && test ? "warn" : "ok",
      detail:
        isProduction && test
          ? "LIVE deployment is using TEST keys — no real payment can be taken. Swap to rzp_live_ keys."
          : test
            ? "Test mode. No real money moves."
            : "Live mode. Real payments will be taken.",
    });

    checks.push({
      key: "RAZORPAY_WEBHOOK_SECRET",
      label: "Payment webhook",
      required: isProduction,
      status: razorpay.webhookSecret ? "ok" : isProduction ? "missing" : "warn",
      detail: razorpay.webhookSecret
        ? "Set. Deliveries are signature-checked."
        : "Not set, so every webhook is refused — a payment whose browser never returns will not activate.",
    });
  }

  // --- email ------------------------------------------------------------
  const email = emailConfig();
  const usingResendSandbox = email?.from.includes("onboarding@resend.dev") ?? false;

  checks.push({
    key: "RESEND_API_KEY",
    label: "Email",
    required: false,
    status: !email ? "warn" : usingResendSandbox && isProduction ? "warn" : "ok",
    detail: !email
      ? "Not configured. Assignments and results still work; nobody gets told by email."
      : usingResendSandbox
        ? "Sending from onboarding@resend.dev, which only reaches your own address. Verify a domain and set EMAIL_FROM."
        : `Sending as ${email.from}.`,
  });

  // --- error tracking ---------------------------------------------------
  checks.push({
    key: "SENTRY_DSN",
    label: "Error tracking",
    required: false,
    status: observabilityEnabled() ? "ok" : "warn",
    detail: observabilityEnabled()
      ? "Errors and payment alerts are reported."
      : "Not configured. Errors go to the platform logs only — nothing will alert you.",
  });

  // --- owner access -----------------------------------------------------
  const owners = platformOwnerEmails();
  const usingDefaultOwner =
    !present("PLATFORM_OWNER_EMAILS") && owners.includes("mor.sahil05.28@gmail.com");

  checks.push({
    key: "PLATFORM_OWNER_EMAILS",
    label: "Owner access",
    required: false,
    status: usingDefaultOwner ? "warn" : "ok",
    detail: usingDefaultOwner
      ? "Using the built-in default address. Set this explicitly on any deployment that is not the author's."
      : `${owners.length} address${owners.length === 1 ? "" : "es"} can open this page.`,
  });

  checks.push({
    key: "CRON_SECRET",
    label: "Scheduled sweep",
    required: false,
    status: present("CRON_SECRET") ? "ok" : "warn",
    detail: present("CRON_SECRET")
      ? "Set. The scheduled sweep can authenticate."
      : "Not set, so the cron endpoint refuses. The opportunistic sweep still covers it.",
  });

  checks.push({
    key: "BLOB_READ_WRITE_TOKEN",
    label: "Question images",
    required: false,
    status: present("BLOB_READ_WRITE_TOKEN") ? "ok" : "warn",
    detail: present("BLOB_READ_WRITE_TOKEN")
      ? "Uploads will work."
      : "Not set. Image upload returns a clear 501; questions still work without diagrams.",
  });

  return {
    environment,
    checks,
    summary: {
      ok: checks.filter((c) => c.status === "ok").length,
      warn: checks.filter((c) => c.status === "warn").length,
      missing: checks.filter((c) => c.status === "missing").length,
      blocking: checks.filter((c) => c.required && c.status !== "ok").length,
    },
  };
}
