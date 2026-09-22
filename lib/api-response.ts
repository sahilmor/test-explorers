import { NextResponse } from "next/server";
import { SetupError } from "@/lib/errors";
import { PlanError } from "@/lib/entitlements";

/**
 * Turns a thrown `SetupError` into the response for it.
 *
 * Exists mainly so a `PlanError` carries its `planBlock` through to the
 * browser. Without it a 402 looks like any other refusal, and the screen
 * cannot tell "fix this field" from "this needs paying for" — which is the
 * difference between a form error and an upgrade prompt.
 */
export function setupErrorResponse(error: SetupError) {
  return NextResponse.json(
    {
      error: error.message,
      fields: error.field ? { [error.field]: error.message } : undefined,
      planBlock:
        error instanceof PlanError
          ? { reason: error.reason, upgradeHref: error.upgradeHref }
          : undefined,
    },
    { status: error.status }
  );
}
