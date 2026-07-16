'use client';

import { cn } from '@tuturuuu/utils/format';

interface HabitGaugeProps {
  /** Progress within the current period. */
  value: number;
  /** Threshold that marks the period as "hit". */
  target: number;
  unitLabel?: string;
  /** Caption under the ring, e.g. "This week". */
  caption?: string;
  size?: number;
  className?: string;
}

/**
 * Radial gauge that fills toward the period threshold and turns gold once met.
 * Rendered with plain SVG to stay light and theme-aware.
 */
export function HabitGauge({
  value,
  target,
  unitLabel = '',
  caption,
  size = 120,
  className,
}: HabitGaugeProps) {
  const safeTarget = target > 0 ? target : 1;
  const ratio = Math.max(0, Math.min(value / safeTarget, 1));
  const met = value >= safeTarget && target > 0;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * ratio;
  const percent = Math.round(ratio * 100);

  return (
    <div className={cn('flex flex-col items-center gap-1.5', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          className="-rotate-90"
          height={size}
          role="img"
          aria-label={`${value} of ${target} ${unitLabel}`.trim()}
          viewBox={`0 0 ${size} ${size}`}
          width={size}
        >
          <circle
            className="text-foreground/[0.08]"
            cx={size / 2}
            cy={size / 2}
            fill="none"
            r={radius}
            stroke="currentColor"
            strokeWidth={stroke}
          />
          <circle
            className={cn(
              'transition-all duration-500',
              met ? 'text-dynamic-amber' : 'text-dynamic-green'
            )}
            cx={size / 2}
            cy={size / 2}
            fill="none"
            r={radius}
            stroke="currentColor"
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
            strokeWidth={stroke}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              'font-bold text-2xl tabular-nums',
              met && 'text-dynamic-amber'
            )}
          >
            {percent}%
          </span>
          <span className="text-[10px] text-muted-foreground">
            {Number(value).toLocaleString()}/{Number(target).toLocaleString()}
          </span>
        </div>
      </div>
      {caption ? (
        <span className="text-muted-foreground text-xs">{caption}</span>
      ) : null}
    </div>
  );
}
