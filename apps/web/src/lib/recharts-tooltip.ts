import type { ReactNode } from 'react';
import type { TooltipProps, TooltipValueType } from 'recharts';

type TooltipName = string | number;

export type RechartsTooltipFormatter = NonNullable<
  TooltipProps<TooltipValueType, TooltipName>['formatter']
>;

export function getTooltipNumber(
  value: TooltipValueType | undefined
): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const parsedEntry = typeof entry === 'number' ? entry : Number(entry);

      if (Number.isFinite(parsedEntry)) {
        return parsedEntry;
      }
    }
  }

  return null;
}

export function getTooltipDisplayValue(
  value: TooltipValueType | undefined
): string | number {
  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (typeof value === 'number' || typeof value === 'string') {
    return value;
  }

  return '';
}

export function getTooltipName(name: TooltipName | undefined): string {
  return typeof name === 'number' ? String(name) : (name ?? '');
}

export function formatTooltipValue(
  value: TooltipValueType | undefined,
  formatter: (value: number) => ReactNode,
  fallback?: (value: string | number) => ReactNode
): ReactNode {
  const numericValue = getTooltipNumber(value);

  if (numericValue !== null) {
    return formatter(numericValue);
  }

  const displayValue = getTooltipDisplayValue(value);

  return fallback ? fallback(displayValue) : displayValue;
}
