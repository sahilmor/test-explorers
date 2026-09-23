import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { SetupError } from "@/lib/errors";
import { deleteLab, updateLab } from "@/lib/labs";
import { fieldErrors, labSchema, objectIdSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

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

export const PATCH = withAuth<Ctx>(
  async (request, auth, context) => {
    const { id } = await context.params;
    if (!objectIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "No such lab." }, { status: 404 });
    }

    const parsed = labSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Some details need fixing.", fields: fieldErrors(parsed.error) },
        { status: 400 }
      );
    }

    try {
      return NextResponse.json({ lab: await updateLab(auth.schoolId, id, parsed.data) });
    } catch (error) {
      return failed(error, "/api/labs/[id] PATCH", "Could not save that lab.");
    }
  },
  { roles: ["admin"] }
);

export const DELETE = withAuth<Ctx>(
  async (_request, auth, context) => {
    const { id } = await context.params;
    if (!objectIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "No such lab." }, { status: 404 });
    }

    try {
      return NextResponse.json(await deleteLab(auth.schoolId, id));
    } catch (error) {
      return failed(error, "/api/labs/[id] DELETE", "Could not delete that lab.");
    }
  },
  { roles: ["admin"] }
);
