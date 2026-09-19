"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";

const FALLBACK_ERRORS: Record<string, string> = {
  invalid: "Fill in both fields and try again.",
  bad: "That email and password don't match.",
  server: "Something broke on our end. Try again in a moment.",
};

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const busy = submitting || pending;

  // Present when the no-JavaScript form POST bounced us back here.
  const fallbackError = FALLBACK_ERRORS[params.get("error") ?? ""];

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});
    setFormError(null);

    const data = Object.fromEntries(new FormData(event.currentTarget));

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const payload = await res.json();

      if (!res.ok) {
        setErrors(payload.fields ?? {});
        setFormError(
          payload.fields ? null : (payload.error ?? "That didn't work.")
        );
        setSubmitting(false);
        return;
      }

      // Where you land depends on your role, and the server decides that.
      startTransition(() => {
        router.replace(payload.redirectTo ?? "/");
        router.refresh();
      });
    } catch {
      setFormError("Couldn't reach the server. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <p className="eyebrow text-cobalt">Welcome back</p>
      <h2 className="mt-3 text-display-lg text-ink">Sign in</h2>
      <p className="mt-3 text-ink-soft">
        Admins, teachers and students all start here. We&apos;ll send you to the
        right place.
      </p>

      {/* See the note in signup-form.tsx: method + action keep the
          no-JavaScript fallback a POST rather than a GET with the password
          in the query string. */}
      <form
        onSubmit={onSubmit}
        method="post"
        action="/api/auth/login"
        noValidate
        className="mt-8 flex flex-col gap-5"
      >
        {formError || fallbackError ? (
          <FormError>{formError ?? fallbackError}</FormError>
        ) : null}

        <Field
          label="Email"
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
          autoComplete="current-password"
          placeholder="Your password"
          required
          error={errors.password}
        />

        <Button
          type="submit"
          variant="ink"
          size="lg"
          disabled={busy}
          className="mt-2 w-full"
        >
          {busy ? "Checking…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
