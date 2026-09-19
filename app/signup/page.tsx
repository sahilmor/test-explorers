import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell, AuthSwitch } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";
import { HOME_FOR_ROLE, getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Create your school" };

export default async function SignupPage() {
  // Already signed in? Go where you belong instead of signing up twice.
  const session = await getSession();
  if (session) redirect(HOME_FOR_ROLE[session.role]);

  return (
    <AuthShell
      eyebrow="Set up your school"
      headline="Tests without the"
      highlight="photocopier"
      blurb="Write a paper once, send it to every class, and get the marking back before the bell. Your school, your questions, your rules."
      points={[
        "Set up in a minute — one form, no onboarding call.",
        "Each school's data is walled off from every other school's.",
        "Admins, teachers and students each get their own view.",
      ]}
      accent="lime"
    >
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
      <AuthSwitch
        prompt="Already have an account?"
        href="/login"
        label="Sign in instead"
      />
    </AuthShell>
  );
}
