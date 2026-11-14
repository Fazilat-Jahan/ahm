/** Tiny inline trend line for an indicator card (SPEC §8.3 screen 1).
 * Hand-rolled SVG rather than Recharts — Recharts is for C6's full Trends
 * charts (axes, bands, legends); a handful of points on a card doesn't
 * need that weight. Pure/presentational: every point is a real saved
 * value passed in by the caller, nothing generated here. */
export function Sparkline({
  values,
  colorVar,
  width = 64,
  height = 24,
}: {
  values: number[];
  colorVar: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);

  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={`var(${colorVar})`}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
