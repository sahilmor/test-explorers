import { NextResponse } from "next/server";
import { SetupError } from "@/lib/errors";
import { requirePlatformOwner } from "@/lib/platform";
import { addPerson } from "@/lib/platform-admin";
import { fieldErrors, platformPersonSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Adds a teacher or student to somebody else's school.
 *
 * The student cap is bypassed on purpose — see lib/platform-admin.ts. The
 * owner typing in a roster during onboarding is not the party the cap exists
 * to restrain.
 */
export async function POST(request: Request, context: Ctx) {
  try {
    await requirePlatformOwner();
  } catch {
    return NextResponse.json({ error: "No such page." }, { status: 404 });
  }

  const { id } = await context.params;
  const parsed = platformPersonSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Some details need fixing.", fields: fieldErrors(parsed.error) },
      { status: 400 }
    );
  }

  try {
    const result = await addPerson(id, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof SetupError) {
      return NextResponse.json(
        {
          error: error.message,
          fields: error.field ? { [error.field]: error.message } : undefined,
        },
        { status: error.status }
      );
    }
    console.error("[/api/platform/schools/[id]/people POST] failed:", error);
    return NextResponse.json({ error: "Could not add that person." }, { status: 500 });
  }
}
