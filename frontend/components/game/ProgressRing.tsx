interface ProgressRingProps {
  progress: number;
  target: number;
  /** Diameter in px. */
  size?: number;
  /** Accessible description, e.g. "Weekly challenge". */
  label: string;
}

/**
 * Small progress ring (SPEC §11: "progress ring on Home"). The count is
 * always written inside the ring as text ("3/5"), so the ring's fill is
 * never the only signal. Static SVG: no animation to switch off for
 * reduced motion. Neutral colours only — progress here is never a health
 * status.
 */
export function ProgressRing({
  progress,
  target,
  size = 64,
  label,
}: ProgressRingProps) {
  const stroke = Math.max(4, Math.round(size / 10));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = target > 0 ? Math.min(Math.max(progress / target, 0), 1) : 0;

  return (
    <div
      role="img"
      aria-label={`${label}: ${progress} of ${target}`}
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center text-sm font-semibold"
      >
        {progress}/{target}
      </span>
    </div>
  );
}
