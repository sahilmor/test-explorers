"use client";

import { CsvImportFlow } from "@/components/admin/csv-import-flow";
import { STUDENT_CSV_COLUMNS, STUDENT_CSV_TEMPLATE } from "@/lib/csv";

/**
 * Bulk student import.
 *
 * All the mechanics live in CsvImportFlow, shared with the question-bank
 * import. What is specific to students is here: which columns, which per-row
 * checks can be made without the database, and what the preview shows.
 */
export function CsvImport({
  sectionNames,
  onImported,
}: {
  sectionNames: string[];
  onImported: () => void | Promise<void>;
}) {
  const knownSections = new Set(sectionNames.map((s) => s.trim().toLowerCase()));

  return (
    <CsvImportFlow
      noun="student"
      endpoint="/api/students/bulk"
      columns={STUDENT_CSV_COLUMNS}
      template={STUDENT_CSV_TEMPLATE}
      templateFileName="students-template.csv"
      previewColumns={[
        { key: "name", label: "Name", className: "font-display font-bold" },
        { key: "email", label: "Email", className: "text-ink-soft" },
        { key: "section", label: "Section" },
      ]}
      // The same checks the server applies, minus the ones that need the
      // database, so most problems surface before anything is created.
      checkRow={(record, seen, line) => {
        const name = record.name ?? "";
        const email = (record.email ?? "").toLowerCase();
        const section = record.section ?? "";

        if (!name && !email && !section) return "Blank row.";
        if (name.trim().length < 2) return "Missing a name.";
        if (!email) return "Missing an email address.";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          return "Not a valid email address.";
        if (!section) return "Missing a section.";
        if (!knownSections.has(section.trim().toLowerCase()))
          return `No section called "${section}".`;
        if (seen.has(email)) return `Same email as line ${seen.get(email)}.`;

        seen.set(email, line);
        return undefined;
      }}
      describeResult={(row) => ({
        label: String(row.name ?? ""),
        sublabel: String(row.email ?? "") || "no email",
      })}
      footnote={
        sectionNames.length > 0 ? (
          <p className="text-xs leading-relaxed text-ink-soft">
            <span className="font-bold">Sections you can use:</span>{" "}
            {sectionNames.join(", ")}
          </p>
        ) : (
          <p className="text-xs text-danger">
            You have no sections yet — add at least one before importing, or
            every row will be skipped.
          </p>
        )
      }
      onImported={onImported}
    />
  );
}
