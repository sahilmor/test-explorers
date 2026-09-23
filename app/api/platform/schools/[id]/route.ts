import { NextResponse } from "next/server";
import { SetupError } from "@/lib/errors";
import { requirePlatformOwner } from "@/lib/platform";
import { getSchoolDetail, setSchoolPlan } from "@/lib/platform-admin";
import { fieldErrors, setPlanSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * One school, in full, for the owner.
 *
 * `requirePlatformOwner` is the whole of the security here, because everything
 * below deliberately crosses the tenant boundary. Every failure is a 404, so a
 * school admin who guesses this URL learns nothing about whether it exists.
 */
async function guard(): Promise<NextResponse | null> {
  try {
    await requirePlatformOwner();
    return null;
  } catch {
    return NextResponse.json({ error: "No such page." }, { status: 404 });
  }
}

export async function GET(_request: Request, context: Ctx) {
  const denied = await guard();
  if (denied) return denied;

  const { id } = await context.params;

  try {
    return NextResponse.json(
      { school: await getSchoolDetail(id) },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof SetupError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[/api/platform/schools/[id] GET] failed:", error);
    return NextResponse.json({ error: "Could not load that school." }, { status: 500 });
  }
}

/** Sets the plan. This is what replaces a checkout. */
export async function PATCH(request: Request, context: Ctx) {
  const denied = await guard();
  if (denied) return denied;

  const { id } = await context.params;
  const parsed = setPlanSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Some details need fixing.", fields: fieldErrors(parsed.error) },
      { status: 400 }
    );
  }

  try {
    const school = await setSchoolPlan(id, {
      plan: parsed.data.plan,
      planValidUntil: parsed.data.planValidUntil,
      maxStudents: parsed.data.maxStudents,
    });

    return NextResponse.json({ school });
  } catch (error) {
    if (error instanceof SetupError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[/api/platform/schools/[id] PATCH] failed:", error);
    return NextResponse.json({ error: "Could not change that plan." }, { status: 500 });
  }
}
