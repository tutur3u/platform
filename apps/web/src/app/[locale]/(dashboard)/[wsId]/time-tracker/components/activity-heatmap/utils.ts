import '@/lib/dayjs-setup';
import dayjs from 'dayjs';

let hasWarnedAboutMillisecondDuration = false;

const normalizeDurationSeconds = (duration: number): number => {
  if (duration > 100_000) {
    if (
      process.env.NODE_ENV !== 'production' &&
      !hasWarnedAboutMillisecondDuration
    ) {
      hasWarnedAboutMillisecondDuration = true;
      console.warn(
        'Activity heatmap duration appears to be in milliseconds; normalizing to seconds.'
      );
    }

    return duration / 1000;
  }

  return duration;
};

/**
 * Maps an activity duration in seconds to a heatmap intensity bucket.
 * Values that look like millisecond durations are normalized to seconds.
 */
export const getIntensity = (duration: number): number => {
  const normalizedDuration = normalizeDurationSeconds(duration);

  if (normalizedDuration === 0) return 0;
  if (normalizedDuration < 1800) return 1;
  if (normalizedDuration < 3600) return 2;
  if (normalizedDuration < 7200) return 3;
  return 4;
};

export const isCanonicalActivityDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value);

export const normalizeActivityDateKey = (
  value: string,
  userTimezone: string
): string => {
  if (isCanonicalActivityDate(value)) {
    return value;
  }

  return dayjs.utc(value).tz(userTimezone).format('YYYY-MM-DD');
};

export const parseActivityDate = (value: string, userTimezone: string) =>
  dayjs(normalizeActivityDateKey(value, userTimezone));

export const getColorClass = (intensity: number): string => {
  const colors = [
    'bg-[color:var(--heatmap-level-0)]',
    'bg-[color:var(--heatmap-level-1)]',
    'bg-[color:var(--heatmap-level-2)]',
    'bg-[color:var(--heatmap-level-3)]',
    'bg-[color:var(--heatmap-level-4)]',
  ];
  return colors[Math.max(0, Math.min(4, intensity))] ?? colors[0]!;
};
