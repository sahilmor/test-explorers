import { redirect } from "next/navigation";
import { getSession, requireAnyRole, type SessionClaims } from "@/lib/auth";
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
export async function loadCurrentUser(
  roles: Role | readonly Role[]
): Promise<CurrentUser> {
  const session = await requireAnyRole(
    typeof roles === "string" ? [roles] : roles
  );

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

/**
 * The session, but only if the user it names still exists.
 *
 * /login and /signup send a signed-in visitor to their own area. If the token
 * is still valid but the account behind it has gone — deleted, or the database
 * swapped underneath a live cookie — that redirect lands on a role layout,
 * which cannot find the user and redirects back to /login, and the browser
 * loops until it gives up.
 *
 * Checking the account exists before bouncing costs one indexed lookup on two
 * pages and makes the loop impossible.
 */
export async function getLiveSession(): Promise<SessionClaims | null> {
  const session = await getSession();
  if (!session) return null;

  await connectToDatabase();

  const exists = await User.exists({
    _id: session.userId,
    schoolId: session.schoolId,
  });

  return exists ? session : null;
}
