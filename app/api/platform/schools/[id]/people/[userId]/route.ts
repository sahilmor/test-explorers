import { NextResponse } from "next/server";
import { SetupError } from "@/lib/errors";
import { requirePlatformOwner } from "@/lib/platform";
import { removePerson, resetPassword, updatePerson } from "@/lib/platform-admin";
import { fieldErrors, platformPersonUpdateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; userId: string }> };

async function guard(): Promise<NextResponse | null> {
  try {
    await requirePlatformOwner();
    return null;
  } catch {
    return NextResponse.json({ error: "No such page." }, { status: 404 });
  }
}

function failed(error: unknown, where: string, fallback: string) {
  if (error instanceof SetupError) {
    return NextResponse.json(
      {
        error: error.message,
        fields: error.field ? { [error.field]: error.message } : undefined,
      },
      { status: error.status }
    );
  }
  console.error(`[${where}] failed:`, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

/** Edit a person, or — with `{ resetPassword: true }` — hand them a new one. */
export async function PATCH(request: Request, context: Ctx) {
  const denied = await guard();
  if (denied) return denied;

  const { id, userId } = await context.params;
  const body = await request.json().catch(() => null);

  if ((body as { resetPassword?: boolean })?.resetPassword) {
    try {
      return NextResponse.json(await resetPassword(id, userId));
    } catch (error) {
      return failed(error, "platform reset password", "Could not reset that password.");
    }
  }

  const parsed = platformPersonUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Some details need fixing.", fields: fieldErrors(parsed.error) },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json({ person: await updatePerson(id, userId, parsed.data) });
  } catch (error) {
    return failed(error, "platform update person", "Could not save that change.");
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  const denied = await guard();
  if (denied) return denied;

  const { id, userId } = await context.params;

  try {
    return NextResponse.json(await removePerson(id, userId));
  } catch (error) {
    return failed(error, "platform remove person", "Could not remove that person.");
  }
}
