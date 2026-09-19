import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { withAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Diagrams and graphs for a question. Uploaded to Vercel Blob; only the
 * resulting URL is stored on the question document.
 *
 * Kept under Vercel's 4.5 MB request body limit — a diagram that large is
 * almost certainly an unshrunk photo, and saying so is more useful than a
 * 413 from the platform.
 */
const MAX_BYTES = 4 * 1024 * 1024;

const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

export const POST = withAuth(
  async (request, auth) => {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      // Say what is missing rather than failing with a library stack trace.
      return NextResponse.json(
        {
          error:
            "Image uploads aren't configured on this deployment (no BLOB_READ_WRITE_TOKEN). You can still add questions without an image.",
        },
        { status: 501 }
      );
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Attach the image as a file." }, { status: 415 });
    }

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Attach an image file." }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { error: "That isn't an image we can use. PNG, JPEG, WebP, GIF or SVG." },
        { status: 415 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "That image is larger than 4 MB. Shrink it and try again." },
        { status: 413 }
      );
    }

    try {
      // The path is namespaced by school so one school's uploads are never
      // mixed in with another's, and `addRandomSuffix` stops two teachers
      // uploading "diagram.png" from overwriting each other.
      const blob = await put(
        `questions/${auth.schoolId}/${file.name}`,
        file,
        { access: "public", addRandomSuffix: true, contentType: file.type }
      );

      return NextResponse.json({ url: blob.url }, { status: 201 });
    } catch (error) {
      console.error("[/api/uploads/question-image] failed:", error);
      return NextResponse.json(
        { error: "The upload failed. Try again, or add the question without an image." },
        { status: 500 }
      );
    }
  },
  { roles: ["teacher", "admin"] }
);
