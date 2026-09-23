import type { Metadata } from "next";
import Link from "next/link";
import { Clause, Fill, LegalPage } from "@/components/marketing/legal-page";
import { ANNUAL_PLAN, TRIAL_DAYS, TRIAL_MAX_STUDENTS, formatPaise } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Terms of service",
  description:
    "The agreement between a school and Shalasys: what the service does, what it costs, what happens when a plan lapses, and who owns the content.",
  alternates: { canonical: "/terms" },
};

const UPDATED = "23 September 2026";

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      updated={UPDATED}
      summary="The agreement between your school and us. Written to be read rather than skipped — it is short, and the parts that cost money or end the relationship are in plain words."
    >
      <Clause heading="The agreement">
        <p>
          These terms are between <Fill>[legal entity name]</Fill> (&ldquo;we&rdquo;,
          &ldquo;us&rdquo;) and the school that creates an account
          (&ldquo;you&rdquo;). Creating an account means the person doing so has
          authority to agree to these terms for the school.
        </p>
      </Clause>

      <Clause heading="What the service is">
        <p>
          Software for a single school to run its own internal assessments: a
          question bank, papers built from it, an online screen for sitting them,
          automatic marking of multiple-choice answers, and reporting on results.
        </p>
        <p>
          It is not a proctoring service. It does not watch students through a
          camera, monitor their screen, or attempt to detect cheating.
          Invigilation remains the school&apos;s job, exactly as it is on paper.
        </p>
      </Clause>

      <Clause heading="Accounts and conduct">
        <ul>
          <li>
            You are responsible for who you give accounts to and for what they do
            with them. Tell us promptly if an account is compromised.
          </li>
          <li>
            Give real details. Accounts are per person — sharing a login between
            staff makes the audit trail meaningless.
          </li>
          <li>
            Do not use the service to store content you have no right to
            distribute, or to attempt to reach another school&apos;s data.
          </li>
        </ul>
      </Clause>

      <Clause heading="Who owns what">
        <p>
          <strong>Your content is yours.</strong> Questions, papers, student
          records and results belong to your school. We claim no ownership and no
          licence beyond what is needed to store it, display it back to you, and
          back it up.
        </p>
        <p>
          <strong>The software is ours.</strong> These terms grant your school a
          licence to use it while your account is active — not ownership of it.
        </p>
      </Clause>

      <Clause heading="Trial, price and payment">
        <ul>
          <li>
            A new school starts on a free trial of {TRIAL_DAYS} days with up to{" "}
            {TRIAL_MAX_STUDENTS} students. No card is required and nothing is
            charged automatically when it ends.
          </li>
          <li>
            The {ANNUAL_PLAN.name} plan is{" "}
            {formatPaise(ANNUAL_PLAN.amountPaise)} per school per year, covering
            up to {ANNUAL_PLAN.maxStudents} students. Prices are in Indian Rupees
            and exclude any taxes that apply.
          </li>
          <li>
            Payment is a single annual amount taken through Razorpay. It does not
            renew automatically — you choose to renew, and renewing early adds
            the time you have left onto the new year rather than discarding it.
          </li>
          <li>
            We may change the price. An existing school keeps the price it paid
            for the term it paid for, and we will give at least{" "}
            <Fill>[30]</Fill> days&apos; notice before a renewal costs more.
          </li>
        </ul>
      </Clause>

      <Clause heading="What happens when a plan lapses">
        <p>
          <strong>Nothing is deleted and nothing becomes unreadable.</strong> Every
          paper, mark and student record stays exactly where it is, and staff and
          students can still sign in and read all of it.
        </p>
        <p>What stops is new work, until the plan is renewed:</p>
        <ul>
          <li>setting new papers;</li>
          <li>adding students beyond those you already have;</li>
          <li>students starting a new sitting.</li>
        </ul>
        <p>
          A student already part-way through a paper when a plan lapses finishes
          it and has it marked normally. We are not going to void a child&apos;s
          exam over an invoice.
        </p>
      </Clause>

      <Clause heading="Refunds">
        <p>
          If the service is materially broken and we cannot fix it within a
          reasonable time, write to <Fill>[billing contact email]</Fill> and we
          will refund the unused part of your term. Beyond that, annual payments
          are non-refundable — which is why the trial exists and why it is the
          whole product rather than a restricted version of it.
        </p>
      </Clause>

      <Clause heading="Availability">
        <p>
          We work to keep the service available and will give notice of planned
          maintenance where we can, but we do not offer a contractual uptime
          guarantee at this stage. If uptime commitments matter for your exam
          schedule, talk to us at <Fill>[contact email]</Fill> before you rely on
          the service for a high-stakes assessment.
        </p>
      </Clause>

      <Clause heading="Ending the agreement">
        <p>
          You can stop using the service at any time and ask us to delete your
          data; see the <Link href="/privacy">privacy policy</Link> for how that
          works. We may suspend an account that is being used to attack the
          service or to break the law, and we will tell you why.
        </p>
        <p>
          Before you leave, ask us for an export. We would rather hand your data
          back than have you lose it.
        </p>
      </Clause>

      <Clause heading="Liability">
        <p>
          To the extent the law allows, our total liability under these terms is
          limited to what you paid us in the twelve months before the claim. We
          are not liable for indirect or consequential loss.
        </p>
        <p>
          Nothing here limits liability that cannot legally be limited, including
          for death or personal injury caused by negligence, or for fraud.
        </p>
      </Clause>

      <Clause heading="Governing law and changes">
        <p>
          These terms are governed by the laws of <Fill>[jurisdiction]</Fill>, and
          its courts have exclusive jurisdiction.
        </p>
        <p>
          If we change these terms materially we will email your administrators
          before the change takes effect. Continuing to use the service after
          that means you accept the new version.
        </p>
      </Clause>
    </LegalPage>
  );
}
