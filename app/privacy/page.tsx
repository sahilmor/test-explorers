import type { Metadata } from "next";
import Link from "next/link";
import { Clause, Fill, LegalPage } from "@/components/marketing/legal-page";
import { TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What Shalasys stores about a school and its students, why, where it lives, who can see it, and how to get it back or have it deleted.",
  alternates: { canonical: "/privacy" },
};

const UPDATED = "23 September 2026";

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated={UPDATED}
      summary="A school's data belongs to the school. This page says exactly what is stored, why it has to be, who can reach it, and how to get it back."
    >
      <Clause heading="Who we are">
        <p>
          Shalasys (&ldquo;the service&rdquo;) is operated by <Fill>[legal entity name]</Fill>,
          registered at <Fill>[registered address]</Fill>. For anything about this
          policy, write to <Fill>[privacy contact email]</Fill>.
        </p>
        <p>
          When a school signs up, the school is the <strong>data controller</strong> for
          its students&apos; information and we are its <strong>data processor</strong>. We
          store and process that information to run the service the school asked
          for, and for nothing else.
        </p>
      </Clause>

      <Clause heading="What we store">
        <p>Three kinds of thing, and no more than the service needs:</p>
        <ul>
          <li>
            <strong>Accounts.</strong> A name, an email address, a role (admin,
            teacher or student), a class for students, and a password stored only
            as a bcrypt hash. We never hold a readable password and cannot tell
            you what one is.
          </li>
          <li>
            <strong>School content.</strong> Classes, subjects, questions and the
            papers built from them, including any diagram images uploaded with a
            question.
          </li>
          <li>
            <strong>Assessment records.</strong> Which student sat which paper,
            when they started and submitted, the option they chose for each
            question, and the resulting mark.
          </li>
        </ul>
        <p>
          Billing is handled by Razorpay. We store the payment&apos;s identifier,
          amount and status so a school can see its own receipts. <strong>We never
          see or store card numbers</strong> — those go from the customer to
          Razorpay directly.
        </p>
      </Clause>

      <Clause heading="What we do not do">
        <ul>
          <li>We do not sell or rent personal information to anybody.</li>
          <li>We do not show advertising, to students or to anyone else.</li>
          <li>
            We do not use student answers or results to train machine-learning
            models.
          </li>
          <li>
            We do not build profiles of students for any purpose beyond showing
            them and their school their own results.
          </li>
          <li>
            We do not record a student&apos;s screen, camera, microphone or
            keystrokes. The service does no proctoring of any kind.
          </li>
        </ul>
      </Clause>

      <Clause heading="Who can see what">
        <p>
          Every query the service makes is filtered by the school on the
          signed-in session, never by anything supplied in a link or a form. One
          school cannot read another&apos;s data, and this is the single property
          the codebase is most heavily tested against.
        </p>
        <ul>
          <li>
            <strong>Students</strong> see the papers set for their own class and
            their own results. They never see another student&apos;s answers, and
            they see no answer key until the paper has closed for everyone.
          </li>
          <li>
            <strong>Teachers and admins</strong> see their own school&apos;s
            questions, papers and results.
          </li>
          <li>
            <strong>We</strong> can reach the database for operating the service —
            fixing a fault, restoring a backup, investigating abuse. Our
            operational dashboard shows school names, plan status and counts; it
            does not display student answers.
          </li>
        </ul>
      </Clause>

      <Clause heading="Where it lives, and who else touches it">
        <p>
          Data is stored in MongoDB Atlas and the service runs on Vercel, both in
          the <Fill>[region, e.g. ap-south-1 / Mumbai]</Fill> region. These
          sub-processors have access strictly to run the service:
        </p>
        <ul>
          <li><strong>MongoDB Atlas</strong> — the database.</li>
          <li><strong>Vercel</strong> — hosting, and storage for question images.</li>
          <li><strong>Razorpay</strong> — payments. Receives billing details, never assessment data.</li>
          <li><strong>Resend</strong> — transactional email. Receives the recipient&apos;s name, email address, and the contents of the notification.</li>
          <li><strong>Sentry</strong> — error reporting, when enabled. Configured not to send personal data.</li>
        </ul>
      </Clause>

      <Clause heading="Email we send">
        <p>
          Only about things that have happened in the service: a paper has been
          set for you, or your result is out. There is no marketing email, no
          newsletter and nothing to unsubscribe from. A school that wants these
          switched off entirely can ask us.
        </p>
      </Clause>

      <Clause heading="How long we keep it">
        <p>
          For as long as the school has an account with us. A lapsed plan does
          not delete anything — the school keeps full read access to everything
          it has recorded.
        </p>
        <p>
          When a school asks us to close its account we delete its data within{" "}
          <Fill>[30]</Fill> days, other than anything we are legally required to
          keep, such as payment records for tax purposes. A trial that is never
          upgraded is deleted <Fill>[12]</Fill> months after it lapses, having been
          inactive since {TRIAL_DAYS} days after signup.
        </p>
      </Clause>

      <Clause heading="Children">
        <p>
          The service is used by school pupils, including those under 18. Accounts
          are created by the school, not by students signing themselves up, and
          it is the school&apos;s responsibility to have whatever consent its
          jurisdiction requires from parents or guardians. We collect no more
          from a student than a name, an email address, a class and their answers.
        </p>
      </Clause>

      <Clause heading="Your rights">
        <p>
          A student or parent should ask the school first — the school controls
          the data and can correct or remove an account directly. If the school
          cannot help, write to <Fill>[privacy contact email]</Fill> and we will act
          on the school&apos;s instruction.
        </p>
        <p>
          Schools can ask us at any time for a copy of their data, for a
          correction, or for deletion.
        </p>
      </Clause>

      <Clause heading="Security">
        <p>
          Sessions are signed tokens in httpOnly, secure cookies. Passwords are
          bcrypt-hashed. All traffic is HTTPS. Payment callbacks are verified
          against a cryptographic signature before anything changes. Database
          access is restricted by network allowlist and credentials.
        </p>
        <p>
          No system is perfect. If you believe you have found a vulnerability,
          please tell us at <Fill>[security contact email]</Fill> before telling
          anyone else, and we will work with you.
        </p>
      </Clause>

      <Clause heading="Changes">
        <p>
          If we change this policy in a way that materially affects how a
          school&apos;s data is handled, we will email the school&apos;s
          administrators before it takes effect. The date at the top always
          reflects the current version.
        </p>
        <p>
          See also our <Link href="/terms">terms of service</Link>.
        </p>
      </Clause>
    </LegalPage>
  );
}
