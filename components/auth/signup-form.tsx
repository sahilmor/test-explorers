"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";

type Errors = Record<string, string>;

const FALLBACK_ERRORS: Record<string, string> = {
  invalid: "Some of those details weren't right. Have another go.",
  taken: "That email already has an account. Try signing in instead.",
  server: "Something broke on our end. Try again in a moment.",
};

export function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const busy = submitting || pending;

  // Set when the browser fell back to a plain form POST (no JavaScript), in
  // which case the server redirects back here with a short code.
  const fallbackError = FALLBACK_ERRORS[params.get("error") ?? ""];

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});
    setFormError(null);

    const data = Object.fromEntries(new FormData(event.currentTarget));

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const payload = await res.json();

      if (!res.ok) {
        setErrors(payload.fields ?? {});
        setFormError(payload.fields ? null : (payload.error ?? "Signup failed."));
        setSubmitting(false);
        return;
      }

      // The session cookie is already set by the response.
      startTransition(() => {
        router.replace("/admin");
        router.refresh();
      });
    } catch {
      setFormError("Couldn't reach the server. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <p className="eyebrow text-coral">Step 1 of 1</p>
      <h2 className="mt-3 text-display-lg text-ink">Start your school</h2>
      <p className="mt-3 text-ink-soft">
        Free for 30 days. No card, no sales call, no 40-page PDF.
      </p>

      {/* method/action matter: without them a browser that has not hydrated
          submits this form as a GET and puts the password in the URL. With
          them, the no-JavaScript path is a real POST that works. */}
      <form
        onSubmit={onSubmit}
        method="post"
        action="/api/auth/signup"
        noValidate
        className="mt-8 flex flex-col gap-5"
      >
        {formError || fallbackError ? (
          <FormError>{formError ?? fallbackError}</FormError>
        ) : null}

        <Field
          label="School name"
          name="schoolName"
          autoComplete="organization"
          placeholder="Riverbend High"
          required
          error={errors.schoolName}
        />
        <Field
          label="Your name"
          name="name"
          autoComplete="name"
          placeholder="Priya Raman"
          required
          error={errors.name}
        />
        <Field
          label="Work email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@riverbend.edu"
          required
          error={errors.email}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          required
          error={errors.password}
          hint="Eight characters minimum. Longer is better than clever."
        />

        <Button type="submit" size="lg" disabled={busy} className="mt-2 w-full">
          {busy ? "Setting things up…" : "Create school account"}
        </Button>

        <p className="text-xs leading-relaxed text-ink-soft">
          You&apos;ll be the admin. You can add teachers and students once
          you&apos;re in.
        </p>
      </form>
    </div>
  );
}
