import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { setupErrorResponse } from "@/lib/api-response";
import { selfServeBillingEnabled } from "@/lib/billing-access";
import { SetupError } from "@/lib/errors";
import { completeCheckout, recordFailure } from "@/lib/billing";
import { checkoutResultSchema, fieldErrors } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * What Razorpay Checkout hands back in the browser.
 *
 * The signature is checked here against the key secret before a single field
 * on the school changes — this route exists precisely so that the browser
 * saying "paid" is never enough on its own. The webhook is the belt to this
 * one's braces: whichever arrives first activates, the other reports that it
 * was already done.
 */
export const POST = withAuth(
  async (request, auth) => {
    if (!selfServeBillingEnabled()) return selfServeOff();

    const parsed = checkoutResultSchema.safeParse(await request.json().catch(() => null));

    if (!parsed.success) {
      return NextResponse.json(
        { error: "That payment response was incomplete.", fields: fieldErrors(parsed.error) },
        { status: 400 }
      );
    }

    // The customer closed the Razorpay window, or their card was declined.
    // Recorded, but nothing about the plan moves.
    if (parsed.data.cancelled) {
      await recordFailure({
        schoolId: auth.schoolId,
        orderId: parsed.data.razorpay_order_id,
        paymentId: parsed.data.razorpay_payment_id ?? null,
        reason: parsed.data.reason?.slice(0, 300) ?? "Cancelled at the payment window.",
        // Only worth asking Razorpay when a payment actually got far enough
        // to have an id. Closing the window never does.
        enrich: Boolean(parsed.data.razorpay_payment_id),
      });

      return NextResponse.json(
        {
          cancelled: true,
          error:
            "Payment cancelled — nothing was charged and your plan is exactly as it was.",
        },
        { status: 200 }
      );
    }

    try {
      const result = await completeCheckout({
        schoolId: auth.schoolId,
        orderId: parsed.data.razorpay_order_id,
        paymentId: parsed.data.razorpay_payment_id!,
        signature: parsed.data.razorpay_signature!,
      });

      return NextResponse.json({
        activated: result.activated,
        alreadyApplied: result.alreadyApplied,
        planValidUntil: result.planValidUntil?.toISOString() ?? null,
      });
    } catch (error) {
      if (error instanceof SetupError) return setupErrorResponse(error);
      console.error("[/api/billing/verify] failed:", error);
      return NextResponse.json(
        {
          error:
            "We couldn't confirm that payment. Your plan is unchanged — check the billing page in a minute, or send us the payment id.",
        },
        { status: 500 }
      );
    }
  },
  { roles: ["admin"] }
);

/**
 * Self-serve checkout is off.
 *
 * Plans are sold outside the app and set by a super-admin, so this route has
 * no school-facing caller. It is kept, working and tested, behind one flag
 * rather than deleted — turning SELF_SERVE_BILLING back on is the whole of
 * what bringing checkout back would take.
 *
 * 404 rather than 403: as far as a school is concerned this endpoint does not
 * exist, and saying "forbidden" only advertises that it does.
 */
function selfServeOff() {
  return NextResponse.json({ error: "Not found." }, { status: 404 });
}
