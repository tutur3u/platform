import 'server-only';

import type { WorkspaceUserGroupTableRow } from '@tuturuuu/types/db';
import { getPlatformSql } from '@/lib/database/platform-sql';

export type UserGroupTableStatus = 'all' | 'active' | 'archived';

export interface ListUserGroupsForTableParams {
  accessibleGroupIds?: string[] | null;
  groupIds?: string[] | null;
  page: number;
  pageSize: number;
  q?: string | null;
  status: UserGroupTableStatus;
  wsId: string;
}

function normalizeGroupIdFilter(value: string[] | null | undefined) {
  if (value === undefined || value === null) return null;
  return value;
}

function normalizePage(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function normalizePageSize(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 10;
  return Math.min(Math.floor(value), 200);
}

export async function listUserGroupsForTable({
  accessibleGroupIds,
  groupIds,
  page,
  pageSize,
  q,
  status,
  wsId,
}: ListUserGroupsForTableParams) {
  const sql = getPlatformSql();
  const validPage = normalizePage(page);
  const validPageSize = normalizePageSize(pageSize);
  const offset = (validPage - 1) * validPageSize;
  const normalizedGroupIds = normalizeGroupIdFilter(groupIds);
  const normalizedAccessibleGroupIds =
    normalizeGroupIdFilter(accessibleGroupIds);

  return sql<WorkspaceUserGroupTableRow[]>`
    select
      id::text as id,
      ws_id::text as ws_id,
      name,
      starting_date::text as starting_date,
      ending_date::text as ending_date,
      archived,
      notes,
      is_guest,
      amount,
      sessions,
      created_at::text as created_at,
      has_session_today
    from private.list_workspace_user_groups_for_table(
      ${wsId}::uuid,
      ${status},
      ${q ?? null},
      ${normalizedGroupIds}::uuid[],
      ${normalizedAccessibleGroupIds}::uuid[],
      ${validPageSize},
      ${offset}
    )
  `;
}

export async function countUserGroupsForTable({
  accessibleGroupIds,
  groupIds,
  q,
  status,
  wsId,
}: Omit<ListUserGroupsForTableParams, 'page' | 'pageSize'>) {
  const sql = getPlatformSql();
  const normalizedGroupIds = normalizeGroupIdFilter(groupIds);
  const normalizedAccessibleGroupIds =
    normalizeGroupIdFilter(accessibleGroupIds);

  const [row] = await sql<{ count: number | string | null }[]>`
    select private.count_workspace_user_groups_for_table(
      ${wsId}::uuid,
      ${status},
      ${q ?? null},
      ${normalizedGroupIds}::uuid[],
      ${normalizedAccessibleGroupIds}::uuid[]
    ) as count
  `;

  return Number(row?.count ?? 0);
}
