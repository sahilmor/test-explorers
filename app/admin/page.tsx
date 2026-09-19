import type { Metadata } from "next";
import { ComingSoon, PageHeading } from "@/components/app/app-shell";
import { requireRole } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import School from "@/models/School";
import User from "@/models/User";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

const ROLE_DOT: Record<string, string> = {
  admin: "bg-lime",
  teacher: "bg-coral",
  student: "bg-cobalt",
};

export default async function AdminHome() {
  const session = await requireRole("admin");

  await connectToDatabase();

  // Both queries are filtered by the token's schoolId. There is no code path
  // here that could be pointed at another school.
  const [school, people] = await Promise.all([
    School.findById(session.schoolId).select("name slug plan planValidUntil").lean(),
    User.find({ schoolId: session.schoolId })
      .select("name email role createdAt")
      .sort({ createdAt: 1 })
      .limit(50)
      .lean(),
  ]);

  const trialEnds = school?.planValidUntil
    ? new Date(school.planValidUntil).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";

  return (
    <div className="space-y-12">
      <PageHeading
        eyebrow="Admin"
        title={school?.name ?? "Your school"}
        blurb="You run this school's account. Everything below is scoped to it and nothing else."
      />

      <div className="grid gap-5 sm:grid-cols-3">
        <Stat label="Plan" value={school?.plan ?? "trial"} tone="lime" />
        <Stat label="Trial ends" value={trialEnds} tone="coral" />
        <Stat label="People" value={String(people.length)} tone="cobalt" />
      </div>

      <section>
        <h2 className="font-display text-xl font-bold tracking-tight text-ink">
          Everyone at {school?.name ?? "your school"}
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Scoped to school <code className="font-mono text-xs">{session.schoolId}</code>.
        </p>

        <ul className="mt-5 divide-y-2 divide-ink overflow-hidden rounded-xl border-2 border-ink bg-paper-pure shadow-[5px_5px_0_var(--ink)]">
          {people.map((person) => (
            <li
              key={String(person._id)}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4"
            >
              <span
                aria-hidden="true"
                className={`size-3 shrink-0 rounded-full border-2 border-ink ${ROLE_DOT[person.role] ?? "bg-paper-deep"}`}
              />
              <span className="font-display font-bold text-ink">{person.name}</span>
              <span className="text-sm text-ink-soft">{person.email}</span>
              <span className="eyebrow ml-auto text-ink-soft">{person.role}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        <ComingSoon
          title="Question bank"
          body="Write questions once, reuse them across papers and classes."
          tone="lime"
        />
        <ComingSoon
          title="Classes & enrolment"
          body="Group students into classes and assign papers to a whole class at once."
          tone="coral"
        />
        <ComingSoon
          title="Results"
          body="Marks, distributions and per-question breakdowns after each sitting."
          tone="cobalt"
        />
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "lime" | "coral" | "cobalt";
}) {
  const bg =
    tone === "lime"
      ? "bg-lime"
      : tone === "coral"
        ? "bg-coral"
        : "bg-cobalt text-white";

  return (
    <div
      className={`rounded-xl border-2 border-ink px-5 py-5 shadow-[5px_5px_0_var(--ink)] ${bg}`}
    >
      <p className="eyebrow opacity-80">{label}</p>
      <p className="mt-2 font-display text-2xl font-extrabold tracking-tight capitalize">
        {value}
      </p>
    </div>
  );
}
