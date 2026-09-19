import type { Metadata } from "next";
import { ComingSoon, PageHeading } from "@/components/app/app-shell";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Teacher" };
export const dynamic = "force-dynamic";

export default async function TeacherHome() {
  // The layout lets admins into /teacher so they can reach the question bank.
  // This page is a teacher's own view, so it narrows the gate back down —
  // an admin who lands here is sent to /admin.
  await requireRole("teacher");

  return (
    <div className="space-y-12">
      <PageHeading
        eyebrow="Teacher"
        title="Your papers"
        blurb="Setting and marking lands here. Phase 1 only proves you got to the right room."
      />

      <section className="grid gap-5 md:grid-cols-3">
        <ComingSoon
          title="Write a paper"
          body="Pull questions from the bank, set a duration, pick the classes sitting it."
          tone="coral"
        />
        <ComingSoon
          title="Live sittings"
          body="Watch who has started, who has submitted, and who ran out of time."
          tone="lime"
        />
        <ComingSoon
          title="Marking"
          body="Auto-marked questions arrive done. Written answers queue up for you."
          tone="cobalt"
        />
      </section>
    </div>
  );
}
