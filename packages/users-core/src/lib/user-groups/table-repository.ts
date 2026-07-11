import 'server-only';

import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { WorkspaceUserGroupTableRow } from '@tuturuuu/types/db';

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

function normalizeSearchParam(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function buildUserGroupsTableRpcArgs({
  accessibleGroupIds,
  groupIds,
  q,
  status,
  wsId,
}: Omit<ListUserGroupsForTableParams, 'client' | 'page' | 'pageSize'>) {
  const effectiveGroupIds = getEffectiveGroupIds({
    accessibleGroupIds,
    groupIds,
  });

  if (effectiveGroupIds?.length === 0) {
    return null;
  }

  const search = normalizeSearchParam(q);

  return {
    ...(effectiveGroupIds ? { p_group_ids: effectiveGroupIds } : {}),
    ...(search ? { p_search: search } : {}),
    p_status: status,
    p_ws_id: wsId,
  };
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

  const rpcArgs = buildUserGroupsTableRpcArgs({
    accessibleGroupIds,
    groupIds,
    q,
    status,
    wsId,
  });

  if (!rpcArgs) return [];

  const { data, error } = await client
    .schema('private')
    .rpc('list_workspace_user_groups_for_table', {
      ...rpcArgs,
      p_limit: validPageSize,
      p_offset: offset,
    });

  if (error) throw error;

  return (data ?? []) as WorkspaceUserGroupTableRow[];
}

export async function countUserGroupsForTable({
  accessibleGroupIds,
  client,
  groupIds,
  q,
  status,
  wsId,
}: Omit<ListUserGroupsForTableParams, 'page' | 'pageSize'>) {
  const rpcArgs = buildUserGroupsTableRpcArgs({
    accessibleGroupIds,
    groupIds,
    q,
    status,
    wsId,
  });

  if (!rpcArgs) return 0;

  const { data, error } = await client
    .schema('private')
    .rpc('count_workspace_user_groups_for_table', rpcArgs);

  if (error) throw error;

  return data ?? 0;
}
