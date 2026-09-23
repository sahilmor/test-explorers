import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { SetupError } from "@/lib/errors";
import { createLab, listLabs } from "@/lib/labs";
import { fieldErrors, labSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Labs are school setup, like sections and subjects: admins own them. */
export const GET = withAuth(
  async (_request, auth) => NextResponse.json({ labs: await listLabs(auth.schoolId) }),
  { roles: ["admin", "teacher"] }
);

export const POST = withAuth(
  async (request, auth) => {
    const parsed = labSchema.safeParse(await request.json().catch(() => null));

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Some details need fixing.", fields: fieldErrors(parsed.error) },
        { status: 400 }
      );
    }

    try {
      const lab = await createLab(auth.schoolId, parsed.data);
      return NextResponse.json({ lab }, { status: 201 });
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
      console.error("[/api/labs POST] failed:", error);
      return NextResponse.json({ error: "Could not create that lab." }, { status: 500 });
    }
  },
  { roles: ["admin"] }
);
