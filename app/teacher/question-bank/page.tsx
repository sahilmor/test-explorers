import type { Metadata } from "next";
import { QuestionBankScreen } from "@/components/questions/question-bank-screen";
import { requireAnyRole } from "@/lib/auth";
import { listQuestions, questionCountsBySubject } from "@/lib/question-bank";
import { listSubjects } from "@/lib/school-setup";

export const metadata: Metadata = { title: "Question bank" };
export const dynamic = "force-dynamic";

export default async function QuestionBankPage() {
  // The layout already gated this to teachers and admins; asking again keeps
  // the page correct on its own and gives us the verified schoolId to query
  // with. A student never reaches either check.
  const session = await requireAnyRole(["teacher", "admin"]);

  const [page, subjects, counts] = await Promise.all([
    listQuestions(session.schoolId),
    listSubjects(session.schoolId),
    questionCountsBySubject(session.schoolId),
  ]);

  return (
    <QuestionBankScreen
      initial={page}
      subjects={subjects.map((s) => ({ id: s.id, name: s.name }))}
      initialCounts={counts}
    />
  );
}
