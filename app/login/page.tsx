import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell, AuthSwitch } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { HOME_FOR_ROLE, getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(HOME_FOR_ROLE[session.role]);

  return (
    <AuthShell
      eyebrow="Sign in"
      headline="Back to the"
      highlight="good stuff"
      blurb="Pick up where you left off — papers to set, papers to sit, papers to mark."
      points={[
        "One login for admins, teachers and students.",
        "Sessions last a week, then you sign in again.",
        "Sign out clears the session cookie completely.",
      ]}
      accent="coral"
    >
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
      <AuthSwitch
        prompt="New school?"
        href="/signup"
        label="Create an account"
      />
    </AuthShell>
  );
}
