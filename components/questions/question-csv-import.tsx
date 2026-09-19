"use client";

import { CsvImportFlow } from "@/components/admin/csv-import-flow";
import { QUESTION_CSV_COLUMNS, QUESTION_CSV_TEMPLATE } from "@/lib/csv";
import { DIFFICULTIES, parseOptionLetter } from "@/lib/questions-shared";

/**
 * Bulk question import.
 *
 * Deliberately the same component as the Phase 2 student import, configured
 * differently — same drop zone, same preview, same summary — so a teacher who
 * has imported students already knows how this works.
 */
export function QuestionCsvImport({
  subjectNames,
  onImported,
}: {
  subjectNames: string[];
  onImported: () => void | Promise<void>;
}) {
  const knownSubjects = new Set(subjectNames.map((s) => s.trim().toLowerCase()));

  return (
    <CsvImportFlow
      noun="question"
      endpoint="/api/questions/bulk"
      columns={QUESTION_CSV_COLUMNS}
      template={QUESTION_CSV_TEMPLATE}
      templateFileName="questions-template.csv"
      previewColumns={[
        { key: "subject", label: "Subject" },
        {
          key: "question",
          label: "Question",
          className: "max-w-[24rem] truncate font-display font-bold",
        },
        { key: "correct", label: "Correct" },
        { key: "difficulty", label: "Difficulty", className: "capitalize" },
      ]}
      describeResult={(row) => ({
        label: String(row.question ?? "").slice(0, 80) || "—",
        sublabel: String(row.subject ?? "") || undefined,
      })}
      // The same checks the server applies, minus the one that needs the
      // database, so nearly every problem surfaces before anything is created.
      checkRow={(record) => {
        const subject = record.subject ?? "";
        const text = record.question ?? "";
        const options = [
          record.optiona ?? "",
          record.optionb ?? "",
          record.optionc ?? "",
          record.optiond ?? "",
        ];
        const correct = record.correct ?? "";
        const difficulty = (record.difficulty ?? "").toLowerCase();

        const blank =
          !subject && !text && options.every((o) => !o) && !correct && !difficulty;
        if (blank) return "Blank row.";

        if (!subject) return "Missing a subject.";
        if (!knownSubjects.has(subject.trim().toLowerCase()))
          return `No subject called "${subject}".`;
        if (!text.trim()) return "Missing the question text.";

        const missing = options
          .map((o, i) => (o.trim() ? null : String.fromCharCode(65 + i)))
          .filter(Boolean);
        if (missing.length === 4) return "All four options are empty.";
        if (missing.length > 0)
          return `Option ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} empty.`;

        if (!correct.trim()) return "Missing the correct option.";
        if (parseOptionLetter(correct) === null)
          return `"${correct}" isn't A, B, C or D.`;

        if (!difficulty) return "Missing a difficulty.";
        if (!(DIFFICULTIES as readonly string[]).includes(difficulty))
          return `"${record.difficulty}" isn't easy, medium or hard.`;

        return undefined;
      }}
      footnote={
        subjectNames.length > 0 ? (
          <p className="text-xs leading-relaxed text-ink-soft">
            <span className="font-bold">Subjects you can use:</span>{" "}
            {subjectNames.join(", ")}.{" "}
            <span className="font-bold">Correct</span> is A, B, C or D.{" "}
            <span className="font-bold">Difficulty</span> is easy, medium or hard.
          </p>
        ) : (
          <p className="text-xs text-danger">
            Your school has no subjects yet — an admin needs to add some first,
            or every row will be skipped.
          </p>
        )
      }
      onImported={onImported}
    />
  );
}
