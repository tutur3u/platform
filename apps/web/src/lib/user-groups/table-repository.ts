import 'server-only';

import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { WorkspaceUserGroupTableRow } from '@tuturuuu/types/db';
import { removeAccents } from '@tuturuuu/utils/text-helper';

export type UserGroupTableStatus = 'all' | 'active' | 'archived';

export interface ListUserGroupsForTableParams {
  accessibleGroupIds?: string[] | null;
  client: TypedSupabaseClient;
  groupIds?: string[] | null;
  page: number;
  pageSize: number;
  q?: string | null;
  status: UserGroupTableStatus;
  wsId: string;
}

type WorkspaceUserGroupsWithGuestRow = {
  amount: number | null;
  archived: boolean | null;
  created_at: string | null;
  ending_date: string | null;
  id: string | null;
  is_guest: boolean | null;
  name: string | null;
  notes: string | null;
  sessions: string[] | null;
  starting_date: string | null;
  ws_id: string | null;
};

type WorkspaceTimezoneRow = {
  timezone: string | null;
};

function normalizeGroupIdFilter(value: string[] | null | undefined) {
  if (value === undefined || value === null) return null;
  return Array.from(new Set(value.filter(Boolean)));
}

function getEffectiveGroupIds({
  accessibleGroupIds,
  groupIds,
}: Pick<ListUserGroupsForTableParams, 'accessibleGroupIds' | 'groupIds'>) {
  const requested = normalizeGroupIdFilter(groupIds);
  const accessible = normalizeGroupIdFilter(accessibleGroupIds);

  if (requested?.length === 0 || accessible?.length === 0) return [];
  if (!requested) return accessible;
  if (!accessible) return requested;

  const accessibleSet = new Set(accessible);
  return requested.filter((groupId) => accessibleSet.has(groupId));
}

function normalizePage(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function normalizePageSize(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 10;
  return Math.min(Math.floor(value), 200);
}

function normalizeUserGroupSearchText(value: string) {
  return removeAccents(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function matchesUserGroupSearch(
  name: string | null | undefined,
  q: string | null | undefined
) {
  const normalizedQuery = normalizeUserGroupSearchText(q ?? '');
  if (!normalizedQuery) return true;

  const normalizedName = normalizeUserGroupSearchText(name ?? '');
  if (!normalizedName) return false;

  return normalizedQuery
    .split(' ')
    .filter(Boolean)
    .every((term) => normalizedName.includes(term));
}

function getDateStringInTimeZone(timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: '2-digit',
      timeZone,
      year: 'numeric',
    }).formatToParts(new Date());
    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value])
    );

    if (values.year && values.month && values.day) {
      return `${values.year}-${values.month}-${values.day}`;
    }
  } catch {
    return new Date().toISOString().slice(0, 10);
  }

  return new Date().toISOString().slice(0, 10);
}

function toTableRow(
  row: WorkspaceUserGroupsWithGuestRow,
  today: string
): WorkspaceUserGroupTableRow | null {
  if (!row.id || !row.ws_id || !row.name) return null;

  return {
    id: row.id,
    ws_id: row.ws_id,
    name: row.name,
    starting_date: row.starting_date,
    ending_date: row.ending_date,
    archived: row.archived ?? false,
    notes: row.notes,
    is_guest: row.is_guest ?? false,
    amount: row.amount ?? 0,
    sessions: row.sessions,
    created_at: row.created_at,
    has_session_today: (row.sessions ?? []).includes(today),
  };
}

function sortTableRows(rows: WorkspaceUserGroupTableRow[]) {
  return [...rows].sort((a, b) => {
    if (a.has_session_today !== b.has_session_today) {
      return a.has_session_today ? -1 : 1;
    }

    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;

    return a.id.localeCompare(b.id);
  });
}

async function resolveWorkspaceToday(
  client: TypedSupabaseClient,
  wsId: string
) {
  const { data, error } = await client
    .from('workspaces')
    .select('timezone')
    .eq('id', wsId)
    .maybeSingle();

  if (error) throw error;

  const timezone = (
    (data as WorkspaceTimezoneRow | null)?.timezone ?? ''
  ).trim();

  if (!timezone || timezone.toLowerCase() === 'auto') {
    return getDateStringInTimeZone('UTC');
  }

  return getDateStringInTimeZone(timezone);
}

async function fetchRowsForTable({
  accessibleGroupIds,
  client,
  groupIds,
  q,
  status,
  wsId,
}: Omit<ListUserGroupsForTableParams, 'page' | 'pageSize'>) {
  const effectiveGroupIds = getEffectiveGroupIds({
    accessibleGroupIds,
    groupIds,
  });

  if (effectiveGroupIds?.length === 0) {
    return [];
  }

  const today = await resolveWorkspaceToday(client, wsId);

  const queryBuilder = client
    .from('workspace_user_groups_with_guest')
    .select(
      'id, ws_id, name, starting_date, ending_date, archived, notes, is_guest, amount, sessions, created_at'
    )
    .eq('ws_id', wsId)
    .order('name');

  if (status === 'active') {
    queryBuilder.eq('archived', false);
  } else if (status === 'archived') {
    queryBuilder.eq('archived', true);
  }

  if (effectiveGroupIds) {
    queryBuilder.in('id', effectiveGroupIds);
  }

  const { data, error } = await queryBuilder;

  if (error) throw error;

  return sortTableRows(
    ((data ?? []) as WorkspaceUserGroupsWithGuestRow[])
      .map((row) => toTableRow(row, today))
      .filter((row): row is WorkspaceUserGroupTableRow => {
        if (!row) return false;
        return matchesUserGroupSearch(row.name, q);
      })
  );
}

export async function listUserGroupsForTable({
  accessibleGroupIds,
  client,
  groupIds,
  page,
  pageSize,
  q,
  status,
  wsId,
}: ListUserGroupsForTableParams) {
  const validPage = normalizePage(page);
  const validPageSize = normalizePageSize(pageSize);
  const offset = (validPage - 1) * validPageSize;

  const rows = await fetchRowsForTable({
    accessibleGroupIds,
    client,
    groupIds,
    q,
    status,
    wsId,
  });

  return rows.slice(offset, offset + validPageSize);
}

export async function countUserGroupsForTable({
  accessibleGroupIds,
  client,
  groupIds,
  q,
  status,
  wsId,
}: Omit<ListUserGroupsForTableParams, 'page' | 'pageSize'>) {
  const rows = await fetchRowsForTable({
    accessibleGroupIds,
    client,
    groupIds,
    q,
    status,
    wsId,
  });

  return rows.length;
}
