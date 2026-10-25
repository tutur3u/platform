import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import { getPressureTone, type OpsTone, opsToneClasses } from './status-tone';

export interface ResourceMeterProps {
  className?: string;
  /** Right-aligned reading, e.g. "12.4 / 24 GB". Defaults to the percent. */
  display?: ReactNode;
  label: ReactNode;
  /** Configured ceiling as a percent; drawn as a marker on the track. */
  limitPercent?: number | null;
  limitLabel?: string;
  /** Measured utilisation 0–100. Null or `stale` renders as unknown. */
  percent: number | null;
  stale?: boolean;
  tone?: OpsTone;
  unknownLabel?: ReactNode;
}

function clampPercent(value: number) {
  return Math.min(Math.max(value, 0), 100);
}

export function ResourceMeter({
  className,
  display,
  label,
  limitLabel,
  limitPercent,
  percent,
  stale = false,
  tone,
  unknownLabel = 'Unknown',
}: ResourceMeterProps) {
  const isUnknown = stale || percent === null || !Number.isFinite(percent);
  const resolvedTone: OpsTone = isUnknown
    ? 'unknown'
    : (tone ?? getPressureTone(percent));
  const width = isUnknown ? 100 : clampPercent(percent);
  const hasLimit =
    typeof limitPercent === 'number' && Number.isFinite(limitPercent);

  return (
    <div
      className={cn('min-w-0 space-y-1', className)}
      data-tone={resolvedTone}
    >
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate text-muted-foreground">{label}</span>
        <span
          className={cn(
            'shrink-0 tabular-nums',
            isUnknown ? 'text-muted-foreground' : 'font-medium text-foreground'
          )}
        >
          {isUnknown ? unknownLabel : (display ?? `${Math.round(percent)}%`)}
        </span>
      </div>
      {isUnknown ? null : (
        <meter
          aria-label={typeof label === 'string' ? label : undefined}
          className="sr-only"
          max={100}
          min={0}
          value={Math.round(percent)}
        />
      )}
      <div
        aria-hidden
        className={cn(
          'relative h-1.5 overflow-hidden rounded-full',
          isUnknown
            ? 'border border-muted-foreground/40 border-dashed'
            : 'bg-foreground/10'
        )}
      >
        {isUnknown ? null : (
          <div
            className={cn(
              'h-full rounded-full',
              opsToneClasses[resolvedTone].fill
            )}
            style={{ width: `${width}%` }}
          />
        )}
        {hasLimit ? (
          <div
            className="absolute inset-y-0 w-0.5 bg-foreground/60"
            style={{ left: `calc(${clampPercent(limitPercent)}% - 1px)` }}
            title={limitLabel}
          />
        ) : null}
      </div>
    </div>
  );
}
