import type { Metadata } from "next";
import { SectionsScreen } from "@/components/admin/sections-screen";
import { requireRole } from "@/lib/auth";
import { listSections } from "@/lib/school-setup";

export const metadata: Metadata = { title: "Sections" };
export const dynamic = "force-dynamic";

export default async function SectionsPage() {
  // The layout already gated this; asking again keeps the page correct on its
  // own and gives us the verified schoolId to query with.
  const session = await requireRole("admin");
  const sections = await listSections(session.schoolId);

  return <SectionsScreen initial={sections} />;
}
