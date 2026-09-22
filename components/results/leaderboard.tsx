"use client";

import { TrophyIcon } from "lucide-react";
import { ordinal } from "@/components/results/result-bits";
import type { Leaderboard } from "@/lib/results";
import { cn } from "cn";

/**
 * Cumulative standing inside a section.
 *
 * Meant to motivate, so the top three get medals and the student's own row is
 * pulled out in lime with "You" on it — findable at a glance in a class of
 * forty. Kept to a section on purpose: ranking a small class against a big one
 * discourages rather than motivates.
 */
export function LeaderboardPanel({
  data,
  limit,
  compact = false,
}: {
  data: Leaderboard;
  limit?: number;
  compact?: boolean;
}) {
  if (data.rows.length === 0) {
    return (
      <div className="rounded-xl border-2 border-ink bg-paper-pure p-6 text-center">
        <p className="font-display text-lg font-bold text-ink">
          No standings yet
        </p>
        <p className="mx-auto mt-1.5 max-w-[42ch] text-sm text-ink-soft">
          {data.testsCounted === 0
            ? "Once a test closes, how your class did shows up here."
            : "Nobody in your class has a closed test on record yet."}
        </p>
      </div>
    );
  }

  const shown = limit ? data.rows.slice(0, limit) : data.rows;
  // If the student is outside the visible slice, show them anyway — a
  // leaderboard you cannot find yourself on is just a list of other people.
  const youHidden =
    data.you && !shown.some((r) => r.studentId === data.you!.studentId);

  return (
    <div className="overflow-hidden rounded-xl border-2 border-ink bg-paper-pure">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink bg-lime px-5 py-3">
        <p className="font-display text-sm font-extrabold tracking-tight text-ink">
          {data.sectionName ?? "Your class"}
        </p>
        <p className="text-xs text-ink/70">
          across {data.testsCounted} closed test
          {data.testsCounted === 1 ? "" : "s"}
        </p>
      </div>

      <ol className="divide-y-2 divide-ink/10">
        {shown.map((row) => (
          <LeaderboardRowItem key={row.studentId} row={row} compact={compact} />
        ))}

        {youHidden && data.you ? (
          <>
            <li className="bg-paper-deep px-5 py-1 text-center text-xs text-ink-soft">
              …
            </li>
            <LeaderboardRowItem row={data.you} compact={compact} />
          </>
        ) : null}
      </ol>
    </div>
  );
}

const MEDALS: Record<number, string> = {
  1: "bg-[#F2C14E] text-ink",
  2: "bg-[#C9CDD2] text-ink",
  3: "bg-[#C68A52] text-ink",
};

function LeaderboardRowItem({
  row,
  compact,
}: {
  row: Leaderboard["rows"][number];
  compact: boolean;
}) {
  const medal = MEDALS[row.rank];

  return (
    <li
      className={cn(
        "flex items-center gap-3 px-4 py-3 sm:px-5",
        row.isYou && "bg-lime-wash"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full border-2 border-ink font-display text-sm font-extrabold",
          medal ?? "bg-paper-deep text-ink-soft"
        )}
      >
        {row.rank <= 3 ? (
          <TrophyIcon className="size-4" strokeWidth={2.5} />
        ) : (
          row.rank
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-display font-bold text-ink">{row.name}</span>
          {row.isYou ? (
            <span className="eyebrow rounded-full border-2 border-ink bg-ink px-2 py-0.5 text-lime">
              You
            </span>
          ) : null}
          {row.rank <= 3 ? (
            <span className="text-xs text-ink-soft">{ordinal(row.rank)}</span>
          ) : null}
        </span>

        {!compact ? (
          <span className="mt-0.5 block text-xs text-ink-soft">
            {row.totalScore}/{row.totalQuestions} across {row.testsTaken} test
            {row.testsTaken === 1 ? "" : "s"}
          </span>
        ) : null}
      </span>

      <span className="shrink-0 text-right">
        <span className="font-display text-lg font-extrabold tabular-nums text-ink">
          {row.averagePercentage}%
        </span>
        {compact ? (
          <span className="block text-[0.65rem] text-ink-soft">
            {row.testsTaken} test{row.testsTaken === 1 ? "" : "s"}
          </span>
        ) : null}
      </span>
    </li>
  );
}
