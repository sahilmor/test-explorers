import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScheduleScreen } from "@/components/scheduling/schedule-screen";
import { requireAnyRole } from "@/lib/auth";
import { SetupError } from "@/lib/errors";
import { getTestSchedule } from "@/lib/scheduling";

export const metadata: Metadata = { title: "Schedule" };
export const dynamic = "force-dynamic";

export default async function SchedulePage({
  params,
}: PageProps<"/teacher/tests/[id]/schedule">) {
  const session = await requireAnyRole(["teacher", "admin"]);
  const { id } = await params;

  let schedule;
  try {
    schedule = await getTestSchedule(session.schoolId, id);
  } catch (error) {
    if (error instanceof SetupError) notFound();
    throw error;
  }

  return <ScheduleScreen initial={schedule} />;
}
