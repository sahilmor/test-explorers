import type { Metadata } from "next";
import { LabsScreen } from "@/components/admin/labs-screen";
import { requireRole } from "@/lib/auth";
import { listLabs } from "@/lib/labs";

export const metadata: Metadata = { title: "Labs" };
export const dynamic = "force-dynamic";

export default async function LabsPage() {
  const session = await requireRole("admin");
  return <LabsScreen initial={await listLabs(session.schoolId)} />;
}
