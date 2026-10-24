import type { WindowKind } from '../types';

export function resetTimestamp(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    return;
  const milliseconds = value > 1_000_000_000_000 ? value : value * 1000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function windowKind(
  minutes: number | undefined,
  index: number
): WindowKind {
  if (typeof minutes === 'number') return minutes <= 1440 ? 'short' : 'long';
  return index === 0 ? 'short' : 'long';
}
