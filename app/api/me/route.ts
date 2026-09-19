import { connectToDatabase } from "@/lib/db";
import { withAuth } from "@/lib/auth";
import School from "@/models/School";
import User from "@/models/User";

export const dynamic = "force-dynamic";

/**
 * Who am I? Every field here is looked up from the token's own ids — the
 * request cannot ask about anybody else.
 */
export const GET = withAuth(async (_request, auth) => {
  await connectToDatabase();

  const [user, school] = await Promise.all([
    User.findOne({ _id: auth.userId, schoolId: auth.schoolId })
      .select("name email role sectionId createdAt")
      .lean(),
    School.findById(auth.schoolId).select("name slug plan planValidUntil").lean(),
  ]);

  if (!user || !school) {
    return Response.json({ error: "Account no longer exists." }, { status: 401 });
  }

  return Response.json({
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      sectionId: user.sectionId ? String(user.sectionId) : null,
    },
    school: {
      id: String(school._id),
      name: school.name,
      slug: school.slug,
      plan: school.plan,
      planValidUntil: school.planValidUntil,
    },
  });
});
