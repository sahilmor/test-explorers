"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/sections", label: "Sections" },
  { href: "/admin/subjects", label: "Subjects" },
  { href: "/admin/labs", label: "Labs" },
  { href: "/admin/teachers", label: "Teachers" },
  { href: "/admin/students", label: "Students" },
  { href: "/teacher/tests", label: "Tests" },
  { href: "/teacher/question-bank", label: "Question bank" },
] as const;

/**
 * Admin section nav. Sits under the header so moving between setup screens is
 * one click from anywhere — an admin populating a school bounces between
 * sections and students constantly.
 */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="School setup"
      className="border-b-2 border-ink bg-paper-deep"
    >
      <ul className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-3 sm:px-6">
        {LINKS.map((link) => {
          const active =
            link.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(link.href);

          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-[2px] block whitespace-nowrap border-b-[5px] px-3 py-3 font-display text-sm font-bold tracking-tight transition-colors sm:px-4",
                  "focus-visible:outline-none focus-visible:bg-lime-wash",
                  active
                    ? "border-coral text-ink"
                    : "border-transparent text-ink-soft hover:border-ink/25 hover:text-ink"
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
