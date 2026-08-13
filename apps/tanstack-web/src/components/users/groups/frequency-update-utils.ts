'use client';

import type {
  UpdateWorkspaceUserGroupSessionPayload,
  WorkspaceUserGroupSession,
} from '@tuturuuu/internal-api';
import dayjs from 'dayjs';
import '@/lib/dayjs-setup';
import { buildQuickWeeklySchedulePreview } from './quick-weekly-schedule-utils';

const ROLLING_PREVIEW_MONTHS = 12;

export interface FrequencyUpdateDraft {
  daysOfWeek: number[];
  intervalWeeks: number;
}

export interface FrequencySeriesOption {
  firstSession: WorkspaceUserGroupSession;
  id: string;
  sessions: WorkspaceUserGroupSession[];
}

export interface FrequencyPreviewEntry {
  afterLabel?: string;
  beforeLabel?: string;
  date: string;
  label: string;
}

export interface FrequencyUpdatePreview {
  added: FrequencyPreviewEntry[];
  adjusted: FrequencyPreviewEntry[];
  effectiveDate: string;
  kept: FrequencyPreviewEntry[];
  removed: FrequencyPreviewEntry[];
  untilDate: string;
}

export function buildFrequencySeriesOptions(
  sessions: WorkspaceUserGroupSession[],
  now = dayjs()
): FrequencySeriesOption[] {
  const bySeries = new Map<string, WorkspaceUserGroupSession[]>();

  for (const session of sessions) {
    if (
      session.status !== 'scheduled' ||
      !session.seriesId ||
      !session.recurrence ||
      dayjs(session.startsAt).isBefore(now)
    ) {
      continue;
    }
    const current = bySeries.get(session.seriesId) ?? [];
    current.push(session);
    bySeries.set(session.seriesId, current);
  }

  return Array.from(bySeries, ([id, rows]) => {
    const sorted = rows.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return { firstSession: sorted[0]!, id, sessions: sorted };
  }).sort((a, b) =>
    a.firstSession.startsAt.localeCompare(b.firstSession.startsAt)
  );
}

export function createFrequencyUpdateDraft(
  option: FrequencySeriesOption
): FrequencyUpdateDraft {
  return {
    daysOfWeek: [...(option.firstSession.recurrence?.daysOfWeek ?? [])],
    intervalWeeks: option.firstSession.recurrence?.intervalWeeks ?? 1,
  };
}

function localDate(session: WorkspaceUserGroupSession) {
  return (
    session.recurrenceInstanceDate ??
    dayjs(session.startsAt).tz(session.startTimezone).format('YYYY-MM-DD')
  );
}

function formatSession(session: WorkspaceUserGroupSession, locale: string) {
  return dayjs(session.startsAt)
    .tz(session.startTimezone)
    .locale(locale)
    .format('ddd, MMM D, HH:mm');
}

export function buildFrequencyUpdatePreview(
  option: FrequencySeriesOption,
  draft: FrequencyUpdateDraft,
  locale: string,
  now = dayjs()
): FrequencyUpdatePreview {
  const first = option.firstSession;
  const recurrence = first.recurrence!;
  const effectiveDate = localDate(first);
  const untilDate =
    recurrence.untilDate ??
    now.add(ROLLING_PREVIEW_MONTHS, 'month').format('YYYY-MM-DD');
  const start = dayjs(first.startsAt).tz(first.startTimezone);
  const end = dayjs(first.endsAt).tz(first.endTimezone);
  const generated = buildQuickWeeklySchedulePreview(
    {
      daysOfWeek: draft.daysOfWeek,
      endDate: end.format('YYYY-MM-DD'),
      endTime: end.format('HH:mm'),
      intervalWeeks: draft.intervalWeeks,
      startDate: effectiveDate,
      startTime: start.format('HH:mm'),
      timezone: first.startTimezone,
      untilDate,
    },
    locale,
    Number.POSITIVE_INFINITY
  ).firstDates;

  const currentByDate = new Map(
    option.sessions.map((session) => [localDate(session), session])
  );
  const expectedByDate = new Map(
    generated.map((entry) => [
      dayjs(entry.startsAt).tz(first.startTimezone).format('YYYY-MM-DD'),
      entry,
    ])
  );

  const removed = option.sessions
    .filter((session) => !expectedByDate.has(localDate(session)))
    .map((session) => ({
      date: localDate(session),
      label: formatSession(session, locale),
    }));
  const added = generated
    .filter((entry) => {
      const date = dayjs(entry.startsAt)
        .tz(first.startTimezone)
        .format('YYYY-MM-DD');
      return !currentByDate.has(date);
    })
    .map((entry) => ({
      date: dayjs(entry.startsAt).tz(first.startTimezone).format('YYYY-MM-DD'),
      label: entry.label,
    }));
  const adjusted: FrequencyPreviewEntry[] = [];
  const kept: FrequencyPreviewEntry[] = [];

  for (const entry of generated) {
    const date = dayjs(entry.startsAt)
      .tz(first.startTimezone)
      .format('YYYY-MM-DD');
    const current = currentByDate.get(date);
    if (!current) continue;
    if (
      current.startsAt !== entry.startsAt ||
      current.endsAt !== entry.endsAt
    ) {
      adjusted.push({
        afterLabel: entry.label,
        beforeLabel: formatSession(current, locale),
        date,
        label: entry.label,
      });
    } else {
      kept.push({ date, label: entry.label });
    }
  }

  return { added, adjusted, effectiveDate, kept, removed, untilDate };
}

export function buildFrequencyUpdatePayload(
  draft: FrequencyUpdateDraft,
  option: FrequencySeriesOption
): UpdateWorkspaceUserGroupSessionPayload {
  return {
    recurrence: {
      daysOfWeek: draft.daysOfWeek,
      intervalWeeks: draft.intervalWeeks,
      untilDate: option.firstSession.recurrence?.untilDate ?? null,
    },
    scope: 'future',
  };
}
