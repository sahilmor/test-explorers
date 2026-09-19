import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import School from "@/models/School";
import User, { type Role } from "@/models/User";

export type CurrentUser = {
  userId: string;
  schoolId: string;
  role: Role;
  userName: string;
  schoolName: string;
};

/**
 * Role gate + the bits of profile every dashboard header needs.
 *
 * Both lookups are keyed on ids from the verified token, so a signed-in user
 * can only ever load their own record and their own school.
 */
export async function loadCurrentUser(role: Role): Promise<CurrentUser> {
  const session = await requireRole(role);

  await connectToDatabase();

  const [user, school] = await Promise.all([
    User.findOne({ _id: session.userId, schoolId: session.schoolId })
      .select("name")
      .lean(),
    School.findById(session.schoolId).select("name").lean(),
  ]);

  // The account was deleted while the cookie was still valid.
  if (!user || !school) redirect("/login");

  return {
    userId: session.userId,
    schoolId: session.schoolId,
    role: session.role,
    userName: user.name,
    schoolName: school.name,
  };
}
