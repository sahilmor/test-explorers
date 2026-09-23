"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";

/**
 * "What's the code?"
 *
 * The last gate before a paper, and the one that keeps a sitting in the room
 * it is meant to happen in. The code does not exist until the invigilator
 * opens the session, so a student who has the link, the time and the right
 * class still cannot start from home.
 *
 * Deliberately not framed as a failure — most people arriving here are simply
 * waiting for their teacher to read it out.
 */
export function AccessCodeGate({
  testId,
  title,
  subjectName,
  reason,
}: {
  testId: string;
  title: string;
  subjectName: string | null;
  reason: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (code.trim().length === 0) return;
    setBusy(true);
    setError(null);

    const res = await fetch("/api/attempts/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ testId, accessCode: code.trim() }),
    });

    if (res.ok) {
      // The server has the attempt now; re-render the page and the paper
      // appears. Deliberately a refresh rather than rendering from this
      // response, so the sitting screen starts from the server's state.
      router.refresh();
      return;
    }

    const payload = await res.json().catch(() => ({}));
    setBusy(false);
    setError(payload.error ?? "That didn't work. Check with your teacher.");
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-5 py-16">
      <div className="w-full max-w-md rounded-xl border-2 border-ink bg-paper-pure p-7 shadow-[5px_5px_0_var(--ink)] sm:p-9">
        <p className="eyebrow text-coral">{subjectName ?? "Your test"}</p>
        <h1 className="mt-3 font-display text-2xl font-extrabold tracking-tight text-ink">
          {title}
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-ink-soft">{reason}</p>

        <form
          className="mt-7"
          noValidate
          onSubmit={(e) => { e.preventDefault(); void submit(); }}
        >
          <label
            htmlFor="access-code"
            className="font-display text-[0.8rem] font-bold uppercase tracking-[0.12em] text-ink"
          >
            Access code
          </label>
          <input
            id="access-code"
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            maxLength={12}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            className="mt-2 h-14 w-full rounded-lg border-2 border-ink bg-paper-pure px-4 text-center font-display text-2xl font-extrabold tracking-[0.3em] text-ink placeholder:tracking-normal placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cobalt/30"
          />

          {error ? <div className="mt-3"><FormError>{error}</FormError></div> : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <Button size="lg" variant="ink" type="submit" disabled={busy || !code.trim()}>
              {busy ? "Checking…" : "Start the test"}
            </Button>
            <Button size="lg" variant="outline" render={<Link href="/student">Back</Link>} />
          </div>
        </form>

        <p className="mt-6 text-xs leading-relaxed text-ink-soft">
          Your teacher reads this out at the start of your slot. It only works
          during your class&apos;s own sitting.
        </p>
      </div>
    </main>
  );
}
