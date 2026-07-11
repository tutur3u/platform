'use client';

import type { CreateWorkspaceUserGroupSessionPayload } from '@tuturuuu/internal-api';
import dayjs from 'dayjs';
import '@tuturuuu/users-core/lib/dayjs-setup';
import { buildZonedIso, DEFAULT_SCHEDULE_TIMEZONE } from './session-time-utils';

export const QUICK_WEEKLY_DEFAULT_DAYS = [2, 4, 6] as const;
export const QUICK_WEEKLY_PREVIEW_LIMIT = 6;

export interface QuickWeeklyScheduleDraft {
  daysOfWeek: number[];
  endDate: string;
  endTime: string;
  intervalWeeks: number;
  startDate: string;
  startTime: string;
  timezone: string;
  untilDate: string;
}

export interface QuickWeeklySchedulePreviewDate {
  endsAt: string;
  label: string;
  startsAt: string;
}

export interface QuickWeeklySchedulePreview {
  count: number;
  firstDates: QuickWeeklySchedulePreviewDate[];
  offsetLabel: string;
}

export function createQuickWeeklyScheduleDraft(
  now = dayjs().tz(DEFAULT_SCHEDULE_TIMEZONE)
): QuickWeeklyScheduleDraft {
  const start = now.tz(DEFAULT_SCHEDULE_TIMEZONE);

  return {
    daysOfWeek: [...QUICK_WEEKLY_DEFAULT_DAYS],
    endDate: start.format('YYYY-MM-DD'),
    endTime: '20:30',
    intervalWeeks: 1,
    startDate: start.format('YYYY-MM-DD'),
    startTime: '19:00',
    timezone: DEFAULT_SCHEDULE_TIMEZONE,
    untilDate: start.add(12, 'month').format('YYYY-MM-DD'),
  };
}

export function pickerDateFromParts(
  date: string,
  time: string,
  timezone: string
) {
  return dayjs.tz(`${date} ${time}`, 'YYYY-MM-DD HH:mm', timezone).toDate();
}

export function pickerPartsFromDate(value: Date, timezone: string) {
  const zoned = dayjs(value).tz(timezone);
  return {
    date: zoned.format('YYYY-MM-DD'),
    time: zoned.format('HH:mm'),
  };
}

function occurrenceEndDate(date: string, startTime: string, endTime: string) {
  return endTime <= startTime
    ? dayjs(date).add(1, 'day').format('YYYY-MM-DD')
    : date;
}

function isDraftDateIncluded(
  draft: QuickWeeklyScheduleDraft,
  date: dayjs.Dayjs
) {
  if (!draft.daysOfWeek.includes(date.day())) return false;

  const weeksSinceStart = Math.floor(
    date.diff(dayjs(draft.startDate, 'YYYY-MM-DD'), 'day') / 7
  );
  return weeksSinceStart % Math.max(draft.intervalWeeks, 1) === 0;
}

export function buildQuickWeeklySchedulePreview(
  draft: QuickWeeklyScheduleDraft,
  locale: string,
  limit = QUICK_WEEKLY_PREVIEW_LIMIT
): QuickWeeklySchedulePreview {
  const start = dayjs(draft.startDate, 'YYYY-MM-DD', true);
  const until = dayjs(draft.untilDate, 'YYYY-MM-DD', true);
  const offsetLabel = `UTC/GMT ${dayjs
    .tz(
      `${draft.startDate} ${draft.startTime}`,
      'YYYY-MM-DD HH:mm',
      draft.timezone
    )
    .format('Z')}`;

  if (
    !start.isValid() ||
    !until.isValid() ||
    until.isBefore(start, 'day') ||
    draft.daysOfWeek.length === 0
  ) {
    return { count: 0, firstDates: [], offsetLabel };
  }

  let count = 0;
  const firstDates: QuickWeeklySchedulePreviewDate[] = [];

  for (
    let date = start;
    date.isSame(until, 'day') || date.isBefore(until, 'day');
    date = date.add(1, 'day')
  ) {
    if (!isDraftDateIncluded(draft, date)) continue;

    const localDate = date.format('YYYY-MM-DD');
    const startsAt = buildZonedIso(localDate, draft.startTime, draft.timezone);
    const endsAt = buildZonedIso(
      occurrenceEndDate(localDate, draft.startTime, draft.endTime),
      draft.endTime,
      draft.timezone
    );

    count += 1;
    if (firstDates.length < limit) {
      firstDates.push({
        endsAt,
        label: dayjs(startsAt)
          .tz(draft.timezone)
          .locale(locale)
          .format('ddd, MMM D, HH:mm'),
        startsAt,
      });
    }
  }

  return { count, firstDates, offsetLabel };
}

export function buildQuickWeeklySchedulePayload({
  draft,
  groupId,
  groupName,
}: {
  draft: QuickWeeklyScheduleDraft;
  groupId: string;
  groupName?: string | null;
}): CreateWorkspaceUserGroupSessionPayload {
  const startsAt = buildZonedIso(
    draft.startDate,
    draft.startTime,
    draft.timezone
  );
  const endsAt = buildZonedIso(
    occurrenceEndDate(draft.startDate, draft.startTime, draft.endTime),
    draft.endTime,
    draft.timezone
  );

  return {
    endTimezone: draft.timezone,
    endsAt,
    groupId,
    recurrence: {
      daysOfWeek: draft.daysOfWeek,
      intervalWeeks: draft.intervalWeeks,
      untilDate: draft.untilDate || null,
    },
    startTimezone: draft.timezone,
    startsAt,
    title: groupName ?? null,
  };
}
