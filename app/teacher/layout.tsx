import { AppShell } from "@/components/app/app-shell";
import { TeacherNav } from "@/components/app/teacher-nav";
import { loadCurrentUser } from "@/lib/current-user";

/**
 * Server-side role gate for everything under /teacher.
 *
 * Admins are allowed in because the question bank lives here and they oversee
 * it. Students are not, so a student typing the URL is redirected before any
 * markup is produced — there is no client-side check to disable.
 *
 * /teacher itself is a teacher's own view, so its page narrows the gate again.
 */
export default async function TeacherLayout({ children }: LayoutProps<"/teacher">) {
  const me = await loadCurrentUser(["teacher", "admin"]);

  return (
    <AppShell
      role={me.role}
      schoolName={me.schoolName}
      userName={me.userName}
      nav={<TeacherNav role={me.role} />}
    >
      {children}
    </AppShell>
  );
}
