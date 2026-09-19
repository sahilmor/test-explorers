import type { Metadata } from "next";
import { TeachersScreen } from "@/components/admin/teachers-screen";
import { requireRole } from "@/lib/auth";
import { listSections, listSubjects, listTeachers } from "@/lib/school-setup";

export const metadata: Metadata = { title: "Teachers" };
export const dynamic = "force-dynamic";

export default async function TeachersPage() {
  const session = await requireRole("admin");

  const [teachers, subjects, sections] = await Promise.all([
    listTeachers(session.schoolId),
    listSubjects(session.schoolId),
    listSections(session.schoolId),
  ]);

  return (
    <TeachersScreen
      initial={teachers}
      subjects={subjects.map((s) => ({ id: s.id, name: s.name }))}
      sections={sections.map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
