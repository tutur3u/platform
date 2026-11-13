'use client';

import { useLocale } from 'next-intl';
import { useMeetingTimeZone } from '@/features/call/components/meeting-local-time';
import { meetingStart } from './section-rules';
import type { ScheduledMeeting, UtcInstant, ViewerTimezone } from './types';

/**
 * The profile timezone when one is set; otherwise the browser's, which is
 * undefined during server rendering so no server-zone time is shown.
 */
export function useViewerTimeZone(viewer: ViewerTimezone) {
  const browser = useMeetingTimeZone();
  return viewer.source === 'user-profile' ? viewer.timeZone : browser;
}

export function formatClock(
  value: UtcInstant,
  locale: string,
  timeZone: string
) {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(value));
}

export function formatDay(
  value: UtcInstant,
  locale: string,
  timeZone: string,
  withYear = false
) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone,
    weekday: 'short',
    ...(withYear ? { year: 'numeric' as const } : {}),
  }).format(new Date(value));
}

/** Short zone name such as "GMT+7" at a given instant. */
export function formatZoneName(
  locale: string,
  timeZone: string,
  at: UtcInstant
) {
  return (
    new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' })
      .formatToParts(new Date(at))
      .find((part) => part.type === 'timeZoneName')?.value ?? timeZone
  );
}

/** Start (and Calendar end when linked) of a meeting in the viewer's zone. */
export function MeetingTimeRange({
  meeting,
  timeZone,
  withDate,
  noTimeLabel,
}: {
  meeting: ScheduledMeeting;
  timeZone: string | undefined;
  withDate: boolean;
  noTimeLabel: string;
}) {
  const locale = useLocale();
  const start = meetingStart(meeting);
  if (!start) return <span>{noTimeLabel}</span>;
  if (!timeZone) return <time dateTime={start}>{'—'}</time>;
  const end = meeting.calendar?.endAt;
  const endValid = end && Number.isFinite(Date.parse(end)) ? end : null;
  return (
    <span className="tabular-nums">
      {withDate && (
        <>
          <time dateTime={start}>
            {formatDay(
              start,
              locale,
              timeZone,
              new Date(start).getUTCFullYear() !== new Date().getUTCFullYear()
            )}
          </time>
          {' · '}
        </>
      )}
      <time dateTime={start}>{formatClock(start, locale, timeZone)}</time>
      {endValid && (
        <>
          {' – '}
          <time dateTime={endValid}>
            {formatClock(endValid, locale, timeZone)}
          </time>
        </>
      )}
    </span>
  );
}
