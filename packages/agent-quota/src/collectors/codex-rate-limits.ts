import type { UsageWindow, WindowKind } from '../types';

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

export function providerWindowKind(
  minutes: number | undefined
): UsageWindow['providerWindowKind'] {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0)
    return undefined;
  if (minutes <= 24 * 60) return 'session';
  if (minutes <= 8 * 24 * 60) return 'weekly';
  if (minutes >= 28 * 24 * 60 && minutes <= 366 * 24 * 60) return 'monthly';
  return 'other';
}
