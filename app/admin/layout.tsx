import { AppShell } from "@/components/app/app-shell";
import { loadCurrentUser } from "@/lib/current-user";

/**
 * Server-side role gate for everything under /admin.
 *
 * This runs before any markup is produced, so a signed-in user with a
 * different role is redirected to their own area instead of rendering this
 * one. There is no client-side check here to disable.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const me = await loadCurrentUser("admin");

  return (
    <AppShell role={me.role} schoolName={me.schoolName} userName={me.userName}>
      {children}
    </AppShell>
  );
}
