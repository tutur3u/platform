import { cn } from '@tuturuuu/utils/format';

interface MiniSparklineProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  /** Stroke color (defaults to currentColor). */
  strokeClassName?: string;
  /** Accessible label for the SVG. */
  title?: string;
}

/**
 * Tiny axis-less sparkline for inline trends (e.g. a member's last 7 days).
 * Pure SVG, no dependencies.
 */
export function MiniSparkline({
  data,
  width = 64,
  height = 20,
  className,
  strokeClassName = 'text-dynamic-blue',
  title = 'Recent trend',
}: MiniSparklineProps) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const step = data.length > 1 ? width / (data.length - 1) : 0;
  const points = data
    .map((value, index) => {
      const x = index * step;
      const y = height - (Math.max(0, value) / max) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      className={cn(strokeClassName, className)}
      height={height}
      role="img"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
    >
      <title>{title}</title>
      <polyline
        fill="none"
        points={points}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
    </svg>
  );
}
