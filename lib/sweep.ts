import { after } from "next/server";
import { sweepExpiredAttempts } from "@/lib/attempts";
import { notifyResultsPublished } from "@/lib/notifications";

/**
 * The opportunistic sweep.
 *
 * Closing out an expired attempt does not need that student's browser — it
 * needs *someone* to touch the system. So ordinary requests that a school
 * makes anyway (a student opening their dashboard, a teacher opening the test
 * list) also sweep that school's expired attempts on the way past.
 *
 * It is scoped to one school and capped, so it stays a cheap indexed query
 * rather than a job. It never blocks the caller's own work: a failure is
 * logged and swallowed, because the scheduled sweep and the per-request
 * deadline check both still cover the same ground.
 *
 * It also announces results for papers that have closed, for the same reason
 * and on the same terms. Closing is a moment in time that nobody is present
 * for, so something has to notice it, and the thing already noticing expired
 * attempts is the obvious candidate. `notifyResultsPublished` throws nothing
 * and claims each send with a unique index, so running it on every request is
 * cheap and cannot double-send.
 *
 * That part runs in `after()`, so it happens once the response has already
 * gone out. Nobody opening a dashboard should wait on an SMTP round trip for
 * somebody else's result.
 */
export async function sweepSchool(schoolId: string): Promise<void> {
  try {
    const result = await sweepExpiredAttempts({ schoolId, limit: 100 });
    if (result.submitted > 0) {
      console.log(
        `[sweep] auto-submitted ${result.submitted} expired attempt(s) for school ${schoolId}`
      );
    }
  } catch (error) {
    // Deliberately swallowed. Whoever made this request wanted their own page,
    // not a sweep, and an expired attempt is force-submitted on access anyway.
    console.error("[sweep] opportunistic sweep failed:", error);
  }

  scheduleResultEmails(schoolId);
}

/**
 * Queues the result emails for after the response.
 *
 * `after` needs a request scope. Everything that calls `sweepSchool` has one
 * today, but a future caller might not — a script, a job — so the failure to
 * schedule is caught and the work simply runs inline instead of throwing.
 */
function scheduleResultEmails(schoolId: string) {
  const run = async () => {
    const mailed = await notifyResultsPublished(schoolId);
    if (mailed.sent > 0) {
      console.log(`[sweep] emailed ${mailed.sent} result(s) for school ${schoolId}`);
    }
  };

  try {
    after(run);
  } catch {
    void run();
  }
}
