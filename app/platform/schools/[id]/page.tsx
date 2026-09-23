import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SchoolDetailScreen } from "@/components/platform/school-detail";
import { Wordmark } from "@/components/brand/wordmark";
import { SetupError } from "@/lib/errors";
import { getSchoolDetail } from "@/lib/platform-admin";
import { requirePlatformOwner } from "@/lib/platform";

export const metadata: Metadata = { title: "Manage school" };
export const dynamic = "force-dynamic";

/**
 * One school, managed from outside it.
 *
 * Same gate and same dark frame as /platform, so it is obvious at a glance
 * that this is not a school's own dashboard — the surest way to make a mess
 * is to forget whose data you are editing.
 */
export default async function ManageSchoolPage({
  params,
}: PageProps<"/platform/schools/[id]">) {
  try {
    await requirePlatformOwner();
  } catch (error) {
    if (error instanceof SetupError) notFound();
    throw error;
  }

  const { id } = await params;

  let school;
  try {
    school = await getSchoolDetail(id);
  } catch (error) {
    if (error instanceof SetupError) notFound();
    throw error;
  }

  return (
    <div className="min-h-dvh bg-ink px-5 py-10 sm:px-8 sm:py-14">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-9">
          <Wordmark href="/platform" tone="paper" />
          <p className="eyebrow mt-4 text-lime">Managing</p>
          <h1 className="mt-2 font-display text-display-lg font-extrabold tracking-tight text-paper">
            {school.name}
          </h1>
          <p className="mt-2 text-sm text-paper/55">
            You are editing this school&apos;s own data on its behalf. Nothing
            here is visible to other schools.
          </p>
        </header>

        <div className="rounded-xl bg-paper p-5 sm:p-7">
          <SchoolDetailScreen initial={school} />
        </div>
      </div>
    </div>
  );
}
