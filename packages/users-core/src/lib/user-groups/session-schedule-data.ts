import 'server-only';

import type {
  CreateWorkspaceUserGroupSessionPayload,
  WorkspaceUserGroupSession,
  WorkspaceUserGroupSessionFile,
  WorkspaceUserGroupSessionTag,
} from '@tuturuuu/internal-api';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import dayjs from 'dayjs';
import '../dayjs-setup';
import type {
  FileRow,
  GroupRow,
  SessionRow,
  TagLinkRow,
  TagRow,
  UntypedSchemaClient,
} from './session-schedule-types';

export type { SeriesRow, SessionRow } from './session-schedule-types';

export const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';
const ROLLING_MONTHS = 12;

export function privateClient(
  client: TypedSupabaseClient
): UntypedSchemaClient {
  return client.schema('private') as unknown as UntypedSchemaClient;
}

export function toIsoDate(value: string, timezone: string) {
  return dayjs(value).tz(timezone).format('YYYY-MM-DD');
}

export function toTime(value: string, timezone: string) {
  return dayjs(value).tz(timezone).format('HH:mm:ss');
}

export function addDays(date: string, days: number) {
  return dayjs(date).add(days, 'day').format('YYYY-MM-DD');
}

function normalizeTagNames(values: string[] | undefined) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 20)
    )
  );
}

export async function assertGroupInWorkspace(
  supabase: TypedSupabaseClient,
  wsId: string,
  groupId: string
) {
  const { data, error } = await supabase
    .from('workspace_user_groups')
    .select('id')
    .eq('ws_id', wsId)
    .eq('id', groupId)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

async function fetchGroupsByIds(
  supabase: TypedSupabaseClient,
  groupIds: string[]
) {
  if (groupIds.length === 0) return new Map<string, GroupRow>();

  const { data, error } = await supabase
    .from('workspace_user_groups')
    .select('id, name')
    .in('id', groupIds);

  if (error) throw error;

  return new Map(
    ((data ?? []) as GroupRow[]).map((group) => [group.id, group])
  );
}

export async function fetchAllGroups(
  supabase: TypedSupabaseClient,
  wsId: string
) {
  const { data, error } = await supabase
    .from('workspace_user_groups')
    .select('id, name')
    .eq('ws_id', wsId)
    .eq('archived', false)
    .order('name');

  if (error) throw error;

  return (data ?? []) as GroupRow[];
}

export async function fetchSessionRelations(
  privateDb: UntypedSchemaClient,
  wsId: string,
  sessionIds: string[]
) {
  const empty = {
    filesBySession: new Map<string, WorkspaceUserGroupSessionFile[]>(),
    tags: [] as WorkspaceUserGroupSessionTag[],
    tagsBySession: new Map<string, WorkspaceUserGroupSessionTag[]>(),
  };

  if (sessionIds.length === 0) return empty;

  const [
    { data: links, error: linksError },
    { data: files, error: filesError },
  ] = await Promise.all([
    privateDb
      .from('workspace_user_group_session_tag_links')
      .select('session_id, tag_id')
      .eq('ws_id', wsId)
      .in('session_id', sessionIds),
    privateDb
      .from('workspace_user_group_session_files')
      .select('id, session_id, storage_path, name')
      .eq('ws_id', wsId)
      .in('session_id', sessionIds),
  ]);

  if (linksError) throw linksError;
  if (filesError) throw filesError;

  const tagIds = Array.from(
    new Set(((links ?? []) as TagLinkRow[]).map((link) => link.tag_id))
  );

  let tags: TagRow[] = [];
  if (tagIds.length > 0) {
    const { data, error } = await privateDb
      .from('workspace_user_group_session_tags')
      .select('id, ws_id, name, color')
      .eq('ws_id', wsId)
      .in('id', tagIds);

    if (error) throw error;
    tags = (data ?? []) as TagRow[];
  }

  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  const tagsBySession = new Map<string, WorkspaceUserGroupSessionTag[]>();
  for (const link of (links ?? []) as TagLinkRow[]) {
    const tag = tagById.get(link.tag_id);
    if (!tag) continue;
    const list = tagsBySession.get(link.session_id) ?? [];
    list.push({ color: tag.color, id: tag.id, name: tag.name });
    tagsBySession.set(link.session_id, list);
  }

  const filesBySession = new Map<string, WorkspaceUserGroupSessionFile[]>();
  for (const file of (files ?? []) as FileRow[]) {
    const list = filesBySession.get(file.session_id) ?? [];
    list.push({
      id: file.id,
      name: file.name,
      storagePath: file.storage_path,
    });
    filesBySession.set(file.session_id, list);
  }

  return {
    filesBySession,
    tags: tags.map((tag) => ({
      color: tag.color,
      id: tag.id,
      name: tag.name,
    })),
    tagsBySession,
  };
}

function serializeSession(
  row: SessionRow,
  group: GroupRow | undefined,
  tags: WorkspaceUserGroupSessionTag[],
  files: WorkspaceUserGroupSessionFile[]
): WorkspaceUserGroupSession {
  return {
    description: row.description,
    descriptionJson: row.description_json,
    endTimezone: row.end_timezone,
    endsAt: row.ends_at,
    files,
    groupId: row.group_id,
    groupName: group?.name ?? null,
    id: row.id,
    recurrenceInstanceDate: row.recurrence_instance_date,
    seriesId: row.series_id,
    source: row.source,
    startTimezone: row.start_timezone,
    startsAt: row.starts_at,
    status: row.status,
    tags,
    title: row.title,
  };
}

export async function serializeSessions(
  supabase: TypedSupabaseClient,
  wsId: string,
  rows: SessionRow[]
) {
  const privateDb = privateClient(supabase);
  const groupMap = await fetchGroupsByIds(
    supabase,
    Array.from(new Set(rows.map((row) => row.group_id)))
  );
  const relations = await fetchSessionRelations(
    privateDb,
    wsId,
    rows.map((row) => row.id)
  );

  return rows.map((row) =>
    serializeSession(
      row,
      groupMap.get(row.group_id),
      relations.tagsBySession.get(row.id) ?? [],
      relations.filesBySession.get(row.id) ?? []
    )
  );
}

async function resolveTagIds(
  privateDb: UntypedSchemaClient,
  wsId: string,
  tagIds: string[] | undefined,
  tagNames: string[] | undefined
) {
  const resolvedIds = new Set(tagIds ?? []);
  const names = normalizeTagNames(tagNames);

  if (names.length === 0) return Array.from(resolvedIds);

  const { data: existing, error: existingError } = await privateDb
    .from('workspace_user_group_session_tags')
    .select('id, name')
    .eq('ws_id', wsId)
    .in('name', names);

  if (existingError) throw existingError;

  const existingRows = (existing ?? []) as Pick<TagRow, 'id' | 'name'>[];
  const existingNames = new Set(existingRows.map((tag) => tag.name));
  for (const tag of existingRows) resolvedIds.add(tag.id);

  const missingNames = names.filter((name) => !existingNames.has(name));
  if (missingNames.length > 0) {
    const { data: inserted, error: insertError } = await privateDb
      .from('workspace_user_group_session_tags')
      .insert(
        missingNames.map((name) => ({
          name,
          ws_id: wsId,
        }))
      )
      .select('id');

    if (insertError) throw insertError;
    for (const tag of (inserted ?? []) as Pick<TagRow, 'id'>[]) {
      resolvedIds.add(tag.id);
    }
  }

  return Array.from(resolvedIds);
}

export async function syncSessionRelations(
  privateDb: UntypedSchemaClient,
  wsId: string,
  sessionId: string,
  payload: Pick<
    CreateWorkspaceUserGroupSessionPayload,
    'files' | 'tagIds' | 'tagNames'
  >
) {
  if (payload.tagIds !== undefined || payload.tagNames !== undefined) {
    const tagIds = await resolveTagIds(
      privateDb,
      wsId,
      payload.tagIds,
      payload.tagNames
    );

    const { error: deleteError } = await privateDb
      .from('workspace_user_group_session_tag_links')
      .delete()
      .eq('session_id', sessionId);
    if (deleteError) throw deleteError;

    if (tagIds.length > 0) {
      const { error } = await privateDb
        .from('workspace_user_group_session_tag_links')
        .insert(
          tagIds.map((tagId) => ({
            session_id: sessionId,
            tag_id: tagId,
            ws_id: wsId,
          }))
        );
      if (error) throw error;
    }
  }

  if (payload.files !== undefined) {
    const { error: deleteError } = await privateDb
      .from('workspace_user_group_session_files')
      .delete()
      .eq('session_id', sessionId);
    if (deleteError) throw deleteError;

    const files = payload.files.filter((file) => file.storagePath.trim());
    if (files.length > 0) {
      const { error } = await privateDb
        .from('workspace_user_group_session_files')
        .insert(
          files.map((file) => ({
            name: file.name ?? file.storagePath.split('/').at(-1) ?? null,
            session_id: sessionId,
            storage_path: file.storagePath.trim(),
            ws_id: wsId,
          }))
        );
      if (error) throw error;
    }
  }
}

export async function materializeSeries(
  privateDb: UntypedSchemaClient,
  seriesId: string,
  until?: string | null
) {
  const { error } = await privateDb.rpc(
    'materialize_workspace_user_group_session_series',
    {
      p_series_id: seriesId,
      p_until:
        until ?? dayjs().add(ROLLING_MONTHS, 'month').format('YYYY-MM-DD'),
    }
  );

  if (error) throw error;
}
