"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Copies a one-time value to the clipboard and says so for a moment.
 *
 * Falls back to selecting nothing and reporting failure rather than pretending
 * it worked — clipboard access is blocked in some browsers and contexts, and
 * silently "copying" a password the admin then can't paste is worse than
 * telling them to select it by hand.
 */
export function CopyButton({ value }: { value: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={state === "copied" ? "Copied" : "Copy to clipboard"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState("copied");
        } catch {
          setState("failed");
        }
        setTimeout(() => setState("idle"), 2500);
      }}
      title={
        state === "failed"
          ? "Couldn't copy — select the text and copy it manually"
          : undefined
      }
    >
      {state === "copied" ? (
        <CheckIcon className="size-4" />
      ) : (
        <CopyIcon className="size-4" />
      )}
    </Button>
  );
}
