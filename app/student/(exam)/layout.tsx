/**
 * The exam frame: nothing at all.
 *
 * Sitting a paper is the one screen with no navigation, no header and no way
 * to wander off by accident. The sitting screen draws its own sticky bar with
 * the only two things that matter — the clock and whether the work is saved.
 */
export default function ExamLayout({ children }: LayoutProps<"/student">) {
  return <>{children}</>;
}
