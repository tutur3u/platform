'use client';

import { Calendar, ExternalLink } from '@tuturuuu/icons';
import { useLocale, useTranslations } from 'next-intl';
import { CALENDAR_URL } from '@/constants/common';
import { MeetingRow } from './meeting-row';
import { formatDay, formatZoneName } from './meeting-time';
import { groupUpcomingByDay } from './section-rules';
import type {
  CalendarAccess,
  MeetingManagement,
  ScheduledMeeting,
  UtcInstant,
} from './types';

export function calendarHomeHref(wsId: string) {
  return new URL(
    `/${encodeURIComponent(wsId)}`,
    CALENDAR_URL.replace(/\/+$/, '')
  ).toString();
}

export function UpcomingSection({
  meetings,
  calendarAccess,
  timeZone,
  now,
  accountId,
  wsId,
  management,
}: {
  meetings: ScheduledMeeting[];
  calendarAccess: CalendarAccess;
  timeZone: string | undefined;
  now: UtcInstant;
  accountId: string;
  wsId: string;
  management: MeetingManagement;
}) {
  const t = useTranslations('meet.meetings');
  const locale = useLocale();
  const groups = timeZone ? groupUpcomingByDay(meetings, timeZone, now) : [];
  return (
    <section aria-labelledby="meetings-upcoming" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2
          className="font-semibold text-base tracking-tight"
          id="meetings-upcoming"
        >
          {t('section_upcoming')}
        </h2>
        <div className="flex items-center gap-3 text-muted-foreground text-xs">
          {timeZone && (
            <span>
              {t('times_in', { zone: formatZoneName(locale, timeZone, now) })}
            </span>
          )}
          {calendarAccess.status === 'available' && (
            <a
              className="inline-flex items-center gap-1 rounded-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={calendarHomeHref(wsId)}
              rel="noreferrer"
              target="_blank"
            >
              <Calendar aria-hidden className="size-3.5" />
              {t('open_calendar')}
              <ExternalLink aria-hidden className="size-3" />
            </a>
          )}
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {meetings.length === 0 ? (
          <p className="px-4 py-6 text-center text-muted-foreground text-sm md:px-5">
            {t('upcoming_empty')}
          </p>
        ) : timeZone ? (
          groups.map((group) => (
            <div className="border-t first:border-t-0" key={group.key}>
              <h3 className="border-b bg-muted/40 px-4 py-1.5 font-medium text-muted-foreground text-xs md:px-5">
                {group.relative
                  ? t(group.relative)
                  : formatDay(group.anchor, locale, timeZone)}
              </h3>
              <ul className="divide-y">
                {group.meetings.map((meeting) => (
                  <MeetingRow
                    accountId={accountId}
                    key={meeting.id}
                    management={management}
                    meeting={meeting}
                    timeZone={timeZone}
                    withDate={false}
                    wsId={wsId}
                  />
                ))}
              </ul>
            </div>
          ))
        ) : (
          <ul className="divide-y">
            {meetings.map((meeting) => (
              <MeetingRow
                accountId={accountId}
                key={meeting.id}
                management={management}
                meeting={meeting}
                timeZone={undefined}
                withDate
                wsId={wsId}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
