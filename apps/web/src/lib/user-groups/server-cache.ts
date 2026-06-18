import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { cache } from 'react';
import {
  type GroupMembersPage,
  type GroupPostsPage,
  type GroupScheduleData,
  getGroupLinkedProducts,
  getGroupMembersPage,
  getGroupPostsPage,
  type LinkedProductRow,
} from './server-data';
import { listUserGroupSessionDates } from './session-schedule';

/**
 * Request-scoped cache wrappers for the user-group overview.
 *
 * Each fetcher is keyed purely on serializable args and uses a no-cookie admin
 * client so repeated callers in the same server render can share one query
 * without relying on Next Cache Components, which production builds currently
 * disable.
 */

export const getCachedGroupRow = cache(
  async (wsId: string, groupId: string): Promise<UserGroup | null> => {
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
);

export const getCachedGroupSchedule = cache(
  async (wsId: string, groupId: string): Promise<GroupScheduleData | null> => {
    const row = (await getCachedGroupRow(wsId, groupId)) as
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

export const getCachedGroupMembersPage = cache(
  async (
    wsId: string,
    groupId: string,
    limit: number,
    canViewPersonalInfo: boolean,
    canViewPublicInfo: boolean
  ): Promise<GroupMembersPage> => {
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
);

export const getCachedGroupPostsPage = cache(
  async (groupId: string, limit: number): Promise<GroupPostsPage> => {
    const sbAdmin = await createAdminClient({ noCookie: true });
    return getGroupPostsPage({ sbAdmin, groupId, limit });
  }
);

export const getCachedGroupLinkedProducts = cache(
  async (
    groupId: string
  ): Promise<{ items: LinkedProductRow[]; count: number }> => {
    const sbAdmin = await createAdminClient({ noCookie: true });
    return getGroupLinkedProducts({ sbAdmin, groupId });
  }
);
