import { requireRole } from "@/lib/auth";

/**
 * Server-side role gate for everything under /student.
 *
 * Only the gate lives here. The app chrome is one level down, in the
 * (dashboard) group, because the exam screen in (exam) deliberately has none —
 * a student sitting a paper should not be looking at a Sign out button.
 */
export default async function StudentLayout({ children }: LayoutProps<"/student">) {
  await requireRole("student");
  return <>{children}</>;
}
