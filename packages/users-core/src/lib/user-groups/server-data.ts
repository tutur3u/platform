import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { cache } from 'react';
import {
  fetchRequireAttentionUserIds,
  withRequireAttentionFlag,
} from '../require-attention-users';
import { listUserGroupSessionDates } from './session-schedule';

/**
 * Server-side data fetchers for the user-group detail pages.
 *
 * These mirror the shapes returned by the corresponding API routes so the
 * results can be passed directly into the client components as TanStack Query
 * `initialData`, eliminating the on-mount client fetch waterfall. Functions
 * that only depend on primitive args are wrapped in React `cache()` so repeated
 * callers in the same render (layout + page + sub-page) share one query.
 */

export interface GroupMemberRow {
  id: string;
  role?: string | null;
  isGuest?: boolean;
  has_require_attention_feedback?: boolean;
  [key: string]: unknown;
}

export interface GroupMembersPage {
  data: GroupMemberRow[];
  count: number;
  next?: number;
}

/**
 * Batch replacement for the per-member `is_user_guest` RPC. A user is a guest if
 * they belong to ANY workspace user group flagged `is_guest = true`. Returns the
 * subset of `userIds` that are guests in a single query (empty input → no query).
 */
export async function getGroupGuestUserIds(
  sbAdmin: TypedSupabaseClient,
  userIds: string[]
): Promise<Set<string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Set<string>();

  // workspace_user_groups_users has multiple relationships to
  // workspace_user_groups, so the group-membership FK must be named explicitly
  // (group_id -> workspace_user_groups.id) to avoid an ambiguous-embed error.
  // Alias the embed so the is_guest filter has an unambiguous path.
  const { data, error } = await sbAdmin
    .from('workspace_user_groups_users')
    .select(
      'user_id, guest_group:workspace_user_groups!workspace_user_roles_users_role_id_fkey!inner(is_guest)'
    )
    .in('user_id', ids)
    .eq('guest_group.is_guest', true);

  if (error) throw error;

  return new Set(
    (data ?? [])
      .map((row) => (row as { user_id: string | null }).user_id)
      .filter((id): id is string => Boolean(id))
  );
}

/**
 * Single source of truth for a page of group members. Shared by the members API
 * route and the overview server prefetch. Guest + require-attention flags are
 * resolved in two batched queries (run in parallel) instead of N+1 RPCs.
 */
export async function getGroupMembersPage({
  sbAdmin,
  wsId,
  groupId,
  offset,
  limit,
  canViewPersonalInfo,
  canViewPublicInfo,
}: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
  groupId: string;
  offset: number;
  limit: number;
  canViewPersonalInfo: boolean;
  canViewPublicInfo: boolean;
}): Promise<GroupMembersPage> {
  const baseFields =
    'id, display_name, full_name, avatar_url, archived, archived_until, note';
  const publicFields = canViewPublicInfo ? ', birthday, gender' : '';
  const personalFields = canViewPersonalInfo ? ', email, phone' : '';
  const selectQuery = `workspace_users!workspace_user_roles_users_user_id_fkey!inner(${baseFields}${publicFields}${personalFields}), role`;

  const { data, error } = await sbAdmin
    .from('workspace_user_groups_users')
    .select(selectQuery, { count: 'exact' })
    .eq('group_id', groupId)
    .eq('workspace_users.ws_id', wsId)
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<{
    workspace_users: Record<string, unknown> & { id: string };
    role: string | null;
  }>;

  const baseMembers = rows.map((row) => ({
    ...row.workspace_users,
    role: row.role,
  }));
  const ids = baseMembers.map((member) => member.id);

  const [guestIds, requireAttentionUserIds] = await Promise.all([
    getGroupGuestUserIds(sbAdmin, ids),
    fetchRequireAttentionUserIds(sbAdmin, { wsId, userIds: ids, groupId }),
  ]);

  const members = baseMembers.map((member) => ({
    ...member,
    isGuest: guestIds.has(member.id),
  }));

  return {
    data: withRequireAttentionFlag(
      members as unknown as WorkspaceUser[],
      requireAttentionUserIds
    ) as unknown as GroupMemberRow[],
    count: rows.length,
    next: rows.length < limit ? undefined : offset + limit,
  };
}

export interface GroupPostsPage {
  data: Record<string, unknown>[];
  count: number;
  nextCursor: string | null;
}

/** First (or cursor) page of group posts. Mirrors the posts API route. */
export async function getGroupPostsPage({
  sbAdmin,
  groupId,
  limit,
  cursor,
}: {
  sbAdmin: TypedSupabaseClient;
  groupId: string;
  limit: number;
  cursor?: string | null;
}): Promise<GroupPostsPage> {
  let query = sbAdmin
    .schema('private')
    .from('user_group_posts')
    .select('*', { count: 'exact' })
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (cursor) query = query.lt('created_at', cursor);

  const { data, error, count } = await query;
  if (error) throw error;

  const posts = (data ?? []) as Record<string, unknown>[];
  return {
    data: posts,
    count: count ?? 0,
    nextCursor:
      posts.length === limit
        ? ((posts[posts.length - 1]?.created_at as string | undefined) ?? null)
        : null,
  };
}

export interface LinkedProductRow {
  id: string;
  name: string | null;
  description: string | null;
  warehouse_id: string | null;
  unit_id: string | null;
}

/** Linked products for a group. Mirrors the linked-products API route. */
export async function getGroupLinkedProducts({
  sbAdmin,
  groupId,
}: {
  sbAdmin: TypedSupabaseClient;
  groupId: string;
}): Promise<{ items: LinkedProductRow[]; count: number }> {
  const { data, error, count } = await sbAdmin
    .from('user_group_linked_products')
    .select(
      'warehouse_id, unit_id, workspace_products!inner(id, name, description)',
      { count: 'exact' }
    )
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<{
    warehouse_id: string | null;
    unit_id: string | null;
    workspace_products: {
      id: string;
      name: string | null;
      description: string | null;
    };
  }>;

  return {
    items: rows.map((row) => ({
      id: row.workspace_products.id,
      name: row.workspace_products.name,
      description: row.workspace_products.description,
      warehouse_id: row.warehouse_id,
      unit_id: row.unit_id,
    })),
    count: count ?? 0,
  };
}

/** Full group row, deduped per request (layout + page + sub-pages share it). */
export const getGroupRow = cache(
  async (wsId: string, groupId: string): Promise<UserGroup | null> => {
    const sbAdmin = await createAdminClient();
    const { data, error } = await sbAdmin
      .from('workspace_user_groups')
      .select('*')
      .eq('ws_id', wsId)
      .eq('id', groupId)
      .maybeSingle();

    if (error) throw error;
    return (data as UserGroup) ?? null;
  }
);

export interface GroupScheduleData {
  sessions: string[] | null;
  starting_date: string | null;
  ending_date: string | null;
}

/** Mini-calendar schedule data, derived from the cached group row. */
export const getGroupScheduleData = cache(
  async (wsId: string, groupId: string): Promise<GroupScheduleData | null> => {
    const row = (await getGroupRow(wsId, groupId)) as
      | (UserGroup & {
          starting_date?: string | null;
          ending_date?: string | null;
        })
      | null;
    if (!row) return null;

    const sbAdmin = await createAdminClient({ noCookie: true });
    const sessions = await listUserGroupSessionDates({
      groupId,
      supabase: sbAdmin,
      wsId,
    });

    return {
      sessions,
      starting_date: row.starting_date ?? null,
      ending_date: row.ending_date ?? null,
    };
  }
);
