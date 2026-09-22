"use client";

import { SearchIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";

/** Title row for an admin screen, with its primary action on the right. */
export function AdminHeader({
  eyebrow,
  title,
  blurb,
  action,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="max-w-2xl">
        <p className="eyebrow text-coral">{eyebrow}</p>
        <h1 className="mt-2 text-display-lg text-ink">{title}</h1>
        <p className="mt-2 text-sm text-ink-soft sm:text-base">{blurb}</p>
      </div>
      {action ? <div className="flex gap-3">{action}</div> : null}
    </div>
  );
}

/**
 * Search box. Filters as you type against an already-loaded list, so there is
 * no request per keystroke and no spinner between characters.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <label className="sr-only" htmlFor="admin-search">
        {label}
      </label>
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
      />
      <input
        id="admin-search"
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-11 w-full rounded-lg border-2 border-ink bg-paper-pure pl-10 pr-10",
          "font-sans text-sm text-ink placeholder:text-ink-faint",
          "shadow-[3px_3px_0_var(--ink)] outline-none",
          "transition-[transform,box-shadow,border-color] duration-150 ease-[var(--ease-snap)]",
          "focus:-translate-x-[2px] focus:-translate-y-[2px] focus:border-cobalt focus:shadow-[5px_5px_0_var(--cobalt)]",
          "motion-reduce:transform-none",
          "[&::-webkit-search-cancel-button]:hidden"
        )}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-ink-soft transition-colors hover:bg-lime-wash hover:text-ink"
        >
          <XIcon className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

/** Native select, styled to match the tactile inputs. */
export function SelectInput({
  label,
  value,
  onChange,
  children,
  className,
  srOnlyLabel,
  id,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
  srOnlyLabel?: boolean;
  id?: string;
}) {
  const inputId = id ?? "admin-select";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label
        htmlFor={inputId}
        className={cn(
          "font-display text-[0.8rem] font-bold uppercase tracking-[0.12em] text-ink",
          srOnlyLabel && "sr-only"
        )}
      >
        {label}
      </label>
      <select
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-11 w-full appearance-none rounded-lg border-2 border-ink bg-paper-pure px-4 pr-10",
          "font-sans text-sm text-ink",
          "shadow-[3px_3px_0_var(--ink)] outline-none",
          "transition-[transform,box-shadow,border-color] duration-150 ease-[var(--ease-snap)]",
          "focus:-translate-x-[2px] focus:-translate-y-[2px] focus:border-cobalt focus:shadow-[5px_5px_0_var(--cobalt)]",
          "motion-reduce:transform-none",
          "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2312100e%22 stroke-width=%223%22><path d=%22M6 9l6 6 6-6%22/></svg>')] bg-[length:14px] bg-[right_0.9rem_center] bg-no-repeat"
        )}
      >
        {children}
      </select>
    </div>
  );
}

/** Green success banner shown after a create/update/delete. */
export function SuccessNote({
  children,
  onDismiss,
}: {
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg border-2 border-ink bg-lime-wash px-4 py-3 shadow-[3px_3px_0_var(--ink)]"
    >
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 border-ink bg-lime font-display text-[0.65rem] font-bold text-ink"
      >
        ✓
      </span>
      <div className="min-w-0 flex-1 text-sm text-ink">{children}</div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="grid size-6 shrink-0 place-items-center rounded-md text-ink-soft hover:bg-lime hover:text-ink"
        >
          <XIcon className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Small ghost action used inside table rows.
 *
 * Roomier on a phone than on a desktop, deliberately. At the compact desktop
 * size these came out 28px tall, which is fine for a mouse and a poor target
 * for a thumb — and "Delete" sitting two millimetres from "Edit" is the worst
 * place to make someone aim.
 */
export function RowAction({
  children,
  onClick,
  tone = "default",
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center rounded-md border-2 border-transparent px-2.5 font-display text-xs font-bold tracking-tight transition-colors sm:min-h-0 sm:py-1",
        "focus-visible:border-ink focus-visible:outline-none",
        tone === "danger"
          ? "text-danger hover:border-danger hover:bg-danger-wash"
          : "text-ink-soft hover:border-ink hover:bg-lime-wash hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}
