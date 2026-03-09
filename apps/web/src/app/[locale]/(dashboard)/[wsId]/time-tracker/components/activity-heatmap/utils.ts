import '@/lib/dayjs-setup';
import { formatDuration } from '@tuturuuu/hooks/utils/time-format';
import dayjs from 'dayjs';

let hasWarnedAboutMillisecondDuration = false;

export type HeatmapTimeReference = 'relative' | 'absolute' | 'smart';

interface ActivityTooltipTranslations {
  noActivityRecorded: string;
  tracked: string;
  today: string;
  sessions: (count: number) => string;
}

interface ActivityTooltipOptions {
  activity?: { duration: number; sessions: number } | null;
  date: string | dayjs.Dayjs;
  timeReference: HeatmapTimeReference;
  today: dayjs.Dayjs;
  userTimezone: string;
  translations: ActivityTooltipTranslations;
}

interface ActivityTooltipContent {
  headline: string;
  supportingLabel?: string;
  detail: string;
}

const normalizeDurationSeconds = (duration: number): number => {
  if (duration > 604_800) {
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
  dayjs.tz(
    `${normalizeActivityDateKey(value, userTimezone)}T00:00:00`,
    userTimezone
  );

export const getActivityTooltipContent = ({
  activity,
  date,
  timeReference,
  today,
  userTimezone,
  translations,
}: ActivityTooltipOptions): ActivityTooltipContent => {
  const dateObj =
    typeof date === 'string' ? parseActivityDate(date, userTimezone) : date;
  const normalizedDate = dateObj.tz(userTimezone);
  const absoluteLabel = normalizedDate.format('ddd, DD/MM/YYYY');
  const relativeLabel = normalizedDate.isSame(today, 'day')
    ? translations.today
    : normalizedDate.fromNow();
  const hasActivity = (activity?.duration ?? 0) > 0;

  let headline = absoluteLabel;
  let supportingLabel: string | undefined;

  if (timeReference === 'relative') {
    headline = relativeLabel;
    supportingLabel = absoluteLabel;
  } else if (timeReference === 'absolute') {
    supportingLabel = normalizedDate.isSame(today, 'day')
      ? translations.today
      : undefined;
  } else {
    supportingLabel = relativeLabel;
  }

  return {
    headline,
    supportingLabel,
    detail: hasActivity
      ? [
          `${formatDuration(activity?.duration ?? 0)} ${translations.tracked}`,
          activity && activity.sessions > 0
            ? translations.sessions(activity.sessions)
            : null,
        ]
          .filter(Boolean)
          .join(' • ')
      : translations.noActivityRecorded,
  };
};

export const getActivityTooltipLabel = (
  options: ActivityTooltipOptions
): string => {
  const { detail, headline, supportingLabel } =
    getActivityTooltipContent(options);

  return [headline, supportingLabel, detail].filter(Boolean).join(' • ');
};

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
