import type { Metadata } from "next";
import { PageHeading } from "@/components/app/app-shell";
import { LeaderboardPanel } from "@/components/results/leaderboard";
import { requireRole } from "@/lib/auth";
import { getSectionLeaderboard } from "@/lib/results";

export const metadata: Metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const session = await requireRole("student");
  const data = await getSectionLeaderboard(session.schoolId, session.userId);

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Leaderboard"
        title={data.sectionName ?? "Your class"}
        blurb="Average across every test your class has finished. Only closed tests count."
      />

      <LeaderboardPanel data={data} />
    </div>
  );
}
