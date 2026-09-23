import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { SetupError } from "@/lib/errors";
import {
  getTestSchedule,
  scheduleSection,
  unscheduleSection,
} from "@/lib/scheduling";
import { fieldErrors, objectIdSchema, scheduleSlotSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Teachers set papers and teachers schedule them; admins oversee both. */
const AUTHORS = ["teacher", "admin"] as const;

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

export const GET = withAuth<Ctx>(
  async (_request, auth, context) => {
    const { id } = await context.params;
    if (!objectIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "No such test." }, { status: 404 });
    }

    try {
      return NextResponse.json({ schedule: await getTestSchedule(auth.schoolId, id) });
    } catch (error) {
      return failed(error, "/api/tests/[id]/schedule GET", "Could not load that schedule.");
    }
  },
  { roles: AUTHORS }
);

/** Books one class-section into a lab, or moves it. */
export const PUT = withAuth<Ctx>(
  async (request, auth, context) => {
    const { id } = await context.params;
    if (!objectIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "No such test." }, { status: 404 });
    }

    const parsed = scheduleSlotSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Some details need fixing.", fields: fieldErrors(parsed.error) },
        { status: 400 }
      );
    }

    try {
      const slot = await scheduleSection(auth.schoolId, id, auth.userId, parsed.data);
      return NextResponse.json({ slot });
    } catch (error) {
      return failed(error, "/api/tests/[id]/schedule PUT", "Could not book that slot.");
    }
  },
  { roles: AUTHORS }
);

/** Takes a class-section back out of the timetable. */
export const DELETE = withAuth<Ctx>(
  async (request, auth, context) => {
    const { id } = await context.params;
    const sectionId = new URL(request.url).searchParams.get("sectionId") ?? "";

    if (!objectIdSchema.safeParse(id).success || !objectIdSchema.safeParse(sectionId).success) {
      return NextResponse.json({ error: "No such slot." }, { status: 404 });
    }

    try {
      return NextResponse.json(await unscheduleSection(auth.schoolId, id, sectionId));
    } catch (error) {
      return failed(error, "/api/tests/[id]/schedule DELETE", "Could not cancel that slot.");
    }
  },
  { roles: AUTHORS }
);
