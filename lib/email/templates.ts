import { ANNUAL_PLAN } from "@/lib/plans";
import { appUrl } from "@/lib/email/send";

/**
 * The two transactional emails.
 *
 * Built as inline-styled tables, because that is what email clients render.
 * Gmail strips <style> blocks, Outlook ignores flexbox, and nothing supports a
 * CSS variable — so the palette from app/globals.css is repeated here as
 * literals. They are the same values, written twice on purpose; the
 * alternative is an email that renders as unstyled text in half the inboxes it
 * reaches.
 *
 * Deliberately plain beyond that. Transactional mail earns trust by looking
 * like it came from the product and saying one thing clearly.
 */

const INK = "#12100e";
const PAPER = "#faf5e9";
const PAPER_PURE = "#fffdf7";
const LIME = "#c6f135";
const CORAL = "#ff5a36";
const INK_SOFT = "#5a544c";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The shell every email shares: wordmark, ink-bordered slab, hard offset
 * shadow faked with a second table cell, footer.
 */
function shell(options: {
  preheader: string;
  eyebrow: string;
  title: string;
  body: string;
  ctaHref: string;
  ctaLabel: string;
  footnote?: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(options.title)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <!-- Preview text: what the inbox list shows next to the subject. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.preheader)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <tr><td style="padding-bottom:20px;">
          <span style="display:inline-block;width:18px;height:18px;border:2px solid ${INK};border-radius:50%;vertical-align:middle;">
            <span style="display:block;width:8px;height:8px;margin:3px;border-radius:50%;background:${LIME};"></span>
          </span>
          <span style="vertical-align:middle;margin-left:8px;font-size:18px;font-weight:800;letter-spacing:-0.03em;color:${INK};">Test<span style="color:${CORAL};">Manager</span></span>
        </td></tr>

        <tr><td style="background:${PAPER_PURE};border:2px solid ${INK};border-radius:12px;padding:0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="height:10px;background:${LIME};font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr><td style="padding:28px 28px 30px;">
              <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${CORAL};">${escapeHtml(options.eyebrow)}</p>
              <h1 style="margin:12px 0 0;font-size:24px;line-height:1.2;font-weight:800;letter-spacing:-0.02em;color:${INK};">${escapeHtml(options.title)}</h1>
              <div style="margin-top:14px;font-size:15px;line-height:1.6;color:${INK_SOFT};">${options.body}</div>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:26px;">
                <tr><td style="background:${INK};border:2px solid ${INK};border-radius:8px;">
                  <a href="${options.ctaHref}" style="display:inline-block;padding:13px 24px;font-size:14px;font-weight:700;color:${PAPER};text-decoration:none;">${escapeHtml(options.ctaLabel)}</a>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding-top:18px;font-size:12px;line-height:1.6;color:${INK_SOFT};">
          ${options.footnote ? `${escapeHtml(options.footnote)}<br><br>` : ""}
          Sent by your school through TestManager. If you weren't expecting this,
          your school administrator can explain — please don't reply to this address.
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function formatWhen(value: Date): string {
  return value.toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------

export type TestAssignedInput = {
  studentName: string;
  schoolName: string;
  testTitle: string;
  subjectName: string | null;
  durationMinutes: number;
  questionCount: number;
  opensAt: Date;
  closesAt: Date;
};

export function testAssignedEmail(input: TestAssignedInput) {
  const href = appUrl("/student");
  const subjectLine = input.subjectName
    ? `${input.subjectName}: ${input.testTitle}`
    : input.testTitle;

  const body = `
    <p style="margin:0 0 12px;">Hello ${escapeHtml(input.studentName.split(" ")[0])},</p>
    <p style="margin:0 0 16px;">${escapeHtml(input.schoolName)} has set you a paper.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid ${INK};border-radius:8px;">
      <tr><td style="padding:14px 16px;">
        <p style="margin:0;font-size:16px;font-weight:800;color:${INK};">${escapeHtml(input.testTitle)}</p>
        <p style="margin:6px 0 0;font-size:13px;color:${INK_SOFT};">
          ${escapeHtml(input.subjectName ?? "No subject")} &middot; ${input.questionCount} question${input.questionCount === 1 ? "" : "s"} &middot; ${input.durationMinutes} minutes
        </p>
        <p style="margin:10px 0 0;font-size:13px;color:${INK};">
          <strong>Opens</strong> ${escapeHtml(formatWhen(input.opensAt))}<br>
          <strong>Closes</strong> ${escapeHtml(formatWhen(input.closesAt))}
        </p>
      </td></tr>
    </table>
    <p style="margin:16px 0 0;">Your timer starts when you open it, not when the window does — so start when you're ready.</p>
  `;

  const text = [
    `Hello ${input.studentName.split(" ")[0]},`,
    ``,
    `${input.schoolName} has set you a paper.`,
    ``,
    input.testTitle,
    `${input.subjectName ?? "No subject"} - ${input.questionCount} questions - ${input.durationMinutes} minutes`,
    `Opens: ${formatWhen(input.opensAt)}`,
    `Closes: ${formatWhen(input.closesAt)}`,
    ``,
    `Your timer starts when you open it, not when the window does.`,
    ``,
    `Sit it here: ${href}`,
  ].join("\n");

  return {
    subject: `New test: ${subjectLine}`,
    html: shell({
      preheader: `Opens ${formatWhen(input.opensAt)} · ${input.durationMinutes} minutes`,
      eyebrow: "Test assigned",
      title: "You have a paper to sit",
      body,
      ctaHref: href,
      ctaLabel: "Open my tests",
      footnote: `Set by ${input.schoolName}.`,
    }),
    text,
  };
}

// ---------------------------------------------------------------------------

export type ResultsPublishedInput = {
  studentName: string;
  schoolName: string;
  testId: string;
  testTitle: string;
  subjectName: string | null;
  score: number;
  totalQuestions: number;
  percentage: number;
};

export function resultsPublishedEmail(input: ResultsPublishedInput) {
  const href = appUrl(`/student/tests/${input.testId}/result`);

  const body = `
    <p style="margin:0 0 12px;">Hello ${escapeHtml(input.studentName.split(" ")[0])},</p>
    <p style="margin:0 0 16px;">${escapeHtml(input.testTitle)} has closed for everyone, so your result is out.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid ${INK};border-radius:8px;background:${LIME};">
      <tr><td style="padding:18px 16px;text-align:center;">
        <p style="margin:0;font-size:38px;line-height:1;font-weight:800;letter-spacing:-0.03em;color:${INK};">
          ${input.score}<span style="opacity:0.55;">/${input.totalQuestions}</span>
        </p>
        <p style="margin:8px 0 0;font-size:15px;font-weight:700;color:${INK};">${input.percentage}%</p>
      </td></tr>
    </table>
    <p style="margin:16px 0 0;">The full review shows every question with your answer beside the right one. That part is worth reading.</p>
  `;

  const text = [
    `Hello ${input.studentName.split(" ")[0]},`,
    ``,
    `${input.testTitle} has closed for everyone, so your result is out.`,
    ``,
    `You scored ${input.score}/${input.totalQuestions} (${input.percentage}%).`,
    ``,
    `The full review shows every question with your answer beside the right one:`,
    href,
  ].join("\n");

  return {
    subject: `Your result: ${input.testTitle}`,
    html: shell({
      preheader: `${input.score}/${input.totalQuestions} — ${input.percentage}%`,
      eyebrow: "Results are out",
      title: "Your result is ready",
      body,
      ctaHref: href,
      ctaLabel: "See the full review",
      footnote: `${input.schoolName} · ${input.subjectName ?? "Result"}`,
    }),
    text,
  };
}

/** Exported so the pricing copy in email and on the site cannot drift apart. */
export const PLAN_FOR_EMAIL = ANNUAL_PLAN;
