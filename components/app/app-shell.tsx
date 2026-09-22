import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { LogoutButton } from "@/components/app/logout-button";
import type { Role } from "@/models/User";

const ROLE_STYLE: Record<Role, string> = {
  admin: "bg-lime text-ink",
  teacher: "bg-coral text-ink",
  student: "bg-cobalt text-white",
};

/** Header + page frame shared by all three role areas. */
export function AppShell({
  role,
  schoolName,
  userName,
  nav,
  children,
}: {
  role: Role;
  schoolName: string;
  userName: string;
  /** Optional second band under the header, e.g. the admin section nav. */
  nav?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b-2 border-ink bg-paper-pure">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 sm:px-8">
          <Wordmark href={null} />

          <span
            className={`eyebrow rounded-full border-2 border-ink px-3 py-1.5 ${ROLE_STYLE[role]}`}
          >
            {role}
          </span>

          <div className="ml-auto flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="font-display text-sm font-bold leading-tight text-ink">
                {userName}
              </p>
              <p className="text-xs leading-tight text-ink-soft">{schoolName}</p>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      {nav}

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
        {children}
      </main>
    </div>
  );
}

/** Big page title used at the top of each role's home. */
export function PageHeading({
  eyebrow,
  title,
  blurb,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="eyebrow text-coral">{eyebrow}</p>
      <h1 className="mt-3 text-display-lg text-ink">{title}</h1>
      <p className="mt-3 text-ink-soft">{blurb}</p>
    </div>
  );
}
