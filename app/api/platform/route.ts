import { NextResponse } from "next/server";
import { SetupError } from "@/lib/errors";
import { getPlatformOverview, requirePlatformOwner } from "@/lib/platform";
import { auditConfig } from "@/lib/config-audit";

export const dynamic = "force-dynamic";

/**
 * The owner view's data, as JSON.
 *
 * Behind the same `requirePlatformOwner` gate as the page — the gate is a
 * function both call, not something the page does on its own that an API
 * beside it forgets.
 */
export async function GET() {
  try {
    await requirePlatformOwner();
  } catch (error) {
    // 404 for everyone who is not the owner, including signed-out callers.
    // Confirming the route exists has no upside.
    if (error instanceof SetupError) {
      return NextResponse.json({ error: "No such page." }, { status: 404 });
    }
    throw error;
  }

  // The config audit reports presence and shape, never values — see
  // lib/config-audit.ts. It rides along here so a deployment can be checked
  // from a script rather than by eye.
  return NextResponse.json(
    { ...(await getPlatformOverview()), config: auditConfig() },
    { headers: { "cache-control": "no-store" } }
  );
}
