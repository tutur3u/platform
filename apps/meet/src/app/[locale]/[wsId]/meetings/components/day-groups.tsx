'use client';

import { useLocale, useTranslations } from 'next-intl';
import { MeetingRow } from './meeting-row';
import { formatDay } from './meeting-time';
import type { PastDay } from './section-rules';
import type { MeetingManagement } from './types';

/**
 * Past meetings under one header per calendar day. The day header carries the
 * date, so rows show only the time of day.
 */
export function PastDayGroups({
  groups,
  now,
  timeZone,
  accountId,
  wsId,
  management,
}: {
  groups: PastDay[];
  now: string;
  timeZone: string;
  accountId: string;
  wsId: string;
  management: MeetingManagement;
}) {
  const t = useTranslations('meet.meetings');
  const locale = useLocale();
  const yearIn = (value: string) =>
    new Intl.DateTimeFormat('en', { timeZone, year: 'numeric' }).format(
      new Date(value)
    );
  const currentYear = yearIn(now);
  return (
    <>
      {groups.map((group) => (
        <div className="border-t first:border-t-0" key={group.key}>
          <h3 className="border-b bg-muted/40 px-4 py-1.5 font-medium text-muted-foreground text-xs md:px-5">
            {group.anchor === null
              ? t('no_time')
              : group.relative
                ? t(group.relative)
                : formatDay(
                    group.anchor,
                    locale,
                    timeZone,
                    yearIn(group.anchor) !== currentYear
                  )}
          </h3>
          <ul className="divide-y">
            {group.meetings.map((meeting) => (
              <MeetingRow
                accountId={accountId}
                compactAction
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
      ))}
    </>
  );
}
