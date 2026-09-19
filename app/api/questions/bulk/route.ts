import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { CsvError } from "@/lib/csv";
import { SetupError } from "@/lib/school-setup";
import { importQuestionsFromCsv } from "@/lib/question-bank";

export const dynamic = "force-dynamic";

// Questions need no password hashing, so this is far cheaper than the student
// import — but a 500-row insert plus validation still deserves headroom.
export const maxDuration = 60;

/** Don't read a huge file into memory just to reject it. */
const MAX_BYTES = 1_000_000;

/**
 * Bulk question import.
 *
 * Takes the raw CSV text rather than rows parsed by the browser. The preview
 * the teacher confirmed was parsed by the same module (`lib/csv.ts`), but the
 * server parses the file itself so the client cannot decide what gets created.
 */
export const POST = withAuth(
  async (request, auth) => {
    const contentType = request.headers.get("content-type") ?? "";

    let csvText: string;

    if (contentType.includes("application/json")) {
      try {
        const body = (await request.json()) as { csv?: unknown };
        if (typeof body.csv !== "string") {
          return NextResponse.json(
            { error: "Send the file's contents as a `csv` string." },
            { status: 400 }
          );
        }
        csvText = body.csv;
      } catch {
        return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
      }
    } else if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Attach a CSV file." }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { error: "That file is larger than 1 MB. Split it and upload the parts." },
          { status: 413 }
        );
      }
      csvText = await file.text();
    } else {
      return NextResponse.json(
        { error: "Send the CSV as JSON or as a file upload." },
        { status: 415 }
      );
    }

    if (csvText.length > MAX_BYTES) {
      return NextResponse.json(
        { error: "That file is larger than 1 MB. Split it and upload the parts." },
        { status: 413 }
      );
    }

    try {
      const summary = await importQuestionsFromCsv(
        auth.schoolId,
        auth.userId,
        csvText
      );
      return NextResponse.json(summary, { status: 200 });
    } catch (error) {
      // A malformed file or a missing column is the teacher's problem to fix,
      // so pass the parser's specific message straight through rather than
      // flattening it to "something went wrong".
      if (error instanceof CsvError) {
        return NextResponse.json(
          { error: error.message, line: error.line },
          { status: 400 }
        );
      }
      if (error instanceof SetupError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      console.error("[/api/questions/bulk] failed:", error);
      return NextResponse.json(
        { error: "The import failed partway through." },
        { status: 500 }
      );
    }
  },
  { roles: ["teacher", "admin"] }
);
