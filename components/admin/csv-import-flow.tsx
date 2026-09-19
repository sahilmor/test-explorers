"use client";

import { useRef, useState, type ReactNode } from "react";
import { FileTextIcon, UploadCloudIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { Pill, TableFrame, Td, Th, Tr } from "@/components/ui/data-table";
import { CsvError, parseCsv, toObjects } from "@/lib/csv";
import { cn } from "cn";

/*
 * The bulk-import flow, shared by the student import (Phase 2) and the
 * question import (Phase 3): drop a file, look at every parsed row and what
 * will happen to it, then confirm.
 *
 * The preview is parsed in the browser with the same `lib/csv` module the
 * server uses, so line numbers and values line up between what was confirmed
 * and what comes back in the summary. The server still parses the raw file
 * itself — the browser's parse is for showing, not for deciding.
 *
 * Callers supply the columns, the per-row check and how to render a row. That
 * keeps both imports visually and behaviourally identical without either one
 * pretending to be the other.
 */

export type ImportRowResult = {
  line: number;
  status: "created" | "skipped";
  reason?: string;
  // Endpoints echo back whatever identifies the row in their own terms
  // (name/email for students, subject/text for questions); `describeResult`
  // turns that into something to show.
  [key: string]: unknown;
};

export type ImportSummary = {
  created: number;
  skipped: number;
  results: ImportRowResult[];
};

export type PreviewRow = {
  line: number;
  record: Record<string, string>;
  problem?: string;
};

type Stage =
  | { kind: "drop" }
  | { kind: "preview"; fileName: string; csv: string; rows: PreviewRow[] }
  | { kind: "done"; summary: ImportSummary };

export type CsvImportFlowProps = {
  /** Required header columns, in the order they should appear in the template. */
  columns: readonly string[];
  /** Endpoint that takes `{ csv }` and returns an ImportSummary. */
  endpoint: string;
  /** Contents of the downloadable example file. */
  template: string;
  templateFileName: string;
  /** Word for what is being imported, e.g. "student" / "question". */
  noun: string;
  /** Checks one parsed row without hitting the database. */
  checkRow: (
    record: Record<string, string>,
    seen: Map<string, number>,
    line: number
  ) => string | undefined;
  /** Columns shown in the preview table. */
  previewColumns: readonly { key: string; label: string; className?: string }[];
  /** Turns a skipped result row into something a human can identify. */
  describeResult: (row: ImportRowResult) => {
    label: string;
    sublabel?: string;
  };
  /** Extra guidance under the drop zone. */
  footnote?: ReactNode;
  onImported: () => void | Promise<void>;
};

export function CsvImportFlow({
  columns,
  endpoint,
  template,
  templateFileName,
  noun,
  checkRow,
  previewColumns,
  describeResult,
  footnote,
  onImported,
}: CsvImportFlowProps) {
  const [stage, setStage] = useState<Stage>({ kind: "drop" });
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
      const records = toObjects(parseCsv(csv), columns);

      const seen = new Map<string, number>();
      const rows: PreviewRow[] = records.map(({ line, record }) => ({
        line,
        record,
        problem: checkRow(record, seen, line),
      }));

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
      const res = await fetch(endpoint, {
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
            {created} {noun}
            {created === 1 ? "" : "s"} added
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
                <Th>Row</Th>
                <Th>Why it was skipped</Th>
              </tr>
            }
          >
            {problems.map((row) => {
              const { label, sublabel } = describeResult(row);
              return (
                // Every row in this table was skipped, so the default
                // green hover would read as "this one is fine".
                <Tr
                  key={`${row.line}-${label}`}
                  className="hover:bg-danger-wash/40"
                >
                  <Td className="font-mono text-xs text-ink-soft">{row.line}</Td>
                  <Td>
                    <span className="font-display font-bold">{label || "—"}</span>
                    {sublabel ? (
                      <span className="block text-xs text-ink-soft">
                        {sublabel}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="text-danger">{row.reason}</Td>
                </Tr>
              );
            })}
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
              {previewColumns.map((c) => (
                <Th key={c.key}>{c.label}</Th>
              ))}
              <Th>Status</Th>
            </tr>
          }
        >
          {stage.rows.map((row) => (
            <Tr
              key={row.line}
              // The hover tint has to be overridden too, or hovering a bad row
              // turns it green and reads as "this one is fine".
              className={
                row.problem
                  ? "bg-danger-wash/50 hover:bg-danger-wash/70"
                  : undefined
              }
            >
              <Td className="font-mono text-xs text-ink-soft">{row.line}</Td>
              {previewColumns.map((c) => (
                <Td key={c.key} className={c.className}>
                  {row.record[c.key] || "—"}
                </Td>
              ))}
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
              : `Import ${good} ${noun}${good === 1 ? "" : "s"}`}
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
        <p className="mx-auto mt-1.5 max-w-[52ch] text-sm text-ink-soft">
          Columns:{" "}
          {columns.map((c, i) => (
            <span key={c}>
              <code className="font-mono text-xs">{c}</code>
              {i < columns.length - 1 ? ", " : ""}
            </span>
          ))}
          .
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          id={`csv-file-${noun}`}
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
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`}
                download={templateFileName}
              >
                Download template
              </a>
            }
          />
        </div>
      </div>

      {footnote}
    </div>
  );
}
