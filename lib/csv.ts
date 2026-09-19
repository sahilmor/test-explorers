/**
 * A small RFC 4180 CSV reader.
 *
 * This module is imported by both the browser (to preview a dropped file) and
 * the server (to actually create the students). Using the same code in both
 * places is the point: the preview an admin confirms is parsed exactly the way
 * the server will parse it, so the row numbers and values in the preview match
 * the row numbers and values in the result summary.
 *
 * Handles quoted fields, commas and newlines inside quotes, escaped double
 * quotes, CRLF, and a UTF-8 BOM. Not a general-purpose library — no streaming,
 * no custom delimiters — but correct for the files a school actually uploads
 * out of Excel or Google Sheets.
 */

export type CsvRow = {
  /** 1-based line number in the original file, for error messages. */
  line: number;
  values: string[];
};

export type CsvTable = {
  header: string[];
  rows: CsvRow[];
};

export class CsvError extends Error {
  constructor(
    message: string,
    readonly line?: number
  ) {
    super(message);
    this.name = "CsvError";
  }
}

/** Splits raw CSV text into a header row plus data rows. */
export function parseCsv(input: string): CsvTable {
  const text = input.replace(/^﻿/, ""); // strip BOM

  if (text.trim() === "") {
    throw new CsvError("That file is empty.");
  }

  const records: { line: number; values: string[] }[] = [];
  let values: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let recordStartLine = 1;
  let sawAnyChar = false;

  const endField = () => {
    values.push(field);
    field = "";
  };

  const endRecord = () => {
    endField();
    // Ignore a trailing blank line rather than reporting it as a bad row.
    const blank = values.length === 1 && values[0].trim() === "";
    if (!blank) records.push({ line: recordStartLine, values });
    values = [];
    recordStartLine = line + 1;
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    sawAnyChar = true;

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // escaped quote
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === "\n") line++;
        field += char;
      }
      continue;
    }

    if (char === '"') {
      if (field !== "") {
        throw new CsvError(
          `Line ${line}: a quote appeared in the middle of a value. Wrap the whole value in quotes, or remove them.`,
          line
        );
      }
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      endField();
      continue;
    }

    if (char === "\r") {
      if (text[i + 1] === "\n") i++;
      endRecord();
      line++;
      continue;
    }

    if (char === "\n") {
      endRecord();
      line++;
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new CsvError(
      `Line ${recordStartLine}: a quoted value was never closed. Check for a stray " character.`,
      recordStartLine
    );
  }

  if (sawAnyChar) endRecord();

  if (records.length === 0) {
    throw new CsvError("That file has no rows in it.");
  }

  const [headerRecord, ...dataRecords] = records;

  if (dataRecords.length === 0) {
    throw new CsvError(
      "That file has a header row but nothing under it. Add at least one row of data."
    );
  }

  return {
    header: headerRecord.values.map((h) => h.trim()),
    rows: dataRecords.map((r) => ({ line: r.line, values: r.values })),
  };
}

/**
 * Maps a parsed table onto named columns.
 *
 * Column matching is case- and space-insensitive, so "Name", "name" and
 * "  NAME " all work — schools export from Excel and the casing varies.
 */
export function toObjects(
  table: CsvTable,
  required: readonly string[]
): { line: number; record: Record<string, string> }[] {
  const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");

  const headerIndex = new Map<string, number>();
  table.header.forEach((h, i) => {
    const key = normalise(h);
    if (key && !headerIndex.has(key)) headerIndex.set(key, i);
  });

  const missing = required.filter((c) => !headerIndex.has(normalise(c)));
  if (missing.length > 0) {
    throw new CsvError(
      `That file is missing ${missing.length === 1 ? "a column" : "columns"}: ${missing.join(", ")}. ` +
        `The header row needs to be: ${required.join(", ")}.`
    );
  }

  return table.rows.map(({ line, values }) => {
    const record: Record<string, string> = {};
    for (const [key, index] of headerIndex) {
      record[key] = (values[index] ?? "").trim();
    }
    return { line, record };
  });
}

/** The columns a student import file must have. */
export const STUDENT_CSV_COLUMNS = ["name", "email", "section"] as const;

/** A downloadable example, offered next to the drop zone. */
export const STUDENT_CSV_TEMPLATE = `name,email,section
Aisha Khan,aisha.khan@riverbend.edu,Grade 9 - A
Ben Okoro,ben.okoro@riverbend.edu,Grade 9 - A
Chen Wei,chen.wei@riverbend.edu,Grade 10 - B
`;

/** The columns a question import file must have. */
export const QUESTION_CSV_COLUMNS = [
  "subject",
  "question",
  "optionA",
  "optionB",
  "optionC",
  "optionD",
  "correct",
  "difficulty",
] as const;

/**
 * A downloadable example, offered next to the drop zone.
 *
 * The second row deliberately contains a comma inside a quoted field, because
 * that is the case people get wrong when hand-writing a file.
 */
export const QUESTION_CSV_TEMPLATE = `subject,question,optionA,optionB,optionC,optionD,correct,difficulty
Physics,What is the SI unit of force?,Newton,Joule,Watt,Pascal,A,easy
Physics,"If a car accelerates from 0 to 20 m/s in 4 s, what is its acceleration?",4 m/s²,5 m/s²,80 m/s²,0.2 m/s²,B,medium
Physics,Which quantity is conserved in an elastic collision?,Only momentum,Only kinetic energy,Both momentum and kinetic energy,Neither,C,hard
`;
