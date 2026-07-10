import 'server-only';

import type {
  CreateWorkspaceUserGroupSessionPayload,
  ReconcileWorkspaceUserGroupSessionPayload,
  UpdateWorkspaceUserGroupSessionPayload,
  WorkspaceUserGroupMissingSessionOccurrence,
  WorkspaceUserGroupScheduleGroupSummary,
  WorkspaceUserGroupSessionReconciliationMode,
  WorkspaceUserGroupSessionReconciliationPreview,
} from '@tuturuuu/internal-api';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import dayjs from 'dayjs';
import '../dayjs-setup';
import {
  addDays,
  assertGroupInWorkspace,
  DEFAULT_TIMEZONE,
  fetchAllGroups,
  fetchSessionRelations,
  materializeSeries,
  privateClient,
  type SeriesRow,
  type SessionRow,
  serializeSessions,
  syncSessionRelations,
  toIsoDate,
  toTime,
} from './session-schedule-data';
import { summarizeNextFourWeekSchedule } from './session-schedule-summary';

const SCHEDULE_SUMMARY_DAYS = 28;

export async function listUserGroupSessionDates({
  groupId,
  supabase,
  timezone = DEFAULT_TIMEZONE,
  wsId,
}: {
  groupId: string;
  supabase: TypedSupabaseClient;
  timezone?: string;
  wsId: string;
}) {
  const dateMap = await listUserGroupSessionDatesByGroupIds({
    groupIds: [groupId],
    supabase,
    timezone,
    wsId,
  });

  return dateMap.get(groupId) ?? [];
}

export async function listUserGroupSessionDatesByGroupIds({
  groupIds,
  supabase,
  timezone = DEFAULT_TIMEZONE,
  wsId,
}: {
  groupIds: string[];
  supabase: TypedSupabaseClient;
  timezone?: string;
  wsId: string;
}) {
  const uniqueGroupIds = Array.from(new Set(groupIds.filter(Boolean)));
  const result = new Map<string, string[]>(
    uniqueGroupIds.map((groupId) => [groupId, []])
  );

  if (uniqueGroupIds.length === 0) return result;

  const { data, error } = await privateClient(supabase)
    .from('workspace_user_group_sessions')
    .select('group_id, starts_at')
    .eq('ws_id', wsId)
    .in('group_id', uniqueGroupIds)
    .eq('status', 'scheduled')
    .order('starts_at');

  if (error) throw error;

  for (const session of (data ?? []) as Pick<
    SessionRow,
    'group_id' | 'starts_at'
  >[]) {
    const current = result.get(session.group_id) ?? [];
    const date = dayjs(session.starts_at).tz(timezone).format('YYYY-MM-DD');
    if (!current.includes(date)) current.push(date);
    result.set(session.group_id, current);
  }

  return result;
}

export async function listUserGroupSessions({
  from,
  groupId,
  includeMissing = false,
  supabase,
  to,
  wsId,
}: {
  from?: string | null;
  groupId?: string | null;
  includeMissing?: boolean;
  supabase: TypedSupabaseClient;
  to?: string | null;
  wsId: string;
}) {
  const privateDb = privateClient(supabase);
  let query = privateDb
    .from('workspace_user_group_sessions')
    .select('*')
    .eq('ws_id', wsId)
    .eq('status', 'scheduled')
    .order('starts_at');

  if (groupId) query = query.eq('group_id', groupId);
  if (from) query = query.gte('starts_at', from);
  if (to) query = query.lte('starts_at', to);

  const missing = includeMissing
    ? await listMissingUserGroupSessionOccurrences({
        from,
        groupId,
        supabase,
        to,
        wsId,
      })
    : undefined;

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as SessionRow[];
  const [sessions, groups, relationData] = await Promise.all([
    serializeSessions(supabase, wsId, rows),
    fetchAllGroups(supabase, wsId),
    fetchSessionRelations(
      privateDb,
      wsId,
      rows.map((row) => row.id)
    ),
  ]);

  return {
    data: sessions,
    groups,
    ...(includeMissing ? { missing: missing ?? [] } : {}),
    tags: relationData.tags,
  };
}

export async function listUserGroupScheduleGroupSummaries({
  from,
  groupIds,
  supabase,
  timezone = DEFAULT_TIMEZONE,
  wsId,
}: {
  from: string;
  groupIds: string[];
  supabase: TypedSupabaseClient;
  timezone?: string;
  wsId: string;
}): Promise<WorkspaceUserGroupScheduleGroupSummary[]> {
  const uniqueGroupIds = Array.from(new Set(groupIds.filter(Boolean)));
  if (uniqueGroupIds.length === 0) return [];

  const { data: groups, error: groupsError } = await supabase
    .from('workspace_user_groups')
    .select('id')
    .eq('ws_id', wsId)
    .in('id', uniqueGroupIds);

  if (groupsError) throw groupsError;

  const validGroupIds = new Set(
    ((groups ?? []) as Array<{ id: string | null }>)
      .map((group) => group.id)
      .filter((id): id is string => Boolean(id))
  );

  if (validGroupIds.size === 0) return [];

  const orderedGroupIds = uniqueGroupIds.filter((groupId) =>
    validGroupIds.has(groupId)
  );
  const privateDb = privateClient(supabase);
  const rangeStart = dayjs(from).tz(timezone).startOf('day');
  const rangeEnd = rangeStart.add(SCHEDULE_SUMMARY_DAYS, 'day');

  const [membershipResult, sessionsResult] = await Promise.all([
    supabase
      .from('workspace_user_groups_users')
      .select(
        'group_id, role, user:workspace_users!workspace_user_roles_users_user_id_fkey!inner(id, ws_id)'
      )
      .in('group_id', orderedGroupIds)
      .eq('user.ws_id', wsId),
    privateDb
      .from('workspace_user_group_sessions')
      .select('group_id, starts_at, ends_at')
      .eq('ws_id', wsId)
      .eq('status', 'scheduled')
      .in('group_id', orderedGroupIds)
      .gte('starts_at', rangeStart.toISOString())
      .lt('starts_at', rangeEnd.toISOString())
      .order('starts_at'),
  ]);

  if (membershipResult.error) throw membershipResult.error;
  if (sessionsResult.error) throw sessionsResult.error;

  const countsByGroup = new Map<
    string,
    { managerCount: number; nonManagerCount: number }
  >();
  for (const groupId of orderedGroupIds) {
    countsByGroup.set(groupId, { managerCount: 0, nonManagerCount: 0 });
  }

  for (const row of (membershipResult.data ?? []) as Array<{
    group_id: string | null;
    role: string | null;
  }>) {
    if (!row.group_id || !validGroupIds.has(row.group_id)) continue;
    const counts = countsByGroup.get(row.group_id) ?? {
      managerCount: 0,
      nonManagerCount: 0,
    };
    if (row.role === 'TEACHER') counts.managerCount += 1;
    else counts.nonManagerCount += 1;
    countsByGroup.set(row.group_id, counts);
  }

  const sessionsByGroup = new Map<
    string,
    Array<{ endsAt: string; groupId: string; startsAt: string }>
  >();
  for (const row of (sessionsResult.data ?? []) as Array<{
    ends_at: string;
    group_id: string;
    starts_at: string;
  }>) {
    const list = sessionsByGroup.get(row.group_id) ?? [];
    list.push({
      endsAt: row.ends_at,
      groupId: row.group_id,
      startsAt: row.starts_at,
    });
    sessionsByGroup.set(row.group_id, list);
  }

  return orderedGroupIds.map((groupId) => {
    const schedule = summarizeNextFourWeekSchedule({
      from,
      occurrences: sessionsByGroup.get(groupId) ?? [],
      timezone,
    });
    const counts = countsByGroup.get(groupId) ?? {
      managerCount: 0,
      nonManagerCount: 0,
    };

    return {
      exceptionCount: schedule.exceptionCount,
      groupId,
      managerCount: counts.managerCount,
      nonManagerCount: counts.nonManagerCount,
      patterns: schedule.patterns,
      upcomingCount: schedule.upcomingCount,
    };
  });
}

function normalizeDbTime(value: string) {
  return value.length === 5 ? `${value}:00` : value;
}

function compareIsoDate(a: string, b: string) {
  return a.localeCompare(b);
}

function addDate(date: string, days: number) {
  return dayjs(date).add(days, 'day').format('YYYY-MM-DD');
}

function buildSeriesTimestamp(date: string, time: string, timezone: string) {
  return dayjs
    .tz(`${date} ${normalizeDbTime(time)}`, 'YYYY-MM-DD HH:mm:ss', timezone)
    .toISOString();
}

function seriesDateBounds(
  series: SeriesRow,
  from: string | null | undefined,
  to: string | null | undefined
) {
  if (!from || !to) return null;

  const rangeStart = dayjs(from)
    .tz(series.start_timezone || DEFAULT_TIMEZONE)
    .format('YYYY-MM-DD');
  const rangeEnd = dayjs(to)
    .tz(series.start_timezone || DEFAULT_TIMEZONE)
    .format('YYYY-MM-DD');
  const start =
    compareIsoDate(rangeStart, series.start_date) > 0
      ? rangeStart
      : series.start_date;
  const end =
    series.until_date && compareIsoDate(series.until_date, rangeEnd) < 0
      ? series.until_date
      : rangeEnd;

  if (compareIsoDate(start, end) > 0) return null;

  return { end, start };
}

function isSeriesDateInActiveInterval(series: SeriesRow, date: string) {
  if (compareIsoDate(date, series.start_date) < 0) return false;
  if (series.until_date && compareIsoDate(date, series.until_date) > 0) {
    return false;
  }

  const daysSinceStart = dayjs(date).diff(dayjs(series.start_date), 'day');
  if (daysSinceStart < 0) return false;

  const weeksSinceStart = Math.floor(daysSinceStart / 7);
  return weeksSinceStart % Math.max(series.interval_weeks, 1) === 0;
}

function isExpectedSeriesDate(series: SeriesRow, date: string) {
  if (!isSeriesDateInActiveInterval(series, date)) return false;

  const day = dayjs(date).day();
  return series.days_of_week.includes(day);
}

function buildMissingOccurrence(
  series: SeriesRow,
  groupName: string | null,
  date: string
): WorkspaceUserGroupMissingSessionOccurrence {
  const startsAt = buildSeriesTimestamp(
    date,
    series.start_time,
    series.start_timezone
  );
  const endDate =
    normalizeDbTime(series.end_time) <= normalizeDbTime(series.start_time)
      ? addDate(date, 1)
      : date;

  return {
    date,
    description: series.description,
    descriptionJson: series.description_json,
    endTimezone: series.end_timezone,
    endsAt: buildSeriesTimestamp(endDate, series.end_time, series.end_timezone),
    groupId: series.group_id,
    groupName,
    seriesId: series.id,
    startTimezone: series.start_timezone,
    startsAt,
    title: series.title,
  };
}

function detachedOccurrenceKey({
  endsAt,
  groupId,
  startsAt,
}: {
  endsAt: string;
  groupId: string;
  startsAt: string;
}) {
  return `${groupId}:${startsAt}:${endsAt}`;
}

type ReconciliationCandidateRow = Pick<
  SessionRow,
  | 'ends_at'
  | 'group_id'
  | 'id'
  | 'recurrence_instance_date'
  | 'series_id'
  | 'end_timezone'
  | 'start_timezone'
  | 'starts_at'
  | 'title'
>;

type DetachedSessionSeriesRepairCandidate = {
  date: string;
  mode: WorkspaceUserGroupSessionRepairMode;
  occurrence: WorkspaceUserGroupMissingSessionOccurrence;
  series: SeriesRow;
};

type WorkspaceUserGroupSessionRepairMode = Exclude<
  WorkspaceUserGroupSessionReconciliationMode,
  'convert_weekly'
>;

function localSlotKeyForSeriesDate(series: SeriesRow, date: string) {
  const endDate =
    normalizeDbTime(series.end_time) <= normalizeDbTime(series.start_time)
      ? addDate(date, 1)
      : date;

  return [
    series.group_id,
    series.start_timezone,
    `${date} ${normalizeDbTime(series.start_time)}`,
    series.end_timezone,
    `${endDate} ${normalizeDbTime(series.end_time)}`,
  ].join(':');
}

function localSlotKeyForSession(
  row: ReconciliationCandidateRow,
  series: SeriesRow
) {
  return [
    row.group_id,
    series.start_timezone,
    dayjs(row.starts_at)
      .tz(series.start_timezone)
      .format('YYYY-MM-DD HH:mm:ss'),
    series.end_timezone,
    dayjs(row.ends_at).tz(series.end_timezone).format('YYYY-MM-DD HH:mm:ss'),
  ].join(':');
}

function isAlignedSeriesInstance(
  row: ReconciliationCandidateRow,
  series: SeriesRow
) {
  return (
    row.series_id === series.id &&
    !!row.recurrence_instance_date &&
    localSlotKeyForSession(row, series) ===
      localSlotKeyForSeriesDate(series, row.recurrence_instance_date)
  );
}

function isCandidateForSeriesOccurrence({
  date,
  occurrence,
  row,
  series,
}: {
  date: string;
  occurrence: WorkspaceUserGroupMissingSessionOccurrence;
  row: ReconciliationCandidateRow;
  series: SeriesRow;
}) {
  if (row.group_id !== series.group_id) return false;
  if (row.start_timezone !== series.start_timezone) return false;
  if (row.end_timezone !== series.end_timezone) return false;
  if (row.series_id && row.series_id !== series.id) return false;
  if (row.series_id === series.id && row.recurrence_instance_date === date) {
    return false;
  }

  const exactSlot =
    detachedOccurrenceKey({
      endsAt: row.ends_at,
      groupId: row.group_id,
      startsAt: row.starts_at,
    }) ===
    detachedOccurrenceKey({
      endsAt: occurrence.endsAt,
      groupId: occurrence.groupId,
      startsAt: occurrence.startsAt,
    });

  return (
    exactSlot ||
    localSlotKeyForSession(row, series) ===
      localSlotKeyForSeriesDate(series, date)
  );
}

function isSnapCandidateForSeriesOccurrence({
  date,
  row,
  series,
}: {
  date: string;
  row: ReconciliationCandidateRow;
  series: SeriesRow;
}) {
  if (row.group_id !== series.group_id) return false;
  if (row.start_timezone !== series.start_timezone) return false;
  if (row.end_timezone !== series.end_timezone) return false;
  if (row.series_id && row.series_id !== series.id) return false;
  if (row.series_id === series.id && row.recurrence_instance_date === date) {
    return false;
  }

  return (
    dayjs(row.starts_at).tz(series.start_timezone).format('YYYY-MM-DD') === date
  );
}

function isWeeklyPatternRepairCandidate({
  date,
  row,
  series,
}: {
  date: string;
  row: ReconciliationCandidateRow;
  series: SeriesRow;
}) {
  if (!isSeriesDateInActiveInterval(series, date)) return false;
  if (series.days_of_week.includes(dayjs(date).day())) return false;
  if (row.group_id !== series.group_id) return false;
  if (row.start_timezone !== series.start_timezone) return false;
  if (row.end_timezone !== series.end_timezone) return false;
  if (row.series_id && row.series_id !== series.id) return false;
  if (row.series_id === series.id && row.recurrence_instance_date === date) {
    return false;
  }

  return (
    localSlotKeyForSession(row, series) ===
    localSlotKeyForSeriesDate(series, date)
  );
}

export function findDetachedSessionSeriesRepairCandidate({
  mode = 'weekly',
  row,
  seriesRows,
}: {
  mode?: WorkspaceUserGroupSessionRepairMode;
  row: ReconciliationCandidateRow;
  seriesRows: SeriesRow[];
}): DetachedSessionSeriesRepairCandidate | null {
  const exactMatches = seriesRows
    .map((series): DetachedSessionSeriesRepairCandidate | null => {
      const date = dayjs(row.starts_at)
        .tz(series.start_timezone || DEFAULT_TIMEZONE)
        .format('YYYY-MM-DD');
      if (!isExpectedSeriesDate(series, date)) return null;

      const occurrence = buildMissingOccurrence(series, null, date);
      return isCandidateForSeriesOccurrence({
        date,
        occurrence,
        row,
        series,
      })
        ? { date, mode: 'exact' as const, occurrence, series }
        : null;
    })
    .filter((match): match is DetachedSessionSeriesRepairCandidate => !!match);

  if (exactMatches.length > 1) {
    throw new Error('ambiguous_series_reconciliation');
  }
  if (exactMatches.length === 1 || mode === 'exact') {
    return exactMatches[0] ?? null;
  }

  const snapMatches = seriesRows
    .map((series): DetachedSessionSeriesRepairCandidate | null => {
      const date = dayjs(row.starts_at)
        .tz(series.start_timezone || DEFAULT_TIMEZONE)
        .format('YYYY-MM-DD');
      if (!isExpectedSeriesDate(series, date)) return null;

      const occurrence = buildMissingOccurrence(series, null, date);
      return isSnapCandidateForSeriesOccurrence({
        date,
        row,
        series,
      })
        ? { date, mode: 'snap' as const, occurrence, series }
        : null;
    })
    .filter((match): match is DetachedSessionSeriesRepairCandidate => !!match);

  if (snapMatches.length > 1) {
    throw new Error('ambiguous_series_reconciliation');
  }
  if (snapMatches.length === 1 || mode === 'snap') {
    return snapMatches[0] ?? null;
  }

  const weeklyMatches = seriesRows
    .map((series): DetachedSessionSeriesRepairCandidate | null => {
      const date = dayjs(row.starts_at)
        .tz(series.start_timezone || DEFAULT_TIMEZONE)
        .format('YYYY-MM-DD');
      const occurrence = buildMissingOccurrence(series, null, date);

      return isWeeklyPatternRepairCandidate({
        date,
        row,
        series,
      })
        ? { date, mode: 'weekly' as const, occurrence, series }
        : null;
    })
    .filter((match): match is DetachedSessionSeriesRepairCandidate => !!match);

  if (weeklyMatches.length === 0) return null;
  if (weeklyMatches.length > 1) {
    throw new Error('ambiguous_series_reconciliation');
  }

  return weeklyMatches[0] ?? null;
}

function pickSeriesOccurrenceReconciliationCandidate({
  candidates,
  date,
  occurrence,
  series,
  usedIds = new Set<string>(),
}: {
  candidates: ReconciliationCandidateRow[];
  date: string;
  occurrence: WorkspaceUserGroupMissingSessionOccurrence;
  series: SeriesRow;
  usedIds?: Set<string>;
}) {
  return candidates
    .filter(
      (row) =>
        !usedIds.has(row.id) &&
        isCandidateForSeriesOccurrence({ date, occurrence, row, series })
    )
    .sort((a, b) => {
      const aSeriesScore = a.series_id === series.id ? 0 : 1;
      const bSeriesScore = b.series_id === series.id ? 0 : 1;
      if (aSeriesScore !== bSeriesScore) return aSeriesScore - bSeriesScore;
      return a.starts_at.localeCompare(b.starts_at);
    })[0];
}

async function reconcileScheduledSeriesOccurrence({
  blockAlignedOccupant = false,
  date,
  occurrence,
  privateDb,
  row,
  series,
  wsId,
}: {
  blockAlignedOccupant?: boolean;
  date: string;
  occurrence?: WorkspaceUserGroupMissingSessionOccurrence;
  privateDb: ReturnType<typeof privateClient>;
  row: Pick<SessionRow, 'id'>;
  series: SeriesRow;
  wsId: string;
}) {
  const occupying = await fetchSeriesInstance(privateDb, wsId, series.id, date);
  if (occupying && occupying.id !== row.id) {
    if (isAlignedSeriesInstance(occupying, series)) {
      if (blockAlignedOccupant) {
        throw new Error('series_occurrence_already_exists');
      }
      return occupying;
    }
    await clearStaleSeriesInstanceDate(privateDb, wsId, occupying.id);
  }

  const { data, error } = await privateDb
    .from('workspace_user_group_sessions')
    .update({
      ...(occurrence
        ? {
            end_timezone: occurrence.endTimezone,
            ends_at: occurrence.endsAt,
            start_timezone: occurrence.startTimezone,
            starts_at: occurrence.startsAt,
          }
        : {}),
      recurrence_instance_date: date,
      series_id: series.id,
      source: 'series_reconciled',
    })
    .eq('ws_id', wsId)
    .eq('id', row.id)
    .select('*')
    .maybeSingle();

  if (error) {
    if (blockAlignedOccupant && (error as { code?: string }).code === '23505') {
      throw new Error('series_occurrence_already_exists');
    }
    if ((error as { code?: string }).code === '23505') {
      return fetchSeriesInstance(privateDb, wsId, series.id, date);
    }
    throw error;
  }

  return (
    (data as SessionRow | null) ??
    (await fetchSeriesInstance(privateDb, wsId, series.id, date))
  );
}

async function findSeriesOccurrenceReconciliationCandidate({
  privateDb,
  occurrence,
  series,
  wsId,
}: {
  privateDb: ReturnType<typeof privateClient>;
  occurrence: WorkspaceUserGroupMissingSessionOccurrence;
  series: SeriesRow;
  wsId: string;
}) {
  const windowStart = dayjs(occurrence.startsAt)
    .subtract(1, 'day')
    .toISOString();
  const windowEnd = dayjs(occurrence.endsAt).add(1, 'day').toISOString();
  const { data, error } = await privateDb
    .from('workspace_user_group_sessions')
    .select(
      'id, group_id, series_id, recurrence_instance_date, start_timezone, end_timezone, starts_at, ends_at, title'
    )
    .eq('ws_id', wsId)
    .eq('group_id', series.group_id)
    .eq('status', 'scheduled')
    .gte('starts_at', windowStart)
    .lte('starts_at', windowEnd);

  if (error) throw error;

  return pickSeriesOccurrenceReconciliationCandidate({
    candidates: (data ?? []) as ReconciliationCandidateRow[],
    date: occurrence.date,
    occurrence,
    series,
  });
}

export async function listMissingUserGroupSessionOccurrences({
  from,
  groupId,
  supabase,
  to,
  wsId,
}: {
  from?: string | null;
  groupId?: string | null;
  supabase: TypedSupabaseClient;
  to?: string | null;
  wsId: string;
}) {
  if (!from || !to) return [];

  const privateDb = privateClient(supabase);
  let seriesQuery = privateDb
    .from('workspace_user_group_session_series')
    .select('*')
    .eq('ws_id', wsId)
    .order('start_date');

  if (groupId) seriesQuery = seriesQuery.eq('group_id', groupId);

  const { data: seriesData, error: seriesError } = await seriesQuery;
  if (seriesError) throw seriesError;

  const seriesRows = (seriesData ?? []) as SeriesRow[];
  if (seriesRows.length === 0) return [];

  const seriesIds = seriesRows.map((series) => series.id);
  const groupIds = Array.from(
    new Set(seriesRows.map((series) => series.group_id))
  );
  const fromDate = dayjs(from).subtract(2, 'day').format('YYYY-MM-DD');
  const toDate = dayjs(to).add(2, 'day').format('YYYY-MM-DD');
  const [
    { data: recurrenceData, error: recurrenceError },
    { data: scheduledData, error: scheduledError },
    groupMap,
  ] = await Promise.all([
    privateDb
      .from('workspace_user_group_sessions')
      .select(
        'id, group_id, series_id, recurrence_instance_date, start_timezone, end_timezone, starts_at, ends_at, title'
      )
      .eq('ws_id', wsId)
      .eq('status', 'scheduled')
      .in('series_id', seriesIds)
      .gte('recurrence_instance_date', fromDate)
      .lte('recurrence_instance_date', toDate),
    privateDb
      .from('workspace_user_group_sessions')
      .select(
        'id, group_id, series_id, recurrence_instance_date, start_timezone, end_timezone, starts_at, ends_at, title'
      )
      .eq('ws_id', wsId)
      .eq('status', 'scheduled')
      .in('group_id', groupIds)
      .gte('starts_at', from)
      .lte('starts_at', to),
    fetchAllGroups(supabase, wsId).then(
      (groups) => new Map(groups.map((group) => [group.id, group]))
    ),
  ]);

  if (recurrenceError) throw recurrenceError;
  if (scheduledError) throw scheduledError;

  const seriesById = new Map(seriesRows.map((series) => [series.id, series]));
  const existingKeys = new Set<string>();
  for (const row of (recurrenceData ?? []) as ReconciliationCandidateRow[]) {
    if (!row.series_id || !row.recurrence_instance_date) continue;

    const series = seriesById.get(row.series_id);
    if (!series || !isAlignedSeriesInstance(row, series)) continue;

    existingKeys.add(`${row.series_id}:${row.recurrence_instance_date}`);
  }

  const reconciliationCandidates = (scheduledData ??
    []) as ReconciliationCandidateRow[];
  const usedReconciliationIds = new Set<string>();
  const missing: WorkspaceUserGroupMissingSessionOccurrence[] = [];

  for (const series of seriesRows) {
    const bounds = seriesDateBounds(series, from, to);
    if (!bounds) continue;

    for (
      let date = bounds.start;
      compareIsoDate(date, bounds.end) <= 0;
      date = addDate(date, 1)
    ) {
      if (!isExpectedSeriesDate(series, date)) continue;
      if (existingKeys.has(`${series.id}:${date}`)) continue;
      const occurrence = buildMissingOccurrence(
        series,
        groupMap.get(series.group_id)?.name ?? null,
        date
      );
      const reconciliationCandidate =
        pickSeriesOccurrenceReconciliationCandidate({
          candidates: reconciliationCandidates,
          date,
          occurrence,
          series,
          usedIds: usedReconciliationIds,
        });

      if (reconciliationCandidate) {
        const reconciled = await reconcileScheduledSeriesOccurrence({
          date,
          privateDb,
          row: reconciliationCandidate,
          series,
          wsId,
        });

        if (reconciled) {
          existingKeys.add(`${series.id}:${date}`);
          usedReconciliationIds.add(reconciliationCandidate.id);
          continue;
        }
      }

      missing.push(occurrence);
    }
  }

  return missing.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export async function createUserGroupSession({
  payload,
  supabase,
  wsId,
}: {
  payload: CreateWorkspaceUserGroupSessionPayload;
  supabase: TypedSupabaseClient;
  wsId: string;
}) {
  const groupExists = await assertGroupInWorkspace(
    supabase,
    wsId,
    payload.groupId
  );
  if (!groupExists) return null;

  const privateDb = privateClient(supabase);

  if (payload.recurrence) {
    const startTimezone = payload.startTimezone || DEFAULT_TIMEZONE;
    const endTimezone = payload.endTimezone || startTimezone;
    const startDate = toIsoDate(payload.startsAt, startTimezone);

    const { data: seriesData, error: seriesError } = await privateDb
      .from('workspace_user_group_session_series')
      .insert({
        days_of_week: payload.recurrence.daysOfWeek,
        description: payload.description ?? null,
        description_json: payload.descriptionJson ?? null,
        end_time: toTime(payload.endsAt, endTimezone),
        end_timezone: endTimezone,
        group_id: payload.groupId,
        interval_weeks: payload.recurrence.intervalWeeks ?? 1,
        source: 'admin',
        start_date: startDate,
        start_time: toTime(payload.startsAt, startTimezone),
        start_timezone: startTimezone,
        title: payload.title ?? null,
        until_date: payload.recurrence.untilDate ?? null,
        ws_id: wsId,
      })
      .select('*')
      .single();

    if (seriesError) throw seriesError;
    const series = seriesData as SeriesRow;

    await materializeSeries(privateDb, series.id, series.until_date);

    const { data, error } = await privateDb
      .from('workspace_user_group_sessions')
      .select('*')
      .eq('series_id', series.id)
      .order('starts_at');
    if (error) throw error;

    const rows = (data ?? []) as SessionRow[];
    await Promise.all(
      rows.map((row) =>
        syncSessionRelations(privateDb, wsId, row.id, {
          files: payload.files,
          tagIds: payload.tagIds,
          tagNames: payload.tagNames,
        })
      )
    );

    return serializeSessions(supabase, wsId, rows);
  }

  const { data, error } = await privateDb
    .from('workspace_user_group_sessions')
    .insert({
      description: payload.description ?? null,
      description_json: payload.descriptionJson ?? null,
      end_timezone: payload.endTimezone,
      ends_at: payload.endsAt,
      group_id: payload.groupId,
      source: 'admin',
      start_timezone: payload.startTimezone,
      starts_at: payload.startsAt,
      title: payload.title ?? null,
      ws_id: wsId,
    })
    .select('*')
    .single();

  if (error) throw error;

  const row = data as SessionRow;
  await syncSessionRelations(privateDb, wsId, row.id, {
    files: payload.files,
    tagIds: payload.tagIds,
    tagNames: payload.tagNames,
  });

  const [serialized] = await serializeSessions(supabase, wsId, [row]);
  return serialized ?? null;
}

async function fetchSessionById(
  wsId: string,
  sessionId: string,
  supabase: TypedSupabaseClient
) {
  const { data, error } = await privateClient(supabase)
    .from('workspace_user_group_sessions')
    .select('*')
    .eq('ws_id', wsId)
    .eq('id', sessionId)
    .maybeSingle();

  if (error) throw error;
  return data as SessionRow | null;
}

async function fetchSeriesInstance(
  privateDb: ReturnType<typeof privateClient>,
  wsId: string,
  seriesId: string,
  date: string
) {
  const { data, error } = await privateDb
    .from('workspace_user_group_sessions')
    .select('*')
    .eq('ws_id', wsId)
    .eq('series_id', seriesId)
    .eq('recurrence_instance_date', date)
    .maybeSingle();

  if (error) throw error;
  return data as SessionRow | null;
}

async function clearStaleSeriesInstanceDate(
  privateDb: ReturnType<typeof privateClient>,
  wsId: string,
  sessionId: string
) {
  const { error } = await privateDb
    .from('workspace_user_group_sessions')
    .update({
      recurrence_instance_date: null,
      source: 'series_reconciliation_pending',
    })
    .eq('ws_id', wsId)
    .eq('id', sessionId);

  if (error) throw error;
}

async function restoreSeriesInstance(
  privateDb: ReturnType<typeof privateClient>,
  wsId: string,
  row: SessionRow
) {
  if (row.status === 'scheduled') return row;

  const { data, error } = await privateDb
    .from('workspace_user_group_sessions')
    .update({ status: 'scheduled' })
    .eq('ws_id', wsId)
    .eq('id', row.id)
    .select('*')
    .single();

  if (error) throw error;
  return data as SessionRow;
}

async function findNearestSeriesSibling(
  privateDb: ReturnType<typeof privateClient>,
  wsId: string,
  seriesId: string,
  startsAt: string,
  excludeSessionId: string
) {
  const [previous, next] = await Promise.all([
    privateDb
      .from('workspace_user_group_sessions')
      .select('*')
      .eq('ws_id', wsId)
      .eq('series_id', seriesId)
      .eq('status', 'scheduled')
      .lt('starts_at', startsAt)
      .neq('id', excludeSessionId)
      .order('starts_at', { ascending: false })
      .limit(1),
    privateDb
      .from('workspace_user_group_sessions')
      .select('*')
      .eq('ws_id', wsId)
      .eq('series_id', seriesId)
      .eq('status', 'scheduled')
      .gt('starts_at', startsAt)
      .neq('id', excludeSessionId)
      .order('starts_at', { ascending: true })
      .limit(1),
  ]);

  if (previous.error) throw previous.error;
  if (next.error) throw next.error;

  const candidates = [
    ...((previous.data ?? []) as SessionRow[]),
    ...((next.data ?? []) as SessionRow[]),
  ];

  return (
    candidates.sort(
      (a, b) =>
        Math.abs(dayjs(a.starts_at).diff(startsAt, 'minute')) -
        Math.abs(dayjs(b.starts_at).diff(startsAt, 'minute'))
    )[0] ?? null
  );
}

async function copyNearestSeriesRelations({
  privateDb,
  row,
  seriesId,
  wsId,
}: {
  privateDb: ReturnType<typeof privateClient>;
  row: SessionRow;
  seriesId: string;
  wsId: string;
}) {
  const sibling = await findNearestSeriesSibling(
    privateDb,
    wsId,
    seriesId,
    row.starts_at,
    row.id
  );
  if (!sibling) return;

  const relations = await fetchSessionRelations(privateDb, wsId, [sibling.id]);
  await syncSessionRelations(privateDb, wsId, row.id, {
    files:
      relations.filesBySession.get(sibling.id)?.map((file) => ({
        name: file.name,
        storagePath: file.storagePath,
      })) ?? [],
    tagIds: relations.tagsBySession.get(sibling.id)?.map((tag) => tag.id) ?? [],
  });
}

export async function repairUserGroupSessionOccurrence({
  date,
  groupId,
  seriesId,
  supabase,
  wsId,
}: {
  date: string;
  groupId: string;
  seriesId: string;
  supabase: TypedSupabaseClient;
  wsId: string;
}) {
  const privateDb = privateClient(supabase);
  const { data: seriesData, error: seriesError } = await privateDb
    .from('workspace_user_group_session_series')
    .select('*')
    .eq('ws_id', wsId)
    .eq('group_id', groupId)
    .eq('id', seriesId)
    .maybeSingle();

  if (seriesError) throw seriesError;
  const series = seriesData as SeriesRow | null;
  if (!series) return null;
  if (!isExpectedSeriesDate(series, date)) {
    throw new Error('not_expected_series_date');
  }

  const existing = await fetchSeriesInstance(privateDb, wsId, seriesId, date);
  if (existing) {
    if (isAlignedSeriesInstance(existing, series)) {
      const restored = await restoreSeriesInstance(privateDb, wsId, existing);
      const [serialized] = await serializeSessions(supabase, wsId, [restored]);
      return serialized ?? null;
    }

    await clearStaleSeriesInstanceDate(privateDb, wsId, existing.id);
  }

  const occurrence = buildMissingOccurrence(series, null, date);
  const reconciliationCandidate =
    await findSeriesOccurrenceReconciliationCandidate({
      privateDb,
      occurrence,
      series,
      wsId,
    });

  if (reconciliationCandidate) {
    const reconciled = await reconcileScheduledSeriesOccurrence({
      date,
      privateDb,
      row: reconciliationCandidate,
      series,
      wsId,
    });

    if (reconciled) {
      const [serialized] = await serializeSessions(supabase, wsId, [
        reconciled,
      ]);
      return serialized ?? null;
    }
  }

  const { data, error } = await privateDb
    .from('workspace_user_group_sessions')
    .insert({
      description: series.description,
      description_json: series.description_json,
      end_timezone: series.end_timezone,
      ends_at: occurrence.endsAt,
      group_id: series.group_id,
      recurrence_instance_date: date,
      series_id: series.id,
      source: series.source ?? 'series_repair',
      start_timezone: series.start_timezone,
      starts_at: occurrence.startsAt,
      status: 'scheduled',
      title: series.title,
      ws_id: wsId,
    })
    .select('*')
    .single();

  if (error) {
    if ((error as { code?: string }).code !== '23505') throw error;
    const raced = await fetchSeriesInstance(privateDb, wsId, seriesId, date);
    if (!raced) throw error;
    const restored = await restoreSeriesInstance(privateDb, wsId, raced);
    const [serialized] = await serializeSessions(supabase, wsId, [restored]);
    return serialized ?? null;
  }

  const row = data as SessionRow;
  await copyNearestSeriesRelations({
    privateDb,
    row,
    seriesId: series.id,
    wsId,
  });

  const [serialized] = await serializeSessions(supabase, wsId, [row]);
  return serialized ?? null;
}

type DetachedSessionSeriesMatch = {
  current: SessionRow;
  date: string;
  mode: WorkspaceUserGroupSessionRepairMode;
  occurrence: WorkspaceUserGroupMissingSessionOccurrence;
  privateDb: ReturnType<typeof privateClient>;
  series: SeriesRow;
};

async function findDetachedSessionSeriesMatch({
  mode = 'weekly',
  sessionId,
  supabase,
  wsId,
}: {
  mode?: WorkspaceUserGroupSessionRepairMode;
  sessionId: string;
  supabase: TypedSupabaseClient;
  wsId: string;
}): Promise<DetachedSessionSeriesMatch | null> {
  const privateDb = privateClient(supabase);
  const current = await fetchSessionById(wsId, sessionId, supabase);
  if (current?.status !== 'scheduled') return null;

  const { data: seriesData, error: seriesError } = await privateDb
    .from('workspace_user_group_session_series')
    .select('*')
    .eq('ws_id', wsId)
    .eq('group_id', current.group_id);

  if (seriesError) throw seriesError;

  const match = findDetachedSessionSeriesRepairCandidate({
    mode,
    row: current,
    seriesRows: (seriesData ?? []) as SeriesRow[],
  });
  if (!match) return null;

  const occupying = await fetchSeriesInstance(
    privateDb,
    wsId,
    match.series.id,
    match.date
  );
  if (
    occupying &&
    occupying.id !== current.id &&
    isAlignedSeriesInstance(occupying, match.series)
  ) {
    throw new Error('series_occurrence_already_exists');
  }

  return {
    current,
    date: match.date,
    mode: match.mode,
    occurrence: match.occurrence,
    privateDb,
    series: match.series,
  };
}

async function ensureSeriesIncludesWeekday({
  date,
  privateDb,
  series,
  wsId,
}: {
  date: string;
  privateDb: ReturnType<typeof privateClient>;
  series: SeriesRow;
  wsId: string;
}) {
  const weekday = dayjs(date).day();
  if (series.days_of_week.includes(weekday)) return series;

  const daysOfWeek = Array.from(
    new Set([...series.days_of_week, weekday])
  ).sort((a, b) => a - b);

  const { data, error } = await privateDb
    .from('workspace_user_group_session_series')
    .update({ days_of_week: daysOfWeek })
    .eq('ws_id', wsId)
    .eq('id', series.id)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return (data as SeriesRow | null) ?? { ...series, days_of_week: daysOfWeek };
}

export async function previewDetachedUserGroupSessionReconciliation({
  sessionId,
  supabase,
  wsId,
}: {
  sessionId: string;
  supabase: TypedSupabaseClient;
  wsId: string;
}): Promise<WorkspaceUserGroupSessionReconciliationPreview | null> {
  const match = await findDetachedSessionSeriesMatch({
    sessionId,
    supabase,
    wsId,
  });
  if (!match) return null;

  const [session] = await serializeSessions(supabase, wsId, [match.current]);
  if (!session) return null;

  return {
    date: match.date,
    mode: match.mode,
    occurrence: {
      ...match.occurrence,
      groupName: session.groupName,
      title: session.groupName ?? match.occurrence.title,
    },
    seriesId: match.series.id,
    session,
  };
}

async function convertDetachedUserGroupSessionToWeeklySeries({
  sessionId,
  supabase,
  wsId,
}: {
  sessionId: string;
  supabase: TypedSupabaseClient;
  wsId: string;
}) {
  const privateDb = privateClient(supabase);
  const current = await fetchSessionById(wsId, sessionId, supabase);
  if (current?.status !== 'scheduled') return null;

  if (current.series_id && current.recurrence_instance_date) {
    const [serialized] = await serializeSessions(supabase, wsId, [current]);
    return serialized ?? null;
  }

  const startTimezone = current.start_timezone || DEFAULT_TIMEZONE;
  const endTimezone = current.end_timezone || startTimezone;
  const startDate = toIsoDate(current.starts_at, startTimezone);
  const weekday = dayjs(current.starts_at).tz(startTimezone).day();
  const relations = await fetchSessionRelations(privateDb, wsId, [current.id]);
  const relationPayload = {
    files:
      relations.filesBySession.get(current.id)?.map((file) => ({
        name: file.name,
        storagePath: file.storagePath,
      })) ?? [],
    tagIds: relations.tagsBySession.get(current.id)?.map((tag) => tag.id) ?? [],
  };

  const { data: seriesData, error: seriesError } = await privateDb
    .from('workspace_user_group_session_series')
    .insert({
      days_of_week: [weekday],
      description: current.description,
      description_json: current.description_json,
      end_time: toTime(current.ends_at, endTimezone),
      end_timezone: endTimezone,
      group_id: current.group_id,
      interval_weeks: 1,
      source: 'series_from_session',
      start_date: startDate,
      start_time: toTime(current.starts_at, startTimezone),
      start_timezone: startTimezone,
      title: current.title,
      until_date: null,
      ws_id: wsId,
    })
    .select('*')
    .single();

  if (seriesError) throw seriesError;
  const series = seriesData as SeriesRow;

  const reconciled = await reconcileScheduledSeriesOccurrence({
    blockAlignedOccupant: true,
    date: startDate,
    occurrence: buildMissingOccurrence(series, null, startDate),
    privateDb,
    row: current,
    series,
    wsId,
  });
  if (!reconciled) return null;

  await materializeSeries(privateDb, series.id, series.until_date);

  const { data: seriesRows, error: rowsError } = await privateDb
    .from('workspace_user_group_sessions')
    .select('*')
    .eq('ws_id', wsId)
    .eq('series_id', series.id);

  if (rowsError) throw rowsError;

  await Promise.all(
    ((seriesRows ?? []) as SessionRow[]).map((row) =>
      syncSessionRelations(privateDb, wsId, row.id, relationPayload)
    )
  );

  const refreshed = await fetchSessionById(wsId, reconciled.id, supabase);
  const [serialized] = await serializeSessions(supabase, wsId, [
    refreshed ?? reconciled,
  ]);
  return serialized ?? null;
}

export async function reconcileDetachedUserGroupSession({
  payload,
  sessionId,
  supabase,
  wsId,
}: {
  payload?: ReconcileWorkspaceUserGroupSessionPayload;
  sessionId: string;
  supabase: TypedSupabaseClient;
  wsId: string;
}) {
  if (payload?.mode === 'convert_weekly') {
    return convertDetachedUserGroupSessionToWeeklySeries({
      sessionId,
      supabase,
      wsId,
    });
  }

  const match = await findDetachedSessionSeriesMatch({
    mode: payload?.mode ?? 'weekly',
    sessionId,
    supabase,
    wsId,
  });
  if (!match) return null;

  const series =
    match.mode === 'weekly'
      ? await ensureSeriesIncludesWeekday({
          date: match.date,
          privateDb: match.privateDb,
          series: match.series,
          wsId,
        })
      : match.series;

  const reconciled = await reconcileScheduledSeriesOccurrence({
    blockAlignedOccupant: true,
    date: match.date,
    occurrence:
      match.mode === 'snap' || match.mode === 'weekly'
        ? match.occurrence
        : undefined,
    privateDb: match.privateDb,
    row: match.current,
    series,
    wsId,
  });

  if (!reconciled) return null;

  if (match.mode === 'weekly') {
    await materializeSeries(match.privateDb, series.id, series.until_date);
  }

  const refreshed =
    match.mode === 'weekly'
      ? await fetchSessionById(wsId, reconciled.id, supabase)
      : reconciled;

  const [serialized] = await serializeSessions(supabase, wsId, [
    refreshed ?? reconciled,
  ]);
  return serialized ?? null;
}

export async function updateUserGroupSession({
  payload,
  sessionId,
  supabase,
  wsId,
}: {
  payload: UpdateWorkspaceUserGroupSessionPayload;
  sessionId: string;
  supabase: TypedSupabaseClient;
  wsId: string;
}) {
  const privateDb = privateClient(supabase);
  const current = await fetchSessionById(wsId, sessionId, supabase);
  if (!current) return null;

  const scope = payload.scope ?? 'once';
  const startsAt = payload.startsAt ?? current.starts_at;
  const endsAt = payload.endsAt ?? current.ends_at;
  const startTimezone = payload.startTimezone ?? current.start_timezone;
  const endTimezone = payload.endTimezone ?? current.end_timezone;

  if (scope === 'future' && current.series_id) {
    const { data: seriesData, error: seriesError } = await privateDb
      .from('workspace_user_group_session_series')
      .select('*')
      .eq('ws_id', wsId)
      .eq('id', current.series_id)
      .maybeSingle();
    if (seriesError) throw seriesError;

    const series = seriesData as SeriesRow | null;
    if (series) {
      const relationPayload: Pick<
        UpdateWorkspaceUserGroupSessionPayload,
        'files' | 'tagIds' | 'tagNames'
      > = {
        files: payload.files,
        tagIds: payload.tagIds,
        tagNames: payload.tagNames,
      };

      if (
        payload.files === undefined ||
        (payload.tagIds === undefined && payload.tagNames === undefined)
      ) {
        const relations = await fetchSessionRelations(privateDb, wsId, [
          current.id,
        ]);

        if (payload.files === undefined) {
          relationPayload.files =
            relations.filesBySession.get(current.id)?.map((file) => ({
              name: file.name,
              storagePath: file.storagePath,
            })) ?? [];
        }

        if (payload.tagIds === undefined && payload.tagNames === undefined) {
          relationPayload.tagIds =
            relations.tagsBySession.get(current.id)?.map((tag) => tag.id) ?? [];
        }
      }

      const splitDate = toIsoDate(current.starts_at, current.start_timezone);
      const { error: updateOldError } = await privateDb
        .from('workspace_user_group_session_series')
        .update({ until_date: addDays(splitDate, -1) })
        .eq('id', series.id);
      if (updateOldError) throw updateOldError;

      const { error: deleteFutureError } = await privateDb
        .from('workspace_user_group_sessions')
        .delete()
        .eq('series_id', series.id)
        .gte('starts_at', current.starts_at);
      if (deleteFutureError) throw deleteFutureError;

      const { data: newSeriesData, error: newSeriesError } = await privateDb
        .from('workspace_user_group_session_series')
        .insert({
          days_of_week: series.days_of_week,
          description: payload.description ?? current.description,
          description_json:
            payload.descriptionJson === undefined
              ? current.description_json
              : payload.descriptionJson,
          end_time: toTime(endsAt, endTimezone),
          end_timezone: endTimezone,
          group_id: current.group_id,
          interval_weeks: series.interval_weeks,
          source: 'admin_future_split',
          start_date: toIsoDate(startsAt, startTimezone),
          start_time: toTime(startsAt, startTimezone),
          start_timezone: startTimezone,
          title: payload.title ?? current.title,
          until_date: series.until_date,
          ws_id: wsId,
        })
        .select('*')
        .single();
      if (newSeriesError) throw newSeriesError;

      const newSeries = newSeriesData as SeriesRow;
      await materializeSeries(privateDb, newSeries.id, newSeries.until_date);

      const { data: rowsData, error: rowsError } = await privateDb
        .from('workspace_user_group_sessions')
        .select('*')
        .eq('series_id', newSeries.id)
        .order('starts_at');
      if (rowsError) throw rowsError;

      const rows = (rowsData ?? []) as SessionRow[];
      await Promise.all(
        rows.map((row) =>
          syncSessionRelations(privateDb, wsId, row.id, {
            files: relationPayload.files,
            tagIds: relationPayload.tagIds,
            tagNames: relationPayload.tagNames,
          })
        )
      );

      return serializeSessions(supabase, wsId, rows);
    }
  }

  const { data, error } = await privateDb
    .from('workspace_user_group_sessions')
    .update({
      description: payload.description ?? current.description,
      description_json:
        payload.descriptionJson === undefined
          ? current.description_json
          : payload.descriptionJson,
      end_timezone: endTimezone,
      ends_at: endsAt,
      series_id: null,
      source: current.series_id ? 'detached_series_instance' : current.source,
      start_timezone: startTimezone,
      starts_at: startsAt,
      title: payload.title ?? current.title,
    })
    .eq('ws_id', wsId)
    .eq('id', sessionId)
    .select('*')
    .single();

  if (error) throw error;

  const row = data as SessionRow;
  await syncSessionRelations(privateDb, wsId, row.id, {
    files: payload.files,
    tagIds: payload.tagIds,
    tagNames: payload.tagNames,
  });

  const [serialized] = await serializeSessions(supabase, wsId, [row]);
  return serialized ?? null;
}
