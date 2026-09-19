import type { Metadata } from "next";
import { ComingSoon, PageHeading } from "@/components/app/app-shell";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Student" };
export const dynamic = "force-dynamic";

export default async function StudentHome() {
  await requireRole("student");

  return (
    <div className="space-y-12">
      <PageHeading
        eyebrow="Student"
        title="Nothing due. Enjoy it."
        blurb="Tests your teachers set will show up here, with the time you have left to sit them."
      />

      <section className="grid gap-5 md:grid-cols-3">
        <ComingSoon
          title="Upcoming tests"
          body="What's been set for your class, when it opens, and how long you get."
          tone="cobalt"
        />
        <ComingSoon
          title="Sit a test"
          body="One question at a time, answers saved as you go, timer you can see."
          tone="lime"
        />
        <ComingSoon
          title="Your results"
          body="Marks once your teacher releases them, with what you got wrong and why."
          tone="coral"
        />
      </section>
    </div>
  );
}
