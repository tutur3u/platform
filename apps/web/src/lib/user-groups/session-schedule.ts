import 'server-only';

import type {
  CreateWorkspaceUserGroupSessionPayload,
  UpdateWorkspaceUserGroupSessionPayload,
} from '@tuturuuu/internal-api';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import dayjs from 'dayjs';
import '@/lib/dayjs-setup';
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
    tags: relationData.tags,
  };
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
