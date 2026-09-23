import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { SetupError } from "@/lib/errors";
import { activateSlot } from "@/lib/scheduling";
import { objectIdSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Opens a sitting and reveals its code.
 *
 * Teachers and admins only — the code must never reach a student through the
 * app, or the lab is no longer the thing controlling access. It cannot be
 * generated before the slot starts, so there is nothing to leak in advance,
 * and whoever opened it is recorded on the slot.
 */
export const POST = withAuth<Ctx>(
  async (request, auth, context) => {
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const sectionId = (body as { sectionId?: unknown })?.sectionId;

    if (
      !objectIdSchema.safeParse(id).success ||
      typeof sectionId !== "string" ||
      !objectIdSchema.safeParse(sectionId).success
    ) {
      return NextResponse.json({ error: "No such sitting." }, { status: 404 });
    }

    try {
      const slot = await activateSlot(auth.schoolId, id, sectionId, auth.userId);
      return NextResponse.json({ slot });
    } catch (error) {
      if (error instanceof SetupError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      console.error("[/api/tests/[id]/schedule/activate] failed:", error);
      return NextResponse.json({ error: "Could not open that sitting." }, { status: 500 });
    }
  },
  { roles: ["teacher", "admin"] }
);
