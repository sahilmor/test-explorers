import type { Metadata } from "next";
import { SubjectsScreen } from "@/components/admin/subjects-screen";
import { requireRole } from "@/lib/auth";
import { listSubjects } from "@/lib/school-setup";

export const metadata: Metadata = { title: "Subjects" };
export const dynamic = "force-dynamic";

export default async function SubjectsPage() {
  const session = await requireRole("admin");
  const subjects = await listSubjects(session.schoolId);

  return <SubjectsScreen initial={subjects} />;
}
