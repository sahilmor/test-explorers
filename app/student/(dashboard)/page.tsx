import type { Metadata } from "next";
import { ComingSoon, PageHeading } from "@/components/app/app-shell";
import { MyTests } from "@/components/tests/my-tests";
import { requireRole } from "@/lib/auth";
import { listStudentTests } from "@/lib/tests";
import { sweepSchool } from "@/lib/sweep";

export const metadata: Metadata = { title: "Student" };
export const dynamic = "force-dynamic";

export default async function StudentHome() {
  const session = await requireRole("student");

  // Close out any attempt in this school whose deadline passed while its
  // tab was shut, before showing this student their own list.
  await sweepSchool(session.schoolId);

  // Both ids come from the verified token, and the section comes from the
  // student's own record — there is no parameter to ask about another class.
  const tests = await listStudentTests(session.schoolId, session.userId);

  const open = tests.filter((t) => t.state === "open").length;

  return (
    <div className="space-y-12">
      <PageHeading
        eyebrow="Student"
        title={
          open > 0
            ? `${open} test${open === 1 ? "" : "s"} waiting for you`
            : "Nothing due. Enjoy it."
        }
        blurb="Papers your teachers set for your class, with the time you have left to sit them."
      />

      <section>
        <h2 className="sr-only">My tests</h2>
        <MyTests
          initial={tests.map((t) => ({
            id: t.id,
            title: t.title,
            subjectName: t.subjectName,
            durationMinutes: t.durationMinutes,
            questionCount: t.questionCount,
            opensAt: t.opensAt.toISOString(),
            closesAt: t.closesAt.toISOString(),
            state: t.state,
          }))}
        />
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <ComingSoon
          title="Sit a test"
          body="One question at a time, answers saved as you go, timer you can see."
          tone="lime"
        />
        <ComingSoon
          title="Your results"
          body="Marks once your teacher releases them, with what you got wrong and why."
          tone="coral"
        />
      </section>
    </div>
  );
}
