"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AUTOSAVE_DEBOUNCE_MS } from "@/lib/attempts-shared";
import type { SittingResponse } from "@/lib/attempts";

/**
 * The autosave engine.
 *
 * The contract this exists to keep: **the indicator never says "Saved" unless
 * the server has confirmed the write.** Everything below follows from that.
 *
 *   - Changes go into a pending map, keyed by question id, and are flushed
 *     after a short debounce. Keying by question id means a student changing
 *     their mind three times sends one write, not three.
 *   - A failed flush puts its answers *back* into the pending map and retries
 *     with backoff. Nothing is dropped because a request failed.
 *   - While anything is pending or retrying, the status is "saving" or
 *     "retrying" — never "saved".
 *   - `flushNow` is exposed so navigation and submit can force a write and
 *     wait for it, rather than racing the debounce.
 *   - On `pagehide` — the closed laptop, the killed tab — a `keepalive` fetch
 *     posts whatever is still pending. Browsers allow that request to outlive
 *     the page.
 */

export type SaveStatus = "idle" | "saving" | "saved" | "retrying" | "expired";

const MAX_BACKOFF_MS = 15_000;

export function useAutosave({
  testId,
  onExpired,
  onServerTime,
}: {
  testId: string;
  /** The server refused the write because the deadline had passed. */
  onExpired: () => void;
  /** Every successful save doubles as a clock re-sync. */
  onServerTime: (serverNow: string, deadlineAt: string) => void;
}) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Not state: these must be readable synchronously from timers and from the
  // pagehide handler, and must not cause a re-render on every keystroke.
  const pending = useRef(new Map<string, SittingResponse>());
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoff = useRef(1000);
  const stopped = useRef(false);

  // A retry schedules the next attempt, which means `flush` has to be able to
  // call itself. Going through a ref keeps that legal without reading the
  // binding before it exists.
  const flushRef = useRef<() => Promise<boolean>>(async () => false);

  const flush = useCallback(async (): Promise<boolean> => {
    if (stopped.current) return false;
    if (inFlight.current) return false;
    if (pending.current.size === 0) {
      setStatus((s) => (s === "saving" || s === "retrying" ? "saved" : s));
      return true;
    }

    // Take the batch, but keep it so it can be put back if the write fails.
    const batch = [...pending.current.values()];
    pending.current.clear();
    inFlight.current = true;
    setStatus((s) => (s === "retrying" ? "retrying" : "saving"));

    try {
      const res = await fetch(`/api/attempts/${testId}/responses`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ responses: batch }),
      });

      if (res.status === 409) {
        // Time is up, or the attempt is already submitted. Stop trying — the
        // answers in this batch were never going to be accepted.
        const payload = await res.json().catch(() => ({}));
        if (payload.serverNow && payload.deadlineAt) {
          onServerTime(payload.serverNow, payload.deadlineAt);
        }
        stopped.current = true;
        setStatus("expired");
        onExpired();
        return false;
      }

      if (!res.ok) throw new Error(`save failed: ${res.status}`);

      const payload = await res.json();
      if (payload.serverNow && payload.deadlineAt) {
        onServerTime(payload.serverNow, payload.deadlineAt);
      }

      backoff.current = 1000;
      setLastSavedAt(new Date(payload.lastSavedAt));
      // Anything queued while this request was in flight keeps the status
      // honest — it is not "saved" until that is written too.
      setStatus(pending.current.size > 0 ? "saving" : "saved");
      return true;
    } catch {
      // Put the batch back, without clobbering anything newer the student has
      // changed in the meantime.
      for (const response of batch) {
        if (!pending.current.has(response.questionId)) {
          pending.current.set(response.questionId, response);
        }
      }

      setStatus("retrying");

      const delay = backoff.current;
      backoff.current = Math.min(backoff.current * 2, MAX_BACKOFF_MS);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flushRef.current(), delay);

      return false;
    } finally {
      inFlight.current = false;
    }
  }, [testId, onExpired, onServerTime]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  /** Queue a change. Called on every answer and every review toggle. */
  const queue = useCallback(
    (response: SittingResponse) => {
      if (stopped.current) return;

      pending.current.set(response.questionId, response);
      setStatus("saving");

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_DEBOUNCE_MS);
    },
    [flush]
  );

  /** Write everything pending and wait for it. Used before submit. */
  const flushNow = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);

    // One retry inline, so a single blip at submit time does not need the
    // student to click again.
    if (await flush()) return true;
    await new Promise((r) => setTimeout(r, 600));
    return flush();
  }, [flush]);

  // The laptop lid, the killed tab, the OS deciding to reclaim the page.
  // `keepalive` lets this request outlive the document.
  useEffect(() => {
    function onPageHide() {
      if (pending.current.size === 0 || stopped.current) return;

      const body = JSON.stringify({
        responses: [...pending.current.values()],
      });

      try {
        void fetch(`/api/attempts/${testId}/responses`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body,
          keepalive: true,
        });
      } catch {
        // Nothing useful left to do — the page is going away. The answer is
        // still recoverable from the last successful save, and the server-side
        // sweep will submit whatever it has.
      }
    }

    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [testId]);

  // Coming back online is the moment to retry, rather than waiting out a
  // backoff that may be seconds long.
  useEffect(() => {
    function onOnline() {
      if (pending.current.size > 0 && !stopped.current) void flush();
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flush]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const stop = useCallback(() => {
    stopped.current = true;
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return {
    status,
    lastSavedAt,
    hasPending: () => pending.current.size > 0,
    queue,
    flushNow,
    stop,
    setInitialSavedAt: setLastSavedAt,
  };
}
