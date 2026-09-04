'use client';

import type { CreateWorkspaceUserGroupSessionPayload } from '@tuturuuu/internal-api';
import dayjs from 'dayjs';
import '@tuturuuu/users-core/lib/dayjs-setup';
import { buildZonedIso, DEFAULT_SCHEDULE_TIMEZONE } from './session-time-utils';

export const QUICK_WEEKLY_PREVIEW_LIMIT = 6;
const ROLLING_PREVIEW_MONTHS = 12;

export type ScheduleEndMode = 'date' | 'never';

export interface QuickWeeklySchedulePattern {
  daysOfWeek: number[];
  endTime: string;
  id: string;
  startTime: string;
}

export interface QuickWeeklyScheduleDraft {
  endMode: ScheduleEndMode;
  intervalWeeks: number;
  patterns: QuickWeeklySchedulePattern[];
  startDate: string;
  timezone: string;
  untilDate: string;
}

export interface QuickWeeklySchedulePreviewDate {
  endsAt: string;
  label: string;
  patternId: string;
  startsAt: string;
}

export interface QuickWeeklySchedulePreview {
  count: number | null;
  firstDates: QuickWeeklySchedulePreviewDate[];
  offsetLabel: string;
  previewUntilDate: string;
}

export function createQuickWeeklySchedulePattern(
  index: number,
  startTime = '19:00',
  endTime = '20:30'
): QuickWeeklySchedulePattern {
  return {
    daysOfWeek: [],
    endTime,
    id: `timeframe-${index + 1}`,
    startTime,
  };
}

export function createQuickWeeklyScheduleDraft(
  now = dayjs().tz(DEFAULT_SCHEDULE_TIMEZONE)
): QuickWeeklyScheduleDraft {
  const start = now.tz(DEFAULT_SCHEDULE_TIMEZONE);

  return {
    endMode: 'date',
    intervalWeeks: 1,
    patterns: [createQuickWeeklySchedulePattern(0)],
    startDate: start.format('YYYY-MM-DD'),
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

function isPatternDateIncluded(
  draft: QuickWeeklyScheduleDraft,
  pattern: QuickWeeklySchedulePattern,
  date: dayjs.Dayjs
) {
  if (!pattern.daysOfWeek.includes(date.day())) return false;
  const weeksSinceStart = Math.floor(
    date.diff(dayjs(draft.startDate, 'YYYY-MM-DD'), 'day') / 7
  );
  return weeksSinceStart % Math.max(draft.intervalWeeks, 1) === 0;
}

export function isQuickWeeklyScheduleDraftValid(
  draft: QuickWeeklyScheduleDraft
) {
  const start = dayjs(draft.startDate, 'YYYY-MM-DD', true);
  const until = dayjs(draft.untilDate, 'YYYY-MM-DD', true);
  return (
    start.isValid() &&
    draft.intervalWeeks >= 1 &&
    draft.patterns.length > 0 &&
    draft.patterns.every(
      (pattern) =>
        pattern.daysOfWeek.length > 0 &&
        !!pattern.startTime &&
        !!pattern.endTime
    ) &&
    (draft.endMode === 'never' ||
      (until.isValid() && !until.isBefore(start, 'day')))
  );
}

export function buildQuickWeeklySchedulePreview(
  draft: QuickWeeklyScheduleDraft,
  locale: string,
  limit = QUICK_WEEKLY_PREVIEW_LIMIT
): QuickWeeklySchedulePreview {
  const start = dayjs(draft.startDate, 'YYYY-MM-DD', true);
  const finiteUntil = dayjs(draft.untilDate, 'YYYY-MM-DD', true);
  const previewUntil =
    draft.endMode === 'never'
      ? start.add(ROLLING_PREVIEW_MONTHS, 'month')
      : finiteUntil;
  const offsetLabel = `UTC/GMT ${dayjs
    .tz(`${draft.startDate} 12:00`, 'YYYY-MM-DD HH:mm', draft.timezone)
    .format('Z')}`;

  if (!isQuickWeeklyScheduleDraftValid(draft)) {
    return {
      count: draft.endMode === 'never' ? null : 0,
      firstDates: [],
      offsetLabel,
      previewUntilDate: previewUntil.isValid()
        ? previewUntil.format('YYYY-MM-DD')
        : '',
    };
  }

  const generated: QuickWeeklySchedulePreviewDate[] = [];
  for (
    let date = start;
    date.isSame(previewUntil, 'day') || date.isBefore(previewUntil, 'day');
    date = date.add(1, 'day')
  ) {
    const localDate = date.format('YYYY-MM-DD');
    for (const pattern of draft.patterns) {
      if (!isPatternDateIncluded(draft, pattern, date)) continue;
      const startsAt = buildZonedIso(
        localDate,
        pattern.startTime,
        draft.timezone
      );
      generated.push({
        endsAt: buildZonedIso(
          occurrenceEndDate(localDate, pattern.startTime, pattern.endTime),
          pattern.endTime,
          draft.timezone
        ),
        label: dayjs(startsAt)
          .tz(draft.timezone)
          .locale(locale)
          .format('ddd, MMM D, HH:mm'),
        patternId: pattern.id,
        startsAt,
      });
    }
  }

  generated.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return {
    count: draft.endMode === 'never' ? null : generated.length,
    firstDates: generated.slice(0, limit),
    offsetLabel,
    previewUntilDate: previewUntil.format('YYYY-MM-DD'),
  };
}

export function buildQuickWeeklySchedulePayloads({
  draft,
  groupId,
  groupName,
}: {
  draft: QuickWeeklyScheduleDraft;
  groupId: string;
  groupName?: string | null;
}): CreateWorkspaceUserGroupSessionPayload[] {
  return draft.patterns.map((pattern) => ({
    endTimezone: draft.timezone,
    endsAt: buildZonedIso(
      occurrenceEndDate(draft.startDate, pattern.startTime, pattern.endTime),
      pattern.endTime,
      draft.timezone
    ),
    groupId,
    recurrence: {
      daysOfWeek: pattern.daysOfWeek,
      intervalWeeks: draft.intervalWeeks,
      untilDate: draft.endMode === 'never' ? null : draft.untilDate,
    },
    startTimezone: draft.timezone,
    startsAt: buildZonedIso(draft.startDate, pattern.startTime, draft.timezone),
    title: groupName ?? null,
  }));
}
