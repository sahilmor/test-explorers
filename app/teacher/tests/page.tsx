import type { Metadata } from "next";
import { TestsScreen } from "@/components/tests/tests-screen";
import { requireAnyRole } from "@/lib/auth";
import { questionCountsBySubject } from "@/lib/question-bank";
import { listSections } from "@/lib/school-setup";
import { listTests } from "@/lib/tests";

export const metadata: Metadata = { title: "Tests" };
export const dynamic = "force-dynamic";

export default async function TestsPage() {
  // The layout already gated this to teachers and admins; asking again keeps
  // the page correct on its own and gives us the verified schoolId.
  const session = await requireAnyRole(["teacher", "admin"]);

  const [tests, counts, sections] = await Promise.all([
    listTests(session.schoolId),
    // The Phase 3 per-subject counts, reused so the auto-generate step can't
    // ask for more questions than the bank holds.
    questionCountsBySubject(session.schoolId),
    listSections(session.schoolId),
  ]);

  return (
    <TestsScreen
      initial={tests.map((t) => ({
        ...t,
        opensAt: t.opensAt.toISOString(),
        closesAt: t.closesAt.toISOString(),
      }))}
      subjects={counts.map((c) => ({
        id: c.subjectId,
        name: c.subjectName,
        questionCount: c.count,
      }))}
      sections={sections.map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
