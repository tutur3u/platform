import { useMemo } from 'react';
import type { UserGroup } from './utils';

export function mergeBillingSessionDates(
  userGroups: UserGroup[],
  scheduledSessionsByGroupId?: Record<string, string[]>
): UserGroup[] {
  return userGroups.map((membership) => {
    const group = membership.workspace_user_groups;
    if (!group) return membership;
    const planned = scheduledSessionsByGroupId?.[group.id] ?? [];
    if (planned.length === 0) return membership;
    const existing = Array.isArray(group.sessions) ? group.sessions : [];
    return {
      ...membership,
      workspace_user_groups: {
        ...group,
        sessions: Array.from(new Set([...existing, ...planned])),
      },
    };
  });
}

export function getGroupsWithScheduleIds(userGroups: UserGroup[]): string[] {
  return userGroups.flatMap(({ workspace_user_groups: group }) =>
    group?.id && Array.isArray(group.sessions) && group.sessions.length > 0
      ? [group.id]
      : []
  );
}

export function useSubscriptionBillingGroups(
  userGroups: UserGroup[],
  scheduledSessionsByGroupId?: Record<string, string[]>
) {
  const billingUserGroups = useMemo(
    () => mergeBillingSessionDates(userGroups, scheduledSessionsByGroupId),
    [scheduledSessionsByGroupId, userGroups]
  );
  const groupsWithScheduleIds = useMemo(
    () => getGroupsWithScheduleIds(userGroups),
    [userGroups]
  );
  return { billingUserGroups, groupsWithScheduleIds };
}
