import { describe, expect, it } from "vitest";
import { CsvError, parseCsv, toObjects, STUDENT_CSV_COLUMNS } from "@/lib/csv";

/**
 * The CSV reader runs in two places — the browser preview and the server — and
 * an admin's confirmation is only meaningful if both agree. These cases are the
 * shapes that actually come out of Excel and Google Sheets.
 */
describe("parsing CSV", () => {
  it("reads a plain file", () => {
    const table = parseCsv("name,email,section\nAda,ada@x.test,Grade 9 - A\n");

    expect(table.header).toEqual(["name", "email", "section"]);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0].values).toEqual(["Ada", "ada@x.test", "Grade 9 - A"]);
  });

  it("numbers lines from 1 so error messages match the spreadsheet", () => {
    const table = parseCsv("name,email\nA,a@x.test\nB,b@x.test\n");

    // Header is line 1, so the first data row is line 2.
    expect(table.rows.map((r) => r.line)).toEqual([2, 3]);
  });

  it("keeps commas that are inside quotes", () => {
    const table = parseCsv('name,email,section\n"Khan, Aisha",a@x.test,9A\n');

    expect(table.rows[0].values).toEqual(["Khan, Aisha", "a@x.test", "9A"]);
  });

  it("handles escaped double quotes", () => {
    const table = parseCsv('name,email\n"She said ""hi""",a@x.test\n');

    expect(table.rows[0].values[0]).toBe('She said "hi"');
  });

  it("handles a newline inside a quoted value", () => {
    const table = parseCsv('name,email\n"Line one\nLine two",a@x.test\n');

    expect(table.rows).toHaveLength(1);
    expect(table.rows[0].values[0]).toBe("Line one\nLine two");
  });

  it("handles CRLF line endings", () => {
    // What a file saved on Windows looks like.
    const table = parseCsv("name,email\r\nAda,ada@x.test\r\n");

    expect(table.rows).toHaveLength(1);
    expect(table.rows[0].values).toEqual(["Ada", "ada@x.test"]);
  });

  it("strips a UTF-8 BOM, which Excel adds", () => {
    const table = parseCsv("﻿name,email\nAda,ada@x.test\n");

    expect(table.header).toEqual(["name", "email"]);
  });

  it("ignores a trailing blank line rather than calling it a bad row", () => {
    const table = parseCsv("name,email\nAda,ada@x.test\n\n");

    expect(table.rows).toHaveLength(1);
  });

  it("rejects an empty file with a message an admin can act on", () => {
    expect(() => parseCsv("")).toThrow(CsvError);
    expect(() => parseCsv("   ")).toThrow(/empty/i);
  });

  it("rejects a header with no rows under it", () => {
    expect(() => parseCsv("name,email,section\n")).toThrow(
      /nothing under it/i
    );
  });

  it("reports an unterminated quote with its line number", () => {
    try {
      parseCsv('name,email\n"never closed,a@x.test\n');
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(CsvError);
      expect((error as CsvError).message).toMatch(/never closed|stray/i);
      expect((error as CsvError).line).toBe(2);
    }
  });
});

describe("mapping rows onto columns", () => {
  it("matches column names regardless of case and spacing", () => {
    const table = parseCsv("  NAME , E mail ,Section\nAda,ada@x.test,9A\n");
    // "E mail" normalises to "email".
    const rows = toObjects(table, STUDENT_CSV_COLUMNS);

    expect(rows[0].record).toEqual({
      name: "Ada",
      email: "ada@x.test",
      section: "9A",
    });
  });

  it("names the missing columns instead of failing vaguely", () => {
    const table = parseCsv("name,email\nAda,ada@x.test\n");

    expect(() => toObjects(table, STUDENT_CSV_COLUMNS)).toThrow(/section/);
    expect(() => toObjects(table, STUDENT_CSV_COLUMNS)).toThrow(
      /name, email, section/
    );
  });

  it("trims whitespace around values", () => {
    const table = parseCsv("name,email,section\n  Ada  , ada@x.test ,  9A \n");
    const rows = toObjects(table, STUDENT_CSV_COLUMNS);

    expect(rows[0].record.name).toBe("Ada");
    expect(rows[0].record.email).toBe("ada@x.test");
    expect(rows[0].record.section).toBe("9A");
  });

  it("gives an empty string for a short row rather than undefined", () => {
    const table = parseCsv("name,email,section\nAda,ada@x.test\n");
    const rows = toObjects(table, STUDENT_CSV_COLUMNS);

    expect(rows[0].record.section).toBe("");
  });
});
