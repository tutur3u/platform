'use client';

import { cn } from '@tuturuuu/utils/format';
import { useMemo } from 'react';

export interface BreakdownDatum {
  label: string;
  value: number;
}

interface BreakdownBarsProps {
  data: BreakdownDatum[];
  unitLabel?: string;
  /** Max rows to show; the rest collapse into "Other". */
  limit?: number;
  /** Literal Tailwind bg class for the filled bar. */
  barClassName?: string;
  emptyLabel?: string;
  className?: string;
}

export function BreakdownBars({
  data,
  unitLabel = '',
  limit = 8,
  barClassName = 'bg-dynamic-blue',
  emptyLabel = 'No data yet',
  className,
}: BreakdownBarsProps) {
  const rows = useMemo(() => {
    const sorted = [...data]
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
    if (sorted.length <= limit) return sorted;
    const head = sorted.slice(0, limit - 1);
    const rest = sorted.slice(limit - 1);
    const otherValue = rest.reduce((sum, r) => sum + r.value, 0);
    return [...head, { label: 'Other', value: otherValue }];
  }, [data, limit]);

  const max = useMemo(() => Math.max(...rows.map((r) => r.value), 1), [rows]);
  const numberFormatter = useMemo(() => new Intl.NumberFormat(), []);

  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyLabel}</p>;
  }

  return (
    <div className={cn('space-y-2.5', className)}>
      {rows.map((row) => (
        <div
          className="grid grid-cols-[minmax(4rem,8rem)_1fr_auto] items-center gap-3"
          key={row.label}
        >
          <span
            className="truncate text-muted-foreground text-sm"
            title={row.label}
          >
            {row.label}
          </span>
          <div className="h-2.5 overflow-hidden rounded-full bg-foreground/[0.06]">
            <div
              className={cn('h-full rounded-full transition-all', barClassName)}
              style={{ width: `${Math.max((row.value / max) * 100, 2)}%` }}
            />
          </div>
          <span className="text-right text-sm tabular-nums">
            {numberFormatter.format(row.value)}
            {unitLabel ? (
              <span className="ml-1 text-muted-foreground text-xs">
                {unitLabel}
              </span>
            ) : null}
          </span>
        </div>
      ))}
    </div>
  );
}
