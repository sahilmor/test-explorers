/**
 * Decorative answer-sheet grid. Rows of OMR bubbles with a few marked in, in
 * brand colours. Deterministic (no Math.random) so the server and client
 * render identically.
 */
export function BubbleGrid({
  rows = 7,
  cols = 5,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  const gap = 34;
  const r = 11;
  const pad = 18;
  const width = pad * 2 + (cols - 1) * gap;
  const height = pad * 2 + (rows - 1) * gap;

  // Which bubble is filled on each row, and in which colour.
  const filled = ["var(--lime)", "var(--coral)", "var(--lime)", "var(--cobalt)"];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="presentation"
      aria-hidden="true"
    >
      {Array.from({ length: rows }).map((_, row) =>
        Array.from({ length: cols }).map((__, col) => {
          // A stable pseudo-pattern: every row marks one bubble.
          const marked = (row * 3 + 1) % cols === col;
          const cx = pad + col * gap;
          const cy = pad + row * gap;

          return (
            <circle
              key={`${row}-${col}`}
              cx={cx}
              cy={cy}
              r={r}
              fill={marked ? filled[row % filled.length] : "none"}
              stroke="currentColor"
              strokeWidth={2.5}
              opacity={marked ? 1 : 0.35}
            />
          );
        })
      )}
    </svg>
  );
}
