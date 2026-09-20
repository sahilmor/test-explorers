import { NextResponse } from "next/server";
import { sweepExpiredAttempts } from "@/lib/attempts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Force-submits every attempt whose deadline has passed.
 *
 * This is the backstop for a student whose laptop lid closed: their attempt is
 * submitted with whatever was saved, without their browser ever coming back.
 *
 * Two things trigger it:
 *
 *  1. Vercel Cron, configured in `vercel.json`. It is scheduled daily because
 *     Hobby plans refuse to deploy anything more frequent — a deploy with
 *     `*\/5 * * * *` is rejected outright. On Pro, tighten that schedule.
 *  2. The opportunistic sweep in `lib/sweep.ts`, which runs on ordinary
 *     student and teacher requests. On a daily-cron plan this is what
 *     actually keeps things tidy minute to minute.
 *
 * Correctness never depends on either of them running: an expired attempt is
 * also force-submitted the moment anyone reads or writes it, so a student can
 * never see a live paper past their deadline even if no sweep has run.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when the variable
  // is set. Without a secret this endpoint would let anyone trigger a sweep —
  // harmless in itself, but not something to leave open.
  if (secret) {
    const header = request.headers.get("authorization");
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Not authorised." }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on this deployment." },
      { status: 503 }
    );
  }

  try {
    const result = await sweepExpiredAttempts();

    if (result.submitted > 0) {
      console.log(
        `[sweep] auto-submitted ${result.submitted} of ${result.checked} running attempts`
      );
    }

    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[sweep] failed:", error);
    return NextResponse.json({ error: "The sweep failed." }, { status: 500 });
  }
}
