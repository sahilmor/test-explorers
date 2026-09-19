"use client";

import * as React from "react";
import { cn } from "cn";

/*
 * Form field with a focus state you can feel: the input lifts up-left onto its
 * shadow and the label's underline snaps from paper-deep to lime. Errors turn
 * the border and shadow red rather than just adding red text underneath.
 */

type FieldProps = React.ComponentPropsWithoutRef<"input"> & {
  label: string;
  hint?: string;
  error?: string;
};

export const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  function Field({ label, hint, error, className, id, ...props }, ref) {
    const generated = React.useId();
    const inputId = id ?? generated;
    const describedBy = error
      ? `${inputId}-error`
      : hint
        ? `${inputId}-hint`
        : undefined;

    return (
      <div className="group/field flex flex-col gap-2">
        <label
          htmlFor={inputId}
          className="font-display text-[0.8rem] font-bold uppercase tracking-[0.12em] text-ink"
        >
          {label}
        </label>

        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "h-12 w-full rounded-lg border-2 bg-paper-pure px-4",
            "font-sans text-base text-ink placeholder:text-ink-faint",
            "transition-[transform,box-shadow,border-color] duration-150 ease-[var(--ease-snap)]",
            "outline-none",
            error
              ? "border-danger shadow-[3px_3px_0_var(--danger)]"
              : "border-ink shadow-[3px_3px_0_var(--ink)]",
            "focus:-translate-x-[2px] focus:-translate-y-[2px]",
            error
              ? "focus:shadow-[5px_5px_0_var(--danger)]"
              : "focus:shadow-[5px_5px_0_var(--cobalt)] focus:border-cobalt",
            "motion-reduce:transform-none",
            className
          )}
          {...props}
        />

        {error ? (
          <p
            id={`${inputId}-error`}
            className="flex items-start gap-1.5 text-sm font-medium text-danger"
          >
            <span aria-hidden="true">↳</span>
            {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="text-sm text-ink-soft">
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);

/** Form-level error banner — for things that aren't tied to one field. */
export function FormError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border-2 border-danger bg-danger-wash px-4 py-3 shadow-[3px_3px_0_var(--danger)]"
    >
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-danger font-display text-xs font-bold text-white"
      >
        !
      </span>
      <p className="text-sm font-medium text-ink">{children}</p>
    </div>
  );
}
