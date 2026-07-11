import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import dayjs from 'dayjs';
import { cache } from 'react';
import '../dayjs-setup';
import {
  type GroupMembersPage,
  type GroupPostsPage,
  type GroupScheduleData,
  getGroupLinkedProducts,
  getGroupMembersPage,
  getGroupPostsPage,
  type LinkedProductRow,
} from './server-data';
import {
  listUserGroupSessionDates,
  listUserGroupSessions,
} from './session-schedule';

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

function resolveCompactScheduleMonth(month?: string | null) {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const parsed = dayjs(`${month}-01`, 'YYYY-MM-DD', true);
    if (parsed.isValid()) return parsed.startOf('month');
  }

  return dayjs().startOf('month');
}

function getCompactScheduleRange(month?: string | null) {
  const monthStart = resolveCompactScheduleMonth(month);
  const weekday = monthStart.day();
  const offset = weekday === 0 ? 6 : weekday - 1;
  const start = monthStart.subtract(offset, 'day').startOf('day');
  const end = start.add(41, 'day').endOf('day');

  return {
    from: start.toISOString(),
    month: monthStart.format('YYYY-MM'),
    to: end.toISOString(),
  };
}

export const getCachedGroupScheduleSessions = cache(
  async (wsId: string, groupId: string, month?: string | null) => {
    const row = (await getCachedGroupRow(wsId, groupId)) as
      | (UserGroup & {
          starting_date?: string | null;
          ending_date?: string | null;
        })
      | null;
    if (!row) return null;

    const range = getCompactScheduleRange(month);
    const sbAdmin = await createAdminClient({ noCookie: true });
    const sessions = await listUserGroupSessions({
      from: range.from,
      groupId,
      includeMissing: true,
      supabase: sbAdmin,
      to: range.to,
      wsId,
    });

    return {
      ...sessions,
      ending_date: row.ending_date ?? null,
      month: range.month,
      range,
      starting_date: row.starting_date ?? null,
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
