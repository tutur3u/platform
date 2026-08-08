import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import {
  applyAttendanceMemberCounts,
  applyTodayAttendanceSnapshot,
  fetchManagersForGroups,
  fetchTodayAttendanceForGroups,
  getShouldCountManagersInAttendance,
  getUserGroupMembershipsForActor,
} from '@tuturuuu/users-core/lib/user-groups/groups-utils';
import {
  countUserGroupsForTable,
  listUserGroupsForTable,
} from '@tuturuuu/users-core/lib/user-groups/table-repository';

export type UserGroupStatusFilter = 'all' | 'active' | 'archived';

export async function loadInitialUserGroups({
  actorId,
  hasManageUsers = false,
  page = '1',
  pageSize = '50',
  q,
  status = 'active',
  wsId,
}: {
  actorId: string;
  hasManageUsers?: boolean;
  page?: string;
  pageSize?: string;
  q?: string;
  status?: UserGroupStatusFilter;
  wsId: string;
}) {
  try {
    const sbAdmin = await createAdminClient();
    let accessibleGroupIds: string[] | null = null;

    if (!hasManageUsers) {
      const groupIds = await getUserGroupMembershipsForActor(wsId, actorId);
      if (groupIds.length === 0) return { data: [], count: 0 };
      accessibleGroupIds = groupIds;
    }

    const parsedPage = Number.parseInt(page, 10);
    const parsedSize = Number.parseInt(pageSize, 10);
    const validPage =
      !Number.isNaN(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const validPageSize = Math.min(
      !Number.isNaN(parsedSize) && parsedSize > 0 ? parsedSize : 10,
      100
    );

    const [fetchedGroups, filteredCount] = await Promise.all([
      listUserGroupsForTable({
        accessibleGroupIds,
        client: sbAdmin,
        page: validPage,
        pageSize: validPageSize,
        q,
        status,
        wsId,
      }),
      countUserGroupsForTable({
        accessibleGroupIds,
        client: sbAdmin,
        q,
        status,
        wsId,
      }),
    ]);

    let groups = fetchedGroups as UserGroup[];
    if (groups.length > 0) {
      const groupIds = groups.map((group) => group.id);
      const today = new Date().toISOString().split('T')[0] ?? '';
      const [managersByGroup, countManagers, attendanceByGroup] =
        await Promise.all([
          fetchManagersForGroups(sbAdmin, groupIds),
          getShouldCountManagersInAttendance(wsId),
          fetchTodayAttendanceForGroups(sbAdmin, groupIds, today),
        ]);

      groups = applyAttendanceMemberCounts(
        groups,
        managersByGroup,
        countManagers
      );
      groups = applyTodayAttendanceSnapshot(groups, attendanceByGroup, today);
    }

    return { data: groups, count: filteredCount };
  } catch (error) {
    console.error('Error fetching initial user groups:', error);
    return undefined;
  }
}
