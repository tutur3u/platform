import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { cacheLife, cacheTag } from 'next/cache';
import {
  type GroupMembersPage,
  type GroupPostsPage,
  type GroupScheduleData,
  getGroupLinkedProducts,
  getGroupMembersPage,
  getGroupPostsPage,
  type LinkedProductRow,
} from './server-data';

/**
 * Next.js Cache Components (`'use cache'`) wrappers for the user-group overview.
 *
 * Each fetcher is keyed purely on serializable args and uses a no-cookie admin
 * client so the cached scope contains no dynamic request APIs. Group data is the
 * same for every viewer (permissions are checked separately by the page), so it
 * is safe to share across users. Entries are tagged `ws-group:<groupId>` and
 * revalidated by the group's mutation routes (see revalidateUserGroupCache).
 */

export function userGroupCacheTag(groupId: string) {
  return `ws-group:${groupId}`;
}

export async function getCachedGroupRow(
  wsId: string,
  groupId: string
): Promise<UserGroup | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(userGroupCacheTag(groupId));

  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data, error } = await sbAdmin
    .from('workspace_user_groups')
    .select('*')
    .eq('ws_id', wsId)
    .eq('id', groupId)
    .maybeSingle();

  if (error) throw error;
  return (data as UserGroup) ?? null;
}

export async function getCachedGroupSchedule(
  wsId: string,
  groupId: string
): Promise<GroupScheduleData | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(userGroupCacheTag(groupId));

  const row = (await getCachedGroupRow(wsId, groupId)) as
    | (UserGroup & {
        sessions?: string[] | null;
        starting_date?: string | null;
        ending_date?: string | null;
      })
    | null;
  if (!row) return null;
  return {
    sessions: row.sessions ?? null,
    starting_date: row.starting_date ?? null,
    ending_date: row.ending_date ?? null,
  };
}

export async function getCachedGroupMembersPage(
  wsId: string,
  groupId: string,
  limit: number,
  canViewPersonalInfo: boolean,
  canViewPublicInfo: boolean
): Promise<GroupMembersPage> {
  'use cache';
  cacheLife('minutes');
  cacheTag(userGroupCacheTag(groupId));

  const sbAdmin = await createAdminClient({ noCookie: true });
  return getGroupMembersPage({
    sbAdmin,
    wsId,
    groupId,
    offset: 0,
    limit,
    canViewPersonalInfo,
    canViewPublicInfo,
  });
}

export async function getCachedGroupPostsPage(
  groupId: string,
  limit: number
): Promise<GroupPostsPage> {
  'use cache';
  cacheLife('minutes');
  cacheTag(userGroupCacheTag(groupId));

  const sbAdmin = await createAdminClient({ noCookie: true });
  return getGroupPostsPage({ sbAdmin, groupId, limit });
}

export async function getCachedGroupLinkedProducts(
  groupId: string
): Promise<{ items: LinkedProductRow[]; count: number }> {
  'use cache';
  cacheLife('minutes');
  cacheTag(userGroupCacheTag(groupId));

  const sbAdmin = await createAdminClient({ noCookie: true });
  return getGroupLinkedProducts({ sbAdmin, groupId });
}
