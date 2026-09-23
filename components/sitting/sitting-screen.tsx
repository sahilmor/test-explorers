"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, FlagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { FormError } from "@/components/ui/field";
import {
  Countdown,
  PALETTE_LEGEND,
  PaletteButton,
  PaletteSwatch,
  SaveIndicator,
} from "@/components/sitting/sitting-bits";
import { useAutosave } from "@/components/sitting/use-autosave";
import { questionState, RESYNC_INTERVAL_MS } from "@/lib/attempts-shared";
import type { SittingState } from "@/lib/attempts";
import { useLockdown } from "@/components/sitting/use-lockdown";
import { LockdownBar, LockdownGate, ViolationWarning } from "@/components/sitting/lockdown-ui";
import type { ViolationKind } from "@/lib/attempts-shared";
import { cn } from "cn";

type Answer = {
  selectedOptionIndex: number | null;
  markedForReview: boolean;
};

export function SittingScreen({ initial }: { initial: SittingState }) {
  const { test } = initial;
  const questions = test.questions;

  const [answers, setAnswers] = useState<Map<string, Answer>>(() => {
    // Restore exactly what the server has. A refresh, a crash or a reopened
    // laptop all land here with the same state the student left behind.
    const restored = new Map<string, Answer>();
    for (const r of initial.attempt.responses) {
      restored.set(r.questionId, {
        selectedOptionIndex: r.selectedOptionIndex,
        markedForReview: r.markedForReview,
      });
    }
    return restored;
  });

  // Which questions have been opened. Anything the server already has a
  // response row for was opened in an earlier sitting, and so is the first
  // question, which is on screen from the moment the page renders.
  const [visited, setVisited] = useState<Set<string>>(() => {
    const seen = new Set(initial.attempt.responses.map((r) => r.questionId));
    if (questions[0]) seen.add(questions[0].id);
    return seen;
  });

  const [index, setIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [finished, setFinished] = useState(
    initial.attempt.status !== "in_progress"
  );
  /** True when the paper was taken away rather than handed in. */
  const [integrityStopped, setIntegrityStopped] = useState(false);
  /**
   * The gate has been passed. Resuming an attempt that is already under way
   * still shows it — coming back after a crash should re-enter fullscreen,
   * and the browser will only do that from a fresh click.
   */
  const [started, setStarted] = useState(false);

  /**
   * Navigate. Marking the question visited happens here rather than in an
   * effect, because it is a consequence of the student moving — not of the
   * component rendering.
   */
  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(questions.length - 1, next));
      setIndex(clamped);

      const id = questions[clamped]?.id;
      if (!id) return;
      setVisited((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    },
    [questions]
  );

  // --- the clock ---------------------------------------------------------
  //
  // `offset` is the gap between this browser's clock and the server's. Every
  // re-sync and every successful save updates it, so a laptop that was asleep
  // or a clock that has drifted cannot buy extra time.
  const [deadline, setDeadline] = useState(() => new Date(initial.deadlineAt));
  const [offset, setOffset] = useState(
    () => new Date(initial.serverNow).getTime() - Date.now()
  );
  const [now, setNow] = useState(() => Date.now() + offset);

  const applyServerTime = useCallback((serverNow: string, deadlineAt: string) => {
    setOffset(new Date(serverNow).getTime() - Date.now());
    setDeadline(new Date(deadlineAt));
  }, []);

  const expire = useCallback(() => setFinished(true), []);

  const autosave = useAutosave({
    testId: test.id,
    onExpired: expire,
    onServerTime: applyServerTime,
  });

  useEffect(() => {
    if (initial.attempt.lastSavedAt) {
      autosave.setInitialSavedAt(new Date(initial.attempt.lastSavedAt));
    }
    // Only on mount: this seeds the indicator with the last real save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Local tick for a smooth countdown…
  useEffect(() => {
    if (finished) return;
    const id = setInterval(() => setNow(Date.now() + offset), 250);
    return () => clearInterval(id);
  }, [offset, finished]);

  // …and a periodic re-ask, because a local interval is a guess and the
  // server's answer is the truth.
  const submitRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (finished) return;

    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/attempts/${test.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const state: SittingState = await res.json();

        applyServerTime(state.serverNow, state.deadlineAt);

        // The server may have already closed this attempt out — a sweep, or
        // another tab submitting it.
        if (state.attempt.status !== "in_progress") {
          autosave.stop();
          setFinished(true);
        }
      } catch {
        // Offline. The countdown keeps running on the last known offset and
        // the save indicator is already telling the truth about connectivity.
      }
    }, RESYNC_INTERVAL_MS);

    return () => clearInterval(id);
  }, [test.id, finished, applyServerTime, autosave]);

  const msLeft = Math.max(0, deadline.getTime() - now);

  // Time up on the client: flush whatever is pending, then ask the server to
  // submit. The server would force-submit anyway — this just makes it
  // immediate rather than waiting for the next sweep.
  useEffect(() => {
    if (finished || msLeft > 0) return;
    void submitRef.current();
  }, [msLeft, finished]);

  // --- answering ---------------------------------------------------------

  function change(questionId: string, patch: Partial<Answer>) {
    setAnswers((prev) => {
      const existing = prev.get(questionId) ?? {
        selectedOptionIndex: null,
        markedForReview: false,
      };
      const updated = { ...existing, ...patch };

      const next = new Map(prev);
      next.set(questionId, updated);

      // Every change is queued for the database immediately. There is no
      // local-only state that a refresh could lose.
      autosave.queue({
        questionId,
        selectedOptionIndex: updated.selectedOptionIndex,
        markedForReview: updated.markedForReview,
      });

      return next;
    });
  }

  const counts = useMemo(() => {
    let answered = 0;
    let marked = 0;
    for (const q of questions) {
      const a = answers.get(q.id);
      if (a?.selectedOptionIndex !== null && a?.selectedOptionIndex !== undefined)
        answered++;
      if (a?.markedForReview) marked++;
    }
    return { answered, marked, unanswered: questions.length - answered };
  }, [answers, questions]);

  // --- exam integrity ----------------------------------------------------

  /**
   * Reports a violation and returns what the server made of it.
   *
   * The count is the server's, not ours — a refresh must not hand warnings
   * back. Network trouble is swallowed: an exam should not fall over because
   * a warning could not be filed, and the deadline and autosave both still
   * work without it.
   */
  const reportViolation = useCallback(
    async (kind: ViolationKind) => {
      try {
        const res = await fetch(`/api/attempts/${test.id}/violation`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind }),
          keepalive: true,
        });
        if (!res.ok) return null;
        return (await res.json()) as {
          count: number;
          limit: number;
          ignored: boolean;
          autoSubmitted: boolean;
        };
      } catch {
        return null;
      }
    },
    [test.id]
  );

  const onIntegritySubmit = useCallback(() => {
    // The server has already submitted and graded it. Stop autosaving and
    // show the finished screen rather than racing it with another submit.
    autosave.stop();
    setIntegrityStopped(true);
    setFinished(true);
  }, [autosave]);

  const lockdown = useLockdown({
    active: !finished,
    initialViolations: initial.attempt.violationCount,
    onReport: reportViolation,
    onAutoSubmit: onIntegritySubmit,
  });

  // --- submitting --------------------------------------------------------

  const doSubmit = useCallback(async () => {
    setSubmitting(true);
    setSubmitError(null);

    // Never submit on top of unsaved work: flush first and wait for it.
    const flushed = await autosave.flushNow();

    try {
      const res = await fetch(`/api/attempts/${test.id}/submit`, { method: "POST" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setSubmitError(payload.error ?? "Couldn't submit. Try again.");
        setSubmitting(false);
        return;
      }

      autosave.stop();
      setConfirming(false);
      setFinished(true);
    } catch {
      setSubmitError(
        flushed
          ? "Couldn't reach the server to submit. Your answers are saved — try again."
          : "You're offline. Your last few answers aren't saved yet — reconnect and try again."
      );
      setSubmitting(false);
    }
  }, [test.id, autosave]);

  // Assigned in an effect rather than during render: the time-up effect
  // needs the latest submit function, but writing a ref while rendering is
  // not safe under concurrent rendering.
  useEffect(() => {
    submitRef.current = doSubmit;
  }, [doSubmit]);

  if (finished) {
    return (
      <Submitted
        title={test.title}
        counts={counts}
        total={questions.length}
        testId={test.id}
        integrityStopped={integrityStopped}
        closesAt={new Date(test.closesAt)}
      />
    );
  }

  // Nothing of the paper is rendered until the student has been told the
  // rules and has granted fullscreen. Browsers only grant it inside a user
  // gesture, so this button is the gesture — it cannot be done automatically.
  if (!started) {
    return (
      <LockdownGate
        supported={lockdown.status.supported}
        onEnter={async () => {
          await lockdown.enterFullscreen();
          setStarted(true);
        }}
        onSkip={() => setStarted(true)}
      />
    );
  }

  const question = questions[index];
  const answer = answers.get(question.id);

  return (
    <div className="min-h-dvh bg-paper">
      {/* ---- integrity status, always visible ---- */}
      <LockdownBar
        fullscreen={lockdown.status.fullscreen}
        supported={lockdown.status.supported}
        violations={lockdown.status.violations}
        limit={lockdown.status.limit}
        onRefullscreen={() => void lockdown.enterFullscreen()}
      />

      {lockdown.status.warning ? (
        <ViolationWarning
          count={lockdown.status.warning.count}
          limit={lockdown.status.limit}
          kind={lockdown.status.warning.kind}
          supported={lockdown.status.supported}
          onAcknowledge={() => void lockdown.dismissWarning()}
        />
      ) : null}

      {/* ---- the bar that never moves ---- */}
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-paper-pure">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-3 gap-y-2.5 px-4 py-3 sm:px-6">
          {/* On a phone the title takes its own line. Squeezing it next to the
              clock and the save indicator left it reading "Unit …", which
              tells a student nothing about which paper they are sitting. */}
          <div className="min-w-0 w-full sm:w-auto sm:flex-1">
            <p className="eyebrow text-ink-soft">{test.subjectName}</p>
            <h1 className="truncate font-display text-base font-bold text-ink">
              {test.title}
            </h1>
          </div>

          <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
            <SaveIndicator status={autosave.status} lastSavedAt={autosave.lastSavedAt} />
            <Countdown msLeft={msLeft} />
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        {/* ---- the question ---- */}
        <main>
          <div className="rounded-xl border-2 border-ink bg-paper-pure p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <p className="eyebrow text-ink-soft">
                Question {index + 1} of {questions.length}
              </p>

              <button
                type="button"
                onClick={() =>
                  change(question.id, { markedForReview: !answer?.markedForReview })
                }
                aria-pressed={answer?.markedForReview ?? false}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border-2 border-ink px-3 py-1.5",
                  "font-display text-xs font-bold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cobalt/40",
                  answer?.markedForReview
                    ? "bg-[#6B34C9] text-white"
                    : "bg-paper-pure text-ink-soft hover:bg-paper-deep hover:text-ink"
                )}
              >
                <FlagIcon aria-hidden="true" className="size-3.5" />
                {answer?.markedForReview ? "Marked for review" : "Mark for review"}
              </button>
            </div>

            <p className="mt-4 text-lg leading-relaxed text-ink">{question.text}</p>

            {question.imageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={question.imageUrl}
                alt=""
                className="mt-4 max-h-72 rounded-lg border-2 border-ink"
              />
            ) : null}

            <fieldset className="mt-6">
              <legend className="sr-only">Choose one answer</legend>

              <div className="flex flex-col gap-2.5">
                {question.options.map((option, i) => {
                  const chosen = answer?.selectedOptionIndex === i;

                  return (
                    <label
                      key={i}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3.5",
                        "transition-colors",
                        chosen
                          ? "border-ink bg-lime-wash"
                          : "border-ink/25 bg-paper-pure hover:border-ink/60 hover:bg-paper-deep/40",
                        "has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-cobalt/40"
                      )}
                    >
                      <input
                        type="radio"
                        name={`q-${question.id}`}
                        checked={chosen}
                        onChange={() =>
                          change(question.id, { selectedOptionIndex: i })
                        }
                        className="sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-full border-2 border-ink font-display text-sm font-bold",
                          chosen ? "bg-lime text-ink" : "bg-paper-deep text-ink-soft"
                        )}
                      >
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="text-base text-ink">{option}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {answer?.selectedOptionIndex !== null &&
            answer?.selectedOptionIndex !== undefined ? (
              <button
                type="button"
                onClick={() => change(question.id, { selectedOptionIndex: null })}
                className="mt-4 font-display text-xs font-bold text-ink-soft underline decoration-2 underline-offset-4 hover:text-ink"
              >
                Clear my answer
              </button>
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="outline"
              disabled={index === 0}
              onClick={() => goTo(index - 1)}
            >
              <ChevronLeftIcon className="size-4" />
              Previous
            </Button>

            <Button
              variant="outline"
              disabled={index >= questions.length - 1}
              onClick={() => goTo(index + 1)}
            >
              Next
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        </main>

        {/* ---- palette ---- */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border-2 border-ink bg-paper-pure p-4">
            <p className="eyebrow text-ink-soft">Questions</p>

            <div className="mt-3 grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-5">
              {questions.map((q, i) => {
                const a = answers.get(q.id);
                return (
                  <PaletteButton
                    key={q.id}
                    index={i}
                    current={i === index}
                    state={questionState(
                      visited.has(q.id),
                      a?.selectedOptionIndex !== null &&
                        a?.selectedOptionIndex !== undefined,
                      Boolean(a?.markedForReview)
                    )}
                    onClick={() => goTo(i)}
                  />
                );
              })}
            </div>

            <ul className="mt-4 space-y-1.5 border-t-2 border-ink/15 pt-3">
              {PALETTE_LEGEND.map((item) => (
                <li key={item.state} className="flex items-center gap-2 text-xs text-ink-soft">
                  <PaletteSwatch state={item.state} />
                  {item.label}
                </li>
              ))}
            </ul>

            <p className="mt-4 text-sm text-ink">
              <span className="font-display font-bold">{counts.answered}</span> of{" "}
              {questions.length} answered
            </p>

            <Button
              variant="ink"
              className="mt-4 w-full"
              onClick={() => {
                setSubmitError(null);
                setConfirming(true);
              }}
            >
              Submit test
            </Button>
          </div>
        </aside>
      </div>

      {/* ---- confirm ---- */}
      <Modal
        open={confirming}
        onOpenChange={(open) => {
          if (!open && !submitting) setConfirming(false);
        }}
        tone="coral"
        title="Submit your test?"
        description="Once you submit you can't change your answers."
        footer={
          <>
            <Button
              variant="ghost"
              disabled={submitting}
              onClick={() => setConfirming(false)}
            >
              Keep working
            </Button>
            <Button variant="ink" disabled={submitting} onClick={doSubmit}>
              {submitting ? "Submitting…" : "Submit test"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {submitError ? <FormError>{submitError}</FormError> : null}

          <dl className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border-2 border-ink bg-lime-wash px-3 py-3">
              <dt className="eyebrow text-ink-soft">Answered</dt>
              <dd className="mt-1 font-display text-2xl font-extrabold text-ink">
                {counts.answered}
              </dd>
            </div>
            <div
              className={cn(
                "rounded-lg border-2 border-ink px-3 py-3",
                counts.unanswered > 0 ? "bg-coral-wash" : "bg-paper-deep"
              )}
            >
              <dt className="eyebrow text-ink-soft">Unanswered</dt>
              <dd className="mt-1 font-display text-2xl font-extrabold text-ink">
                {counts.unanswered}
              </dd>
            </div>
            <div className="rounded-lg border-2 border-ink bg-paper-deep px-3 py-3">
              <dt className="eyebrow text-ink-soft">Marked</dt>
              <dd className="mt-1 font-display text-2xl font-extrabold text-ink">
                {counts.marked}
              </dd>
            </div>
          </dl>

          {counts.unanswered > 0 ? (
            <p className="text-sm text-ink">
              You still have{" "}
              <span className="font-bold">
                {counts.unanswered} unanswered question
                {counts.unanswered === 1 ? "" : "s"}
              </span>
              . You can go back and finish them, or submit as you are.
            </p>
          ) : (
            <p className="text-sm text-ink-soft">
              Every question has an answer. Good to go.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

/** The confirmation screen. No score — that arrives in the next phase. */
function Submitted({
  title,
  counts,
  total,
  testId,
  closesAt,
  integrityStopped = false,
}: {
  title: string;
  counts: { answered: number; unanswered: number };
  total: number;
  testId: string;
  closesAt: Date;
  integrityStopped?: boolean;
}) {
  // The mark exists already — it is worked out as part of submitting — but it
  // stays out of sight until the paper has closed for everyone.
  const resultsOut = new Date() >= closesAt;

  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-5 py-16">
      <div className="w-full max-w-md rounded-xl border-2 border-ink bg-paper-pure p-8 text-center shadow-[5px_5px_0_var(--ink)]">
        <div
          aria-hidden="true"
          className={`mx-auto grid size-14 place-items-center rounded-full border-2 border-ink ${
            integrityStopped ? "bg-coral" : "bg-lime"
          }`}
        >
          <span className="font-display text-2xl font-extrabold text-ink">
            {integrityStopped ? "!" : "✓"}
          </span>
        </div>

        <h1 className="mt-5 font-display text-2xl font-extrabold tracking-tight text-ink">
          {integrityStopped ? "Submitted automatically" : "Submitted"}
        </h1>

        {/* Said plainly rather than softened. A student whose paper ended this
            way needs to know it did, and that their teacher can see it. */}
        <p className="mt-2 text-sm text-ink-soft">
          {integrityStopped ? (
            <>
              You left the test screen three times, so{" "}
              <span className="font-bold text-ink">{title}</span> was submitted
              with what you had answered. Your teacher will see that it ended
              this way — speak to them if something went wrong.
            </>
          ) : (
            <>
              Your answers for <span className="font-bold text-ink">{title}</span>{" "}
              are in. Nothing else to do.
            </>
          )}
        </p>

        <p className="mt-5 rounded-lg border-2 border-ink bg-paper-deep px-4 py-3 text-sm text-ink">
          <span className="font-display font-bold">{counts.answered}</span> of{" "}
          {total} questions answered
        </p>

        <p className="mt-4 text-xs text-ink-soft">
          {resultsOut
            ? "Your mark is ready."
            : "Your mark appears once this test closes for everyone."}
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {resultsOut ? (
            <Button
              render={<Link href={`/student/tests/${testId}/result`}>See your result</Link>}
            />
          ) : null}
          <Button variant="outline" render={<Link href="/student">Back to my tests</Link>} />
        </div>
      </div>
    </div>
  );
}
