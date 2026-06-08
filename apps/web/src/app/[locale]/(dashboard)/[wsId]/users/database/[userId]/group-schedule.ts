import type { UserGroupMembership } from './types';

export function hasScheduledSessions(
  group: Pick<UserGroupMembership, 'sessions'>
) {
  return Array.isArray(group.sessions) && group.sessions.length > 0;
}

export function partitionUserGroupsBySchedule(
  groups: UserGroupMembership[] | null | undefined
) {
  const scheduledGroups: UserGroupMembership[] = [];
  const unscheduledGroups: UserGroupMembership[] = [];
  let scheduledSessionCount = 0;

  for (const group of groups ?? []) {
    if (hasScheduledSessions(group)) {
      scheduledGroups.push(group);
      scheduledSessionCount += group.sessions?.length ?? 0;
      continue;
    }

    unscheduledGroups.push(group);
  }

  return {
    scheduledGroups,
    unscheduledGroups,
    scheduledSessionCount,
  };
}
