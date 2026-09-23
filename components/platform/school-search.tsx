"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pill, TableFrame, Td, Th, Tr } from "@/components/ui/data-table";
import { formatPaise } from "@/lib/plans";
import type { PlatformSchool } from "@/lib/platform";
import { cn } from "cn";

type Sort = "recent" | "name" | "students" | "revenue";

/**
 * The schools list, searchable.
 *
 * Every row is a link into managing that school, because with thirty-odd
 * schools the list is a way in rather than a thing to read. Filtering happens
 * in the browser against an already-loaded list — there is no request per
 * keystroke, and at this size there never needs to be.
 */
export function SchoolSearch({ schools }: { schools: PlatformSchool[] }) {
  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState<"all" | "trial" | "active" | "expired">("all");
  const [sort, setSort] = useState<Sort>("recent");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();

    const filtered = schools.filter((s) => {
      if (plan !== "all" && s.plan !== plan) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.slug.includes(q);
    });

    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "students") return b.studentCount - a.studentCount;
      if (sort === "revenue") return b.revenuePaise - a.revenuePaise;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [schools, search, plan, sort]);

  const counts = useMemo(
    () => ({
      all: schools.length,
      trial: schools.filter((s) => s.plan === "trial").length,
      active: schools.filter((s) => s.plan === "active").length,
      expired: schools.filter((s) => s.plan === "expired").length,
    }),
    [schools]
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search schools…"
          aria-label="Search schools"
          className="h-11 min-w-0 flex-1 rounded-lg border-2 border-paper/30 bg-transparent px-3.5 text-sm text-paper placeholder:text-paper/40 focus-visible:border-lime focus-visible:outline-none sm:max-w-xs"
        />

        <div className="flex flex-wrap gap-1.5">
          {(["all", "active", "trial", "expired"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPlan(key)}
              aria-pressed={plan === key}
              className={cn(
                "min-h-11 rounded-lg border-2 px-3 font-display text-xs font-bold capitalize transition-colors sm:min-h-0 sm:py-2",
                plan === key
                  ? "border-lime bg-lime text-ink"
                  : "border-paper/25 text-paper/70 hover:border-paper/50 hover:text-paper"
              )}
            >
              {key} <span className="tabular-nums opacity-60">{counts[key]}</span>
            </button>
          ))}
        </div>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort schools"
          className="h-11 rounded-lg border-2 border-paper/30 bg-ink px-3 font-display text-xs font-bold text-paper focus-visible:border-lime focus-visible:outline-none"
        >
          <option value="recent">Newest first</option>
          <option value="name">By name</option>
          <option value="students">Most students</option>
          <option value="revenue">Most revenue</option>
        </select>
      </div>

      <TableFrame
        tone="lime"
        head={
          <tr>
            <Th>School</Th>
            <Th>Plan</Th>
            <Th>Valid until</Th>
            <Th>Students</Th>
            <Th>Papers</Th>
            <Th>Sittings</Th>
            <Th>Revenue</Th>
            <Th className="text-right">Manage</Th>
          </tr>
        }
      >
        {rows.map((school) => (
          <Tr key={school.id}>
            <Td>
              <Link
                href={`/platform/schools/${school.id}`}
                className="font-display font-bold underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
              >
                {school.name}
              </Link>
              <span className="block text-xs text-ink-soft">
                joined{" "}
                {new Date(school.createdAt).toLocaleDateString(undefined, {
                  day: "numeric", month: "short", year: "numeric",
                })}
              </span>
            </Td>
            <Td>
              {school.plan === "active" ? (
                <Pill tone="lime">Active</Pill>
              ) : school.plan === "trial" ? (
                <Pill tone="cobalt">Trial</Pill>
              ) : (
                <Pill tone="coral">Expired</Pill>
              )}
            </Td>
            <Td className="whitespace-nowrap text-ink-soft">
              {new Date(school.planValidUntil).toLocaleDateString(undefined, {
                day: "numeric", month: "short", year: "numeric",
              })}
            </Td>
            <Td className="tabular-nums">
              {school.studentCount}
              <span className="text-ink-soft"> / {school.maxStudents}</span>
            </Td>
            <Td className="tabular-nums">{school.testCount}</Td>
            <Td className="tabular-nums">{school.attemptCount}</Td>
            <Td className="font-display font-bold tabular-nums">
              {school.revenuePaise > 0 ? (
                formatPaise(school.revenuePaise)
              ) : (
                <span className="font-normal text-ink-faint">—</span>
              )}
            </Td>
            <Td className="text-right">
              <Link
                href={`/platform/schools/${school.id}`}
                className="inline-flex min-h-11 items-center rounded-md border-2 border-transparent px-2.5 font-display text-xs font-bold text-cobalt transition-colors hover:border-cobalt hover:bg-cobalt-wash focus-visible:border-ink focus-visible:outline-none sm:min-h-0 sm:py-1"
              >
                Manage
              </Link>
            </Td>
          </Tr>
        ))}
      </TableFrame>

      <p className="mt-3 text-sm text-paper/55">
        Showing {rows.length} of {schools.length} school
        {schools.length === 1 ? "" : "s"}.
      </p>
    </div>
  );
}
