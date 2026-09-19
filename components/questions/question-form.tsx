"use client";

import { useRef, useState } from "react";
import { ImageIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, ImplicitSubmit } from "@/components/ui/field";
import { SelectInput } from "@/components/admin/admin-page";
import { OptionLetter } from "@/components/questions/question-bits";
import { DIFFICULTIES, OPTION_COUNT, type Difficulty } from "@/lib/questions-shared";
import { cn } from "cn";

export type SubjectOption = { id: string; name: string };

export type QuestionDraft = {
  id?: string;
  subjectId: string;
  text: string;
  options: string[];
  correctOptionIndex: number;
  difficulty: Difficulty;
  imageUrl: string | null;
};

export const EMPTY_DRAFT: QuestionDraft = {
  subjectId: "",
  text: "",
  options: ["", "", "", ""],
  correctOptionIndex: 0,
  difficulty: "medium",
  imageUrl: null,
};

/**
 * The form a teacher spends most of their time in.
 *
 * Marking the correct answer is the thing that must not be got wrong, so the
 * whole option row is the radio's label: clicking anywhere on it selects that
 * option, and the selected one turns lime with a hard shadow and a filled
 * letter badge. A 12px radio dot is not enough signal for the one field where
 * a mistake silently produces a wrong answer key.
 */
export function QuestionForm({
  draft,
  setDraft,
  subjects,
  fieldErrors,
  formError,
  formId,
  onSubmit,
}: {
  draft: QuestionDraft;
  setDraft: (update: (d: QuestionDraft) => QuestionDraft) => void;
  subjects: SubjectOption[];
  fieldErrors: Record<string, string>;
  formError: string | null;
  formId: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    setUploadError(null);

    const body = new FormData();
    body.append("file", file);

    try {
      const res = await fetch("/api/uploads/question-image", { method: "POST", body });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setUploadError(payload.error ?? "That image couldn't be uploaded.");
      } else {
        setDraft((d) => ({ ...d, imageUrl: payload.url }));
      }
    } catch {
      setUploadError("Couldn't reach the server. Try again.");
    }

    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <ImplicitSubmit />
      {formError ? <FormError>{formError}</FormError> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <SelectInput
            id={`${formId}-subject`}
            label="Subject"
            value={draft.subjectId}
            onChange={(value) => setDraft((d) => ({ ...d, subjectId: value }))}
          >
            <option value="">Choose a subject…</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectInput>
          {fieldErrors.subjectId ? (
            <p className="mt-2 text-sm font-medium text-danger">
              ↳ {fieldErrors.subjectId}
            </p>
          ) : null}
        </div>

        <div>
          <SelectInput
            id={`${formId}-difficulty`}
            label="Difficulty"
            value={draft.difficulty}
            onChange={(value) =>
              setDraft((d) => ({ ...d, difficulty: value as Difficulty }))
            }
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d[0].toUpperCase() + d.slice(1)}
              </option>
            ))}
          </SelectInput>
          {fieldErrors.difficulty ? (
            <p className="mt-2 text-sm font-medium text-danger">
              ↳ {fieldErrors.difficulty}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor={`${formId}-text`}
          className="font-display text-[0.8rem] font-bold uppercase tracking-[0.12em] text-ink"
        >
          Question
        </label>
        <textarea
          id={`${formId}-text`}
          rows={3}
          required
          placeholder="What is the SI unit of force?"
          value={draft.text}
          onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
          aria-invalid={fieldErrors.text ? true : undefined}
          className={cn(
            "w-full resize-y rounded-lg border-2 bg-paper-pure px-4 py-3",
            "font-sans text-base text-ink placeholder:text-ink-faint",
            "shadow-[3px_3px_0_var(--ink)] outline-none",
            "transition-[transform,box-shadow,border-color] duration-150 ease-[var(--ease-snap)]",
            fieldErrors.text
              ? "border-danger shadow-[3px_3px_0_var(--danger)] focus:shadow-[5px_5px_0_var(--danger)]"
              : "border-ink focus:border-cobalt focus:shadow-[5px_5px_0_var(--cobalt)]",
            "focus:-translate-x-[2px] focus:-translate-y-[2px]",
            "motion-reduce:transform-none"
          )}
        />
        {fieldErrors.text ? (
          <p className="text-sm font-medium text-danger">↳ {fieldErrors.text}</p>
        ) : null}
      </div>

      {/* ---- the options, with the correct one marked ---- */}
      <fieldset>
        <legend className="font-display text-[0.8rem] font-bold uppercase tracking-[0.12em] text-ink">
          Options — click the one that&apos;s correct
        </legend>

        <div className="mt-3 flex flex-col gap-2.5">
          {Array.from({ length: OPTION_COUNT }).map((_, index) => {
            const isCorrect = draft.correctOptionIndex === index;

            return (
              <label
                key={index}
                className={cn(
                  "group flex cursor-pointer items-center gap-3 rounded-lg border-2 p-2.5",
                  "transition-all duration-150 ease-[var(--ease-snap)]",
                  "motion-reduce:transform-none",
                  isCorrect
                    ? "-translate-x-[2px] -translate-y-[2px] border-ink bg-lime-wash shadow-[4px_4px_0_var(--ink)]"
                    : "border-ink/25 bg-transparent hover:border-ink/60 hover:bg-paper-deep/50",
                  "has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-cobalt/40"
                )}
              >
                <input
                  type="radio"
                  name={`${formId}-correct`}
                  value={index}
                  checked={isCorrect}
                  onChange={() =>
                    setDraft((d) => ({ ...d, correctOptionIndex: index }))
                  }
                  className="sr-only"
                />

                <OptionLetter index={index} correct={isCorrect} />

                <input
                  type="text"
                  required
                  placeholder={`Option ${String.fromCharCode(65 + index)}`}
                  value={draft.options[index] ?? ""}
                  onChange={(e) =>
                    setDraft((d) => {
                      const options = [...d.options];
                      options[index] = e.target.value;
                      return { ...d, options };
                    })
                  }
                  aria-label={`Option ${String.fromCharCode(65 + index)}`}
                  className={cn(
                    "h-10 min-w-0 flex-1 rounded-md border-2 border-ink/40 bg-paper-pure px-3",
                    "font-sans text-sm text-ink placeholder:text-ink-faint",
                    "outline-none transition-colors focus:border-cobalt"
                  )}
                />

                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 font-display text-[0.65rem] font-bold uppercase tracking-[0.1em] transition-colors",
                    isCorrect
                      ? "bg-ink text-lime"
                      : "text-ink-faint group-hover:text-ink-soft"
                  )}
                >
                  {isCorrect ? "Correct" : "Mark correct"}
                </span>
              </label>
            );
          })}
        </div>

        {fieldErrors.options || fieldErrors.correctOptionIndex ? (
          <p className="mt-2 text-sm font-medium text-danger">
            ↳ {fieldErrors.options ?? fieldErrors.correctOptionIndex}
          </p>
        ) : null}
        {Object.keys(fieldErrors)
          .filter((k) => k.startsWith("options."))
          .map((k) => (
            <p key={k} className="mt-1 text-sm font-medium text-danger">
              ↳ Option {String.fromCharCode(65 + Number(k.split(".")[1]))}:{" "}
              {fieldErrors[k]}
            </p>
          ))}
      </fieldset>

      {/* ---- optional image ---- */}
      <div>
        <p className="font-display text-[0.8rem] font-bold uppercase tracking-[0.12em] text-ink">
          Diagram (optional)
        </p>

        {uploadError ? (
          <p className="mt-2 text-sm font-medium text-danger">↳ {uploadError}</p>
        ) : null}

        {draft.imageUrl ? (
          <div className="mt-2.5 flex items-center gap-3 rounded-lg border-2 border-ink bg-paper-deep p-2.5">
            {/* Blob URLs are arbitrary, so a plain img avoids configuring a
                remote-pattern allowlist for next/image. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={draft.imageUrl}
              alt="Diagram attached to this question"
              className="size-16 shrink-0 rounded border-2 border-ink object-cover"
            />
            <span className="min-w-0 flex-1 truncate text-xs text-ink-soft">
              {draft.imageUrl}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Remove diagram"
              onClick={() => setDraft((d) => ({ ...d, imageUrl: null }))}
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>
        ) : (
          <div className="mt-2.5">
            <input
              ref={fileRef}
              id={`${formId}-image`}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <ImageIcon className="size-4" />
              {uploading ? "Uploading…" : "Attach an image"}
            </Button>
            <p className="mt-2 text-xs text-ink-soft">
              PNG, JPEG, WebP, GIF or SVG, up to 4 MB.
            </p>
          </div>
        )}
      </div>
    </form>
  );
}
