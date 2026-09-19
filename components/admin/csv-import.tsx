"use client";

import { useRef, useState } from "react";
import { FileTextIcon, UploadCloudIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { Pill, TableFrame, Td, Th, Tr } from "@/components/ui/data-table";
import { CsvError, parseCsv, toObjects, STUDENT_CSV_COLUMNS, STUDENT_CSV_TEMPLATE } from "@/lib/csv";
import { cn } from "cn";

type PreviewRow = {
  line: number;
  name: string;
  email: string;
  section: string;
  problem?: string;
};

export type ImportRowResult = {
  line: number;
  name: string;
  email: string;
  section: string;
  status: "created" | "skipped";
  reason?: string;
};

export type ImportSummary = {
  created: number;
  skipped: number;
  results: ImportRowResult[];
};

type Stage =
  | { kind: "drop" }
  | { kind: "preview"; fileName: string; csv: string; rows: PreviewRow[] }
  | { kind: "done"; summary: ImportSummary };

/**
 * Bulk student import: drop a file, check the parsed rows, then confirm.
 *
 * The preview is parsed in the browser with the same `lib/csv` module the
 * server uses, so line numbers and values line up between what the admin
 * confirms and what comes back in the summary. The server still parses the raw
 * file itself — the browser's parse is for showing, not for deciding.
 */
export function CsvImport({
  sectionNames,
  onImported,
}: {
  sectionNames: string[];
  onImported: () => void | Promise<void>;
}) {
  const [stage, setStage] = useState<Stage>({ kind: "drop" });
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const knownSections = new Set(sectionNames.map((s) => s.trim().toLowerCase()));

  async function handleFile(file: File) {
    setError(null);

    if (!/\.(csv|txt)$/i.test(file.name)) {
      setError(
        `"${file.name}" isn't a CSV. Export your spreadsheet as CSV and try again.`
      );
      return;
    }
    if (file.size > 1_000_000) {
      setError("That file is larger than 1 MB. Split it and upload the parts.");
      return;
    }

    const csv = await file.text();

    try {
      const records = toObjects(parseCsv(csv), STUDENT_CSV_COLUMNS);

      // Client-side checks that don't need the database — the same ones the
      // server applies, so most problems surface before anything is created.
      const seen = new Map<string, number>();
      const rows: PreviewRow[] = records.map(({ line, record }) => {
        const name = record.name ?? "";
        const email = (record.email ?? "").toLowerCase();
        const section = record.section ?? "";

        let problem: string | undefined;

        if (!name && !email && !section) problem = "Blank row.";
        else if (name.trim().length < 2) problem = "Missing a name.";
        else if (!email) problem = "Missing an email address.";
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          problem = "Not a valid email address.";
        else if (!section) problem = "Missing a section.";
        else if (!knownSections.has(section.trim().toLowerCase()))
          problem = `No section called "${section}".`;
        else if (seen.has(email))
          problem = `Same email as line ${seen.get(email)}.`;

        if (!problem) seen.set(email, line);

        return { line, name, email, section, problem };
      });

      setStage({ kind: "preview", fileName: file.name, csv, rows });
    } catch (e) {
      setError(
        e instanceof CsvError
          ? e.message
          : "That file couldn't be read as CSV. Check it opens in a spreadsheet."
      );
    }
  }

  async function confirm() {
    if (stage.kind !== "preview") return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/students/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv: stage.csv }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(payload.error ?? "The import failed.");
        setBusy(false);
        return;
      }

      setStage({ kind: "done", summary: payload });
      await onImported();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }

    setBusy(false);
  }

  function reset() {
    setStage({ kind: "drop" });
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  // -------------------------------------------------------- done
  if (stage.kind === "done") {
    const { created, skipped, results } = stage.summary;
    const problems = results.filter((r) => r.status === "skipped");

    return (
      <div className="space-y-5">
        <div
          className={cn(
            "rounded-xl border-2 border-ink px-5 py-5 shadow-[5px_5px_0_var(--ink)]",
            created > 0 ? "bg-lime-wash" : "bg-coral-wash"
          )}
        >
          <p className="font-display text-2xl font-extrabold tracking-tight text-ink">
            {created} student{created === 1 ? "" : "s"} added
            {skipped > 0 ? `, ${skipped} skipped` : ""}
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {skipped > 0
              ? "Every skipped row is listed below with the reason. Fix those rows and upload just them again."
              : "Every row in the file went in cleanly."}
          </p>
        </div>

        {problems.length > 0 ? (
          <TableFrame
            tone="coral"
            head={
              <tr>
                <Th>Line</Th>
                <Th>Who</Th>
                <Th>Why it was skipped</Th>
              </tr>
            }
          >
            {problems.map((row) => (
              <Tr key={`${row.line}-${row.email}`}>
                <Td className="font-mono text-xs text-ink-soft">{row.line}</Td>
                <Td>
                  <span className="font-display font-bold">{row.name || "—"}</span>
                  <span className="block text-xs text-ink-soft">
                    {row.email || "no email"}
                  </span>
                </Td>
                <Td className="text-danger">{row.reason}</Td>
              </Tr>
            ))}
          </TableFrame>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button onClick={reset}>Import another file</Button>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------- preview
  if (stage.kind === "preview") {
    const good = stage.rows.filter((r) => !r.problem).length;
    const bad = stage.rows.length - good;

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-ink bg-paper-deep px-4 py-3">
          <FileTextIcon aria-hidden="true" className="size-5 shrink-0 text-ink" />
          <span className="font-display font-bold text-ink">{stage.fileName}</span>
          <span className="ml-auto flex flex-wrap gap-2">
            <Pill tone="lime">{good} ready</Pill>
            {bad > 0 ? <Pill tone="danger">{bad} will be skipped</Pill> : null}
          </span>
        </div>

        {error ? <FormError>{error}</FormError> : null}

        {good === 0 ? (
          <FormError>
            Nothing in this file can be imported yet. Fix the rows below and try
            again.
          </FormError>
        ) : null}

        <TableFrame
          head={
            <tr>
              <Th>Line</Th>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Section</Th>
              <Th>Status</Th>
            </tr>
          }
        >
          {stage.rows.map((row) => (
            <Tr
              key={`${row.line}-${row.email}`}
              // The hover tint has to be overridden too, or hovering a bad row
              // turns it green and reads as "this one is fine".
              className={
                row.problem
                  ? "bg-danger-wash/50 hover:bg-danger-wash/70"
                  : undefined
              }
            >
              <Td className="font-mono text-xs text-ink-soft">{row.line}</Td>
              <Td className="font-display font-bold">{row.name || "—"}</Td>
              <Td className="text-ink-soft">{row.email || "—"}</Td>
              <Td>{row.section || "—"}</Td>
              <Td>
                {row.problem ? (
                  <span className="text-xs font-medium text-danger">
                    {row.problem}
                  </span>
                ) : (
                  <Pill tone="lime">Ready</Pill>
                )}
              </Td>
            </Tr>
          ))}
        </TableFrame>

        <div className="flex flex-wrap gap-3">
          <Button size="lg" onClick={confirm} disabled={busy || good === 0}>
            {busy
              ? "Importing…"
              : `Import ${good} student${good === 1 ? "" : "s"}`}
          </Button>
          <Button variant="ghost" size="lg" onClick={reset} disabled={busy}>
            Pick a different file
          </Button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------- drop
  return (
    <div className="space-y-4">
      {error ? <FormError>{error}</FormError> : null}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        className={cn(
          "rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
          dragging
            ? "border-cobalt bg-cobalt-wash"
            : "border-ink/45 bg-paper-pure hover:border-ink hover:bg-lime-wash/40"
        )}
      >
        <UploadCloudIcon
          aria-hidden="true"
          className={cn(
            "mx-auto size-10 transition-colors",
            dragging ? "text-cobalt" : "text-ink/45"
          )}
        />

        <p className="mt-4 font-display text-xl font-bold tracking-tight text-ink">
          {dragging ? "Drop it" : "Drop a CSV here"}
        </p>
        <p className="mx-auto mt-1.5 max-w-[42ch] text-sm text-ink-soft">
          Three columns: <code className="font-mono text-xs">name</code>,{" "}
          <code className="font-mono text-xs">email</code>,{" "}
          <code className="font-mono text-xs">section</code>. The section has to
          match one you&apos;ve already created.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          id="csv-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={() => inputRef.current?.click()}>Choose a file</Button>
          <Button
            variant="outline"
            render={
              <a
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(STUDENT_CSV_TEMPLATE)}`}
                download="students-template.csv"
              >
                Download template
              </a>
            }
          />
        </div>
      </div>

      {sectionNames.length > 0 ? (
        <p className="text-xs leading-relaxed text-ink-soft">
          <span className="font-bold">Sections you can use:</span>{" "}
          {sectionNames.join(", ")}
        </p>
      ) : (
        <p className="text-xs text-danger">
          You have no sections yet — add at least one before importing, or every
          row will be skipped.
        </p>
      )}
    </div>
  );
}
