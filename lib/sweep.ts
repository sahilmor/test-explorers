import { sweepExpiredAttempts } from "@/lib/attempts";

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
}
