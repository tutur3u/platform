import { ATTENDANCE_COUNT_MANAGERS_CONFIG_ID } from '@tuturuuu/internal-api/workspace-configs';
import type { SupabaseClient } from '@tuturuuu/supabase';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { removeAccents } from '@tuturuuu/utils/text-helper';
import { getCurrentWorkspaceUser } from '@tuturuuu/utils/user-helper';
import { getWorkspaceConfig } from '@tuturuuu/utils/workspace-helper';
import { getWorkspaceUserLinkForUser } from '@tuturuuu/utils/workspace-user-link';
import { notFound } from 'next/navigation';
import type { ManagerUser } from './manager-user';

export async function getUserGroupMemberships(wsId: string): Promise<string[]> {
  const supabase = await createClient();
  const workspaceUser = await getCurrentWorkspaceUser(wsId);

  // Try virtual_user_id first, fall back to platform_user_id
  const userId =
    workspaceUser?.virtual_user_id ?? workspaceUser?.platform_user_id;

  if (!userId) {
    return [];
  }

  const { data: memberships, error } = await supabase
    .from('workspace_user_groups_users')
    .select('group_id')
    .eq('user_id', userId);

  if (error) throw error;

  return Array.from(
    new Set((memberships || []).map((m) => m.group_id).filter(Boolean))
  ) as string[];
}

export async function getUserGroupMembershipsForActor(
  wsId: string,
  actorAuthUid: string
): Promise<string[]> {
  const workspaceUser = await getWorkspaceUserLinkForUser(wsId, actorAuthUid);
  const userId =
    workspaceUser?.virtual_user_id ?? workspaceUser?.platform_user_id;
  if (!userId) return [];

  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
    .from('workspace_user_groups_users')
    .select('group_id')
    .eq('user_id', userId);
  if (error) throw error;

  return Array.from(
    new Set(
      (data ?? []).map((membership) => membership.group_id).filter(Boolean)
    )
  ) as string[];
}

export async function verifyGroupAccess(wsId: string, groupId: string) {
  const supabase = await createClient();
  const workspaceUser = await getCurrentWorkspaceUser(wsId);

  // Try virtual_user_id first, fall back to platform_user_id
  const userId =
    workspaceUser?.virtual_user_id ?? workspaceUser?.platform_user_id;

  if (!userId) {
    console.error('No user ID found for current workspace user');
    notFound();
  }

  const { data: membership, error } = await supabase
    .from('workspace_user_groups_users')
    .select('group_id')
    .eq('user_id', userId)
    .eq('group_id', groupId)
    .maybeSingle();

  if (error) throw error;
  if (!membership?.group_id) {
    console.error(`User does not have access to group ${groupId}`);
    notFound();
  }
}

/**
 * Escapes SQL LIKE wildcard characters (%, _, \) in a search string.
 * This prevents users from injecting wildcard patterns.
 */
export function escapeLikeWildcards(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function normalizeUserGroupSearchText(value: string): string {
  return removeAccents(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function matchesUserGroupSearch(
  name: string | null | undefined,
  q: string
) {
  const normalizedQuery = normalizeUserGroupSearchText(q);
  if (!normalizedQuery) {
    return true;
  }

  const normalizedName = normalizeUserGroupSearchText(name ?? '');
  if (!normalizedName) {
    return false;
  }

  const queryTerms = normalizedQuery.split(' ').filter(Boolean);
  return queryTerms.every((term) => normalizedName.includes(term));
}

export function shouldCountManagersInAttendance(value: string | null) {
  return value?.trim().toLowerCase() !== 'false';
}

export async function getShouldCountManagersInAttendance(wsId: string) {
  const value = await getWorkspaceConfig(
    wsId,
    ATTENDANCE_COUNT_MANAGERS_CONFIG_ID
  );

  return shouldCountManagersInAttendance(value);
}

export function applyAttendanceMemberCounts(
  groups: UserGroup[],
  managersByGroup: Record<string, ManagerUser[]>,
  countManagersInAttendance: boolean
) {
  return groups.map((group) => {
    const managers = managersByGroup[group.id] ?? [];
    const amount = group.amount ?? 0;

    return {
      ...group,
      attendance_amount: countManagersInAttendance
        ? amount
        : Math.max(amount - managers.length, 0),
      managers,
    };
  });
}

type AttendanceRow = { user_id: string | null; status: string };

/**
 * Batched fetch of today's attendance rows for every group on the current page,
 * in a single query. Replaces the per-row client fetch the attendance cell used
 * to fire, which fanned out to ~2 reads per group and tripped the shared per-IP
 * edge read limit for centers with many staff behind one office IP.
 */
export async function fetchTodayAttendanceForGroups(
  sbAdmin: SupabaseClient,
  groupIds: string[],
  date: string
): Promise<Record<string, AttendanceRow[]>> {
  if (groupIds.length === 0 || !date) return {};

  const { data, error } = await sbAdmin
    .from('user_group_attendance')
    .select('group_id, user_id, status')
    .in('group_id', groupIds)
    .eq('date', date);

  if (error) {
    console.error('Error fetching group attendance:', error);
    return {};
  }

  const byGroup: Record<string, AttendanceRow[]> = {};
  for (const row of data ?? []) {
    if (!row.group_id) continue;
    const bucket = byGroup[row.group_id] ?? [];
    bucket.push({ user_id: row.user_id ?? null, status: row.status });
    byGroup[row.group_id] = bucket;
  }

  return byGroup;
}

/**
 * Folds the batched attendance rows into each group as a `today_attendance`
 * snapshot, mirroring exactly what the old per-row cell computed: managers are
 * excluded from the counts when they are not counted in attendance, and
 * `available` is derived from the group's sessions matching today's date.
 * Must run after {@link applyAttendanceMemberCounts} so `attendance_amount` and
 * `managers` are populated.
 */
export function applyTodayAttendanceSnapshot(
  groups: UserGroup[],
  attendanceByGroup: Record<string, AttendanceRow[]>,
  today: string
): UserGroup[] {
  return groups.map((group) => {
    const amount = group.amount ?? 0;
    const count = group.attendance_amount ?? amount;
    const shouldExcludeManagers =
      group.attendance_amount !== undefined &&
      group.attendance_amount !== amount;
    const excludedUserIds = shouldExcludeManagers
      ? new Set((group.managers ?? []).map((manager) => manager.id))
      : new Set<string>();

    const rows = (attendanceByGroup[group.id] ?? []).filter(
      (entry) => !entry.user_id || !excludedUserIds.has(entry.user_id)
    );
    const attended = rows.reduce(
      (acc, entry) => acc + (entry.status === 'PRESENT' ? 1 : 0),
      0
    );
    const absent = rows.reduce(
      (acc, entry) => acc + (entry.status === 'ABSENT' ? 1 : 0),
      0
    );
    const available = (group.sessions ?? []).some(
      (session) => typeof session === 'string' && session.startsWith(today)
    );

    return {
      ...group,
      today_attendance: { available, attended, absent, count },
    };
  });
}

export async function fetchManagersForGroups(
  supabase: SupabaseClient,
  groupIds: string[]
): Promise<Record<string, ManagerUser[]>> {
  if (groupIds.length === 0) return {};

  const toManagerUser = (user: {
    id?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
    display_name?: string | null;
    email?: string | null;
    platform_user_id?: string | null;
  }): ManagerUser | null => {
    if (!user.id) return null;
    return {
      id: user.id,
      full_name: user.full_name ?? null,
      avatar_url: user.avatar_url ?? null,
      display_name: user.display_name ?? null,
      email: user.email ?? null,
      hasLinkedPlatformUser: !!user.platform_user_id,
    };
  };

  const { data: managersData, error: managersError } = await supabase
    .from('workspace_user_groups_users')
    .select(
      'group_id, user:workspace_users!workspace_user_roles_users_user_id_fkey!inner(id, full_name, avatar_url, display_name, email, workspace_user_linked_users(platform_user_id))'
    )
    .in('group_id', groupIds)
    .eq('role', 'TEACHER');

  if (managersError) {
    console.error('Error fetching managers:', managersError);
    return {};
  }

  if (!managersData) return {};

  return managersData.reduce(
    (acc, item) => {
      if (!item.group_id) return acc;

      const groupId = item.group_id;
      if (!acc[groupId]) {
        acc[groupId] = [];
      }
      const groupManagers = acc[groupId];

      const users = Array.isArray(item.user)
        ? item.user
        : item.user
          ? [item.user]
          : [];

      users.forEach((user) => {
        if (!user) return;

        // Extract platform_user_id from the linked_users join
        const linkedUsers = user.workspace_user_linked_users;
        const platformUserId = linkedUsers
          ? Array.isArray(linkedUsers)
            ? linkedUsers[0]?.platform_user_id
            : (linkedUsers as { platform_user_id?: string }).platform_user_id
          : undefined;

        const userWithPlatformId = {
          id: user.id,
          full_name: user.full_name,
          avatar_url: user.avatar_url,
          display_name: user.display_name,
          email: user.email,
          platform_user_id: platformUserId,
        };

        const manager = toManagerUser(userWithPlatformId);
        if (manager) groupManagers.push(manager);
      });
      return acc;
    },
    {} as Record<string, ManagerUser[]>
  );
}
