import { connectToDatabase } from "@/lib/db";
import PingModel from "@/models/Ping";

// Always hit the database; never serve a cached response.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectToDatabase();

    const written = await PingModel.create({
      message: `ping at ${new Date().toISOString()}`,
    });

    const readBack = await PingModel.findById(written._id).lean();

    if (!readBack) {
      return Response.json(
        { ok: false, error: "Wrote a document but could not read it back." },
        { status: 500 }
      );
    }

    const totalPings = await PingModel.countDocuments();

    return Response.json({
      ok: true,
      wrote: String(written._id),
      readBack: {
        id: String(readBack._id),
        message: readBack.message,
        createdAt: readBack.createdAt,
      },
      totalPings,
    });
  } catch (error) {
    console.error("[/api/ping] failed:", error);
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
