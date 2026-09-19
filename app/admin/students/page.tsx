import type { Metadata } from "next";
import { StudentsScreen } from "@/components/admin/students-screen";
import { requireRole } from "@/lib/auth";
import { listSections, listStudents } from "@/lib/school-setup";

export const metadata: Metadata = { title: "Students" };
export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const session = await requireRole("admin");

  const [students, sections] = await Promise.all([
    listStudents(session.schoolId),
    listSections(session.schoolId),
  ]);

  return (
    <StudentsScreen
      initial={students}
      sections={sections.map((s) => ({ id: s.id, name: s.name, grade: s.grade }))}
    />
  );
}
