import type { CalendarPreferences } from '../../../../hooks/use-calendar-preferences';

/** Compare and format event instants in the calendar's resolved display zone. */
export function formatEventPreviewTime(
  startAt: string | undefined,
  endAt: string | undefined,
  preferences: CalendarPreferences,
  locale: string
): string {
  if (!startAt || !endAt) return '';
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()))
    return '';

  const timeZone =
    preferences.timezone && preferences.timezone !== 'auto'
      ? preferences.timezone
      : undefined;
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const date = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const time = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: preferences.timeFormat === '24h' ? 'h23' : 'h12',
  });
  return dateKey.format(start) === dateKey.format(end)
    ? `${date.format(start)} - ${time.format(start)} - ${time.format(end)}`
    : `${date.format(start)}, ${time.format(start)} - ${date.format(end)}, ${time.format(end)}`;
}
