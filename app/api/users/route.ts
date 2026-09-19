import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AccountError, hashPassword } from "@/lib/accounts";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { createUserSchema, fieldErrors } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * List the users of the caller's own school.
 *
 * There is no way to ask for another school's users: the filter is built from
 * auth.schoolId, and no query parameter can widen it.
 */
export const GET = withAuth(async (_request, auth) => {
  await connectToDatabase();

  const users = await User.find({ schoolId: auth.schoolId })
    .select("name email role classId createdAt")
    .sort({ createdAt: 1 })
    .lean();

  return Response.json({
    users: users.map((u) => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      role: u.role,
      classId: u.classId ? String(u.classId) : null,
    })),
  });
});

/**
 * Add a teacher or student to the caller's own school.
 *
 * The request body is parsed by a schema that has no schoolId field at all, so
 * a caller who posts one is ignored rather than obeyed — the new user is
 * always attached to auth.schoolId.
 */
export const POST = withAuth(
  async (request, auth) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
    }

    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Some details need fixing.", fields: fieldErrors(parsed.error) },
        { status: 400 }
      );
    }

    await connectToDatabase();

    try {
      const created = await User.create({
        schoolId: auth.schoolId, // from the token. Never from the body.
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash: await hashPassword(parsed.data.password),
        role: parsed.data.role,
        classId: parsed.data.classId ?? null,
      });

      return NextResponse.json(
        {
          user: {
            id: String(created._id),
            name: created.name,
            email: created.email,
            role: created.role,
            schoolId: String(created.schoolId),
          },
        },
        { status: 201 }
      );
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        (error as { code?: number }).code === 11000
      ) {
        return NextResponse.json(
          {
            error: "That email already has an account.",
            fields: { email: "That email already has an account." },
          },
          { status: 409 }
        );
      }
      if (error instanceof AccountError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      console.error("[/api/users POST] failed:", error);
      return NextResponse.json({ error: "Could not create that user." }, { status: 500 });
    }
  },
  { roles: ["admin"] }
);
