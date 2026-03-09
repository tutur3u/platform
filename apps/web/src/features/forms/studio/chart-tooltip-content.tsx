'use client';

import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

type TooltipEntry = {
  color?: string;
  dataKey?: string | number;
  fill?: string;
  name?: string | number;
  payload?: Record<string, unknown>;
  value?: string | number;
};

type TooltipFormatter = (
  value: string | number | undefined,
  name: string | number | undefined,
  item: TooltipEntry,
  index: number
) => ReactNode | [ReactNode, ReactNode];

export function ChartTooltipContent({
  active,
  payload,
  label,
  labelFormatter,
  formatter,
  hideLabel = false,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  labelFormatter?: (
    label: string | number | undefined,
    payload?: TooltipEntry[]
  ) => ReactNode;
  formatter?: TooltipFormatter;
  hideLabel?: boolean;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const displayLabel = labelFormatter ? labelFormatter(label, payload) : label;

  return (
    <div className="min-w-36 rounded-xl border border-border/70 bg-background/95 px-3 py-2 shadow-2xl backdrop-blur supports-backdrop-filter:bg-background/85">
      {!hideLabel && displayLabel ? (
        <div className="mb-2 border-border/50 border-b pb-2 font-medium text-foreground text-xs">
          {displayLabel}
        </div>
      ) : null}
      <div className="space-y-1.5">
        {payload.map((item, index) => {
          const indicatorColor = item.color || item.fill || 'currentColor';
          const formatted = formatter?.(item.value, item.name, item, index);
          const [formattedValue, formattedName] = Array.isArray(formatted)
            ? formatted
            : [formatted, item.name];
          const resolvedName =
            formattedName ?? item.name ?? item.dataKey ?? 'Value';
          const resolvedValue = formattedValue ?? item.value ?? '';

          return (
            <div
              key={`${item.dataKey ?? item.name ?? 'item'}-${index}`}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: String(indicatorColor) }}
                />
                <span className="truncate text-muted-foreground text-xs">
                  {resolvedName}
                </span>
              </div>
              <span
                className={cn('shrink-0 font-semibold text-xs')}
                style={{ color: String(indicatorColor) }}
              >
                {resolvedValue}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
