import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { withAuth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Read one user by id.
 *
 * The id comes from the URL, which is attacker-controlled, so it is only ever
 * used *alongside* the school filter — never on its own. A correctly guessed
 * id from another school matches nothing and returns 404, which also avoids
 * confirming that the id exists at all.
 */
export const GET = withAuth<Ctx>(async (_request, auth, context) => {
  const { id } = await context.params;

  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "No such user." }, { status: 404 });
  }

  await connectToDatabase();

  const user = await User.findOne({ _id: id, schoolId: auth.schoolId })
    .select("name email role sectionId createdAt")
    .lean();

  if (!user) {
    return NextResponse.json({ error: "No such user." }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      sectionId: user.sectionId ? String(user.sectionId) : null,
    },
  });
});

/** Rename a user. Same scoping rule as the read. */
export const PATCH = withAuth<Ctx>(
  async (request, auth, context) => {
    const { id } = await context.params;

    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "No such user." }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
    }

    const name = (body as { name?: unknown })?.name;
    if (typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { error: "Give the user a name of at least 2 characters." },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const updated = await User.findOneAndUpdate(
      { _id: id, schoolId: auth.schoolId }, // school filter is not optional
      { $set: { name: name.trim() } },
      { new: true }
    )
      .select("name email role")
      .lean();

    if (!updated) {
      return NextResponse.json({ error: "No such user." }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: String(updated._id),
        name: updated.name,
        email: updated.email,
        role: updated.role,
      },
    });
  },
  { roles: ["admin"] }
);
