import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * The house table. Ink-bordered slab with a coloured header band and hard
 * offset shadow, so a data screen reads as the same product as the landing
 * page rather than a default admin grid.
 *
 * Deliberately not a generic column-config abstraction — callers write their
 * own <Row>/<Cell> markup, which keeps each screen readable.
 */
export function TableFrame({
  head,
  children,
  tone = "lime",
  className,
}: {
  head: ReactNode;
  children: ReactNode;
  tone?: "lime" | "coral" | "cobalt";
  className?: string;
}) {
  const band =
    tone === "lime" ? "bg-lime" : tone === "coral" ? "bg-coral" : "bg-cobalt";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border-2 border-ink bg-paper-pure shadow-[5px_5px_0_var(--ink)]",
        className
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead className={cn(band, "border-b-2 border-ink")}>{head}</thead>
          <tbody className="divide-y-2 divide-ink/15">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function Th({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "eyebrow whitespace-nowrap px-5 py-3.5 text-ink",
        className
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <td className={cn("px-5 py-3.5 align-middle text-sm text-ink", className)}>
      {children}
    </td>
  );
}

export function Tr({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <tr className={cn("transition-colors hover:bg-lime-wash/60", className)}>
      {children}
    </tr>
  );
}

/** Small coloured pill for grades, roles, section names. */
export function Pill({
  children,
  tone = "paper",
}: {
  children: ReactNode;
  tone?: "paper" | "lime" | "coral" | "cobalt" | "danger";
}) {
  const styles = {
    paper: "bg-paper-deep text-ink",
    lime: "bg-lime text-ink",
    coral: "bg-coral text-ink",
    cobalt: "bg-cobalt text-white",
    danger: "bg-danger-wash text-danger",
  }[tone];

  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border-2 border-ink px-2.5 py-0.5 font-display text-xs font-bold",
        styles
      )}
    >
      {children}
    </span>
  );
}
