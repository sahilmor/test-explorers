"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_VIOLATIONS,
  VIOLATION_DEBOUNCE_MS,
  type ViolationKind,
} from "@/lib/attempts-shared";

/**
 * Keeping a student on the test screen.
 *
 * Three detectors, because none of them catches everything on its own:
 *
 *  - `fullscreenchange` notices Escape and the browser's own exit button.
 *  - `visibilitychange` notices a tab switch, a minimise, and a phone being
 *    locked or answering a call.
 *  - `blur` notices another window taking focus while this tab stays visible —
 *    a second monitor, or alt-tabbing to a PDF.
 *
 * They overlap heavily. One press of Escape can fire all three inside a few
 * hundred milliseconds, so this debounces locally *and* the server collapses
 * bursts again — a student should not lose their whole allowance to one
 * action, and the browser is not trusted to be the only thing preventing it.
 *
 * What this is honestly not: proctoring. It cannot see a second device, a
 * phone under the desk or a person in the room. It raises the cost of the
 * casual alt-tab, which is the cheating that actually happens in a school lab,
 * and it does so visibly so nobody is caught out by a rule they could not see.
 */

export type LockdownStatus = {
  fullscreen: boolean;
  supported: boolean;
  violations: number;
  limit: number;
  /** Set when a warning is on screen and needs acknowledging. */
  warning: { count: number; kind: ViolationKind } | null;
};

type Options = {
  /** False once the paper is submitted — detectors stop and nothing is sent. */
  active: boolean;
  initialViolations: number;
  onReport: (kind: ViolationKind) => Promise<{
    count: number;
    limit: number;
    ignored: boolean;
    autoSubmitted: boolean;
  } | null>;
  onAutoSubmit: () => void;
};

export function useLockdown({
  active,
  initialViolations,
  onReport,
  onAutoSubmit,
}: Options) {
  const [fullscreen, setFullscreen] = useState(false);
  /**
   * Whether this browser will grant fullscreen at all.
   *
   * A fact about the environment rather than state to keep in sync, so it is
   * read once on mount via a lazy initialiser. `document` does not exist
   * during the server render, hence the guard.
   */
  const [supported] = useState(
    () => typeof document !== "undefined" && (document.fullscreenEnabled ?? false)
  );
  const [violations, setViolations] = useState(initialViolations);
  const [warning, setWarning] = useState<LockdownStatus["warning"]>(null);

  const lastReportAt = useRef(0);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  /** Asks for fullscreen. Browsers only grant it inside a user gesture. */
  const enterFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
      setWarning(null);
      return true;
    } catch {
      // Denied, or unsupported. The paper still runs — refusing to let a
      // student sit an exam because their browser said no would be worse than
      // the risk it manages.
      return false;
    }
  }, []);

  const report = useCallback(
    async (kind: ViolationKind) => {
      if (!activeRef.current) return;

      const now = Date.now();
      if (now - lastReportAt.current < VIOLATION_DEBOUNCE_MS) return;
      lastReportAt.current = now;

      const result = await onReport(kind);
      if (!result || result.ignored) return;

      setViolations(result.count);

      if (result.autoSubmitted) {
        setWarning(null);
        onAutoSubmit();
        return;
      }

      setWarning({ count: result.count, kind });
    },
    [onAutoSubmit, onReport]
  );

  // --- the three detectors -------------------------------------------------
  useEffect(() => {
    if (!active) return;

    const onFullscreenChange = () => {
      const isFull = Boolean(document.fullscreenElement);
      setFullscreen(isFull);
      if (!isFull) void report("fullscreen_exit");
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") void report("tab_hidden");
    };

    const onBlur = () => {
      // Ignore the blur that comes with the tab being hidden — the visibility
      // handler already has that one, and this would double-count it.
      if (document.visibilityState === "hidden") return;
      void report("window_blur");
    };

    // Sync once on mount by asking the handler to look, rather than setting
    // state straight from the effect body.
    const initial = requestAnimationFrame(() =>
      setFullscreen(Boolean(document.fullscreenElement))
    );

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);

    return () => {
      cancelAnimationFrame(initial);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [active, report]);

  // --- leaving the page ----------------------------------------------------
  useEffect(() => {
    if (!active) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Modern browsers show their own wording; setting returnValue is what
      // still triggers the prompt at all.
      event.returnValue = "";
    };

    // Back-navigation: push a state, then put it back whenever the student
    // pops it. The paper stays on screen, and the Submit button remains the
    // only way out.
    const onPopState = () => {
      window.history.pushState(null, "", window.location.href);
      void report("window_blur");
    };

    window.history.pushState(null, "", window.location.href);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
    };
  }, [active, report]);

  const dismissWarning = useCallback(async () => {
    await enterFullscreen();
    setWarning(null);
  }, [enterFullscreen]);

  return {
    status: { fullscreen, supported, violations, limit: MAX_VIOLATIONS, warning },
    enterFullscreen,
    dismissWarning,
  };
}
