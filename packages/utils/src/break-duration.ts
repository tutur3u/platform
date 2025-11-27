/**
 * Break Duration Utilities
 *
 * Handles validation and formatting for break durations.
 * Breaks are constrained to multiples of 15 minutes.
 */

/** The interval in minutes that break durations must be multiples of */
export const BREAK_INTERVAL = 15;

/** Minimum break duration in minutes */
export const MIN_BREAK_MINUTES = 15;

/** Maximum break duration in minutes (2 hours) */
export const MAX_BREAK_MINUTES = 120;

/** Available break duration options in minutes */
export const BREAK_OPTIONS = [15, 30, 45, 60, 75, 90, 105, 120] as const;

/** Type for valid break duration values */
export type BreakDuration = (typeof BREAK_OPTIONS)[number];

/**
 * Check if a duration value is a valid break duration
 * (positive, multiple of 15, within bounds)
 */
export function isValidBreakDuration(minutes: number): boolean {
  return (
    minutes > 0 &&
    minutes % BREAK_INTERVAL === 0 &&
    minutes >= MIN_BREAK_MINUTES &&
    minutes <= MAX_BREAK_MINUTES
  );
}

/**
 * Round a duration to the nearest valid break interval
 */
export function roundToBreakInterval(minutes: number): number {
  const rounded = Math.round(minutes / BREAK_INTERVAL) * BREAK_INTERVAL;
  return Math.max(MIN_BREAK_MINUTES, Math.min(MAX_BREAK_MINUTES, rounded));
}

/**
 * Format a break duration for display
 * @param minutes Duration in minutes
 * @returns Formatted string (e.g., "15 min", "1h", "1h 30m")
 */
export function formatBreakDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

/**
 * Get break options as label-value pairs for use in select components
 */
export function getBreakOptionLabels(): Array<{
  value: number;
  label: string;
}> {
  return BREAK_OPTIONS.map((mins) => ({
    value: mins,
    label: formatBreakDuration(mins),
  }));
}

/**
 * Parse a break duration from input, ensuring it's valid
 * Returns null if invalid
 */
export function parseBreakDuration(value: unknown): number | null {
  const num = typeof value === 'string' ? parseInt(value, 10) : Number(value);
  if (Number.isNaN(num) || !isValidBreakDuration(num)) {
    return null;
  }
  return num;
}
