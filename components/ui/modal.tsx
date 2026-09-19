"use client";

import { Dialog } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * House modal — used instead of a full page navigation for add/edit, so an
 * admin onboarding a whole school never loses their place in the list.
 *
 * Styled like the rest of the system: 2px ink border, hard offset shadow, a
 * coloured bar across the top. Base UI handles focus trapping, Escape, scroll
 * locking and returning focus to whatever opened it.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  tone = "lime",
  size = "default",
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  tone?: "lime" | "coral" | "cobalt";
  /** "wide" for anything with a table in it, like the CSV preview. */
  size?: "default" | "wide";
  children: ReactNode;
  footer?: ReactNode;
}) {
  const bar =
    tone === "lime" ? "bg-lime" : tone === "coral" ? "bg-coral" : "bg-cobalt";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop
          className={cn(
            "fixed inset-0 z-40 bg-ink/45",
            "transition-opacity duration-150",
            "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0"
          )}
        />
        <Dialog.Popup
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2",
            size === "wide" ? "max-w-4xl" : "max-w-lg",
            "max-h-[calc(100dvh-2rem)] overflow-y-auto",
            "rounded-xl border-2 border-ink bg-paper-pure shadow-[8px_8px_0_var(--ink)]",
            "outline-none",
            "transition-[opacity,transform] duration-150 ease-[var(--ease-snap)]",
            "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
            "motion-reduce:transition-none"
          )}
        >
          <span aria-hidden="true" className={cn("block h-2.5 w-full", bar)} />

          <div className="flex items-start gap-4 px-6 pt-5">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-display text-xl font-bold tracking-tight text-ink">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm text-ink-soft">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>

            <Dialog.Close
              aria-label="Close"
              className="grid size-8 shrink-0 place-items-center rounded-md border-2 border-transparent text-ink-soft transition-colors hover:border-ink hover:bg-lime-wash hover:text-ink focus-visible:border-ink focus-visible:outline-none"
            >
              <XIcon className="size-4" />
            </Dialog.Close>
          </div>

          <div className="px-6 py-5">{children}</div>

          {footer ? (
            <div className="flex flex-wrap justify-end gap-3 border-t-2 border-ink bg-paper-deep px-6 py-4">
              {footer}
            </div>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const ModalClose = Dialog.Close;
