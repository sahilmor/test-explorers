import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { setupErrorResponse } from "@/lib/api-response";
import { SetupError } from "@/lib/errors";
import { startUpgrade } from "@/lib/billing";

export const dynamic = "force-dynamic";

/**
 * Opens a Razorpay order for this school's upgrade.
 *
 * Takes no body at all. The school comes from the token and the amount comes
 * from the plan constants, so there is nothing a caller could tamper with.
 *
 * Deliberately *not* behind the plan check — an expired school has to be able
 * to reach the one action that un-expires it.
 */
export const POST = withAuth(
  async (_request, auth) => {
    try {
      return NextResponse.json({ order: await startUpgrade(auth.schoolId) }, { status: 201 });
    } catch (error) {
      if (error instanceof SetupError) return setupErrorResponse(error);
      console.error("[/api/billing/order] failed:", error);
      return NextResponse.json(
        { error: "Couldn't open a payment just now. Nothing has been charged." },
        { status: 500 }
      );
    }
  },
  { roles: ["admin"] }
);
