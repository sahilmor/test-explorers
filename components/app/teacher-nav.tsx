"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import type { Role } from "@/models/User";

/**
 * Nav for the /teacher area.
 *
 * An admin working in the question bank sees only the question-bank tab —
 * "Your papers" is a teacher's own view and would be empty for them.
 */
export function TeacherNav({ role }: { role: Role }) {
  const pathname = usePathname();

  const links = [
    ...(role === "teacher"
      ? [{ href: "/teacher", label: "Your papers" } as const]
      : [{ href: "/admin", label: "← Back to admin" } as const]),
    { href: "/teacher/tests", label: "Tests" } as const,
    { href: "/teacher/question-bank", label: "Question bank" } as const,
  ];

  return (
    <nav
      aria-label="Teaching"
      className="border-b-2 border-ink bg-paper-deep"
    >
      <ul className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-3 sm:px-6">
        {links.map((link) => {
          const active =
            link.href === "/teacher"
              ? pathname === "/teacher"
              : pathname.startsWith(link.href);

          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-[2px] block whitespace-nowrap border-b-[5px] px-3 py-3 font-display text-sm font-bold tracking-tight transition-colors sm:px-4",
                  "focus-visible:bg-lime-wash focus-visible:outline-none",
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
