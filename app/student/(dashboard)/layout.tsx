import { AppShell } from "@/components/app/app-shell";
import { loadCurrentUser } from "@/lib/current-user";

/** Header and page frame for a student's ordinary screens. */
export default async function StudentDashboardLayout({
  children,
}: LayoutProps<"/student">) {
  const me = await loadCurrentUser("student");

  return (
    <AppShell role={me.role} schoolName={me.schoolName} userName={me.userName}>
      {children}
    </AppShell>
  );
}
