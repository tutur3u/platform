import { useMemo } from 'react';
import {
  getCoverageMonths,
  getCoverageValidUntilMonthValue,
} from './civil-month';
import type { UserGroup } from './utils';

export type BillingScheduleWindow = { startDate: string; endDate: string };
export function getBillingScheduleWindow(
  month: string,
  monthCount = 1
): BillingScheduleWindow | undefined {
  const months = getCoverageMonths(month, monthCount);
  if (!months.length) return undefined;
  return {
    startDate: `${months[0]}-01`,
    endDate: `${getCoverageValidUntilMonthValue(month, months.length)}-01`,
  };
}

export function mergeBillingSessionDates(
  userGroups: UserGroup[],
  scheduledSessionsByGroupId?: Record<string, string[]>,
  window?: BillingScheduleWindow
): UserGroup[] {
  return userGroups.map((membership) => {
    const group = membership.workspace_user_groups;
    if (!group) return membership;
    const response = scheduledSessionsByGroupId?.[group.id];
    const planned = Array.isArray(response) ? response : [];
    const authoritative =
      !!window &&
      !!scheduledSessionsByGroupId &&
      Object.hasOwn(scheduledSessionsByGroupId, group.id) &&
      Array.isArray(scheduledSessionsByGroupId[group.id]);
    if (!authoritative && planned.length === 0) return membership;
    const existing = Array.isArray(group.sessions) ? group.sessions : [];
    return {
      ...membership,
      workspace_user_groups: {
        ...group,
        sessions: Array.from(
          new Set(
            authoritative
              ? [
                  ...existing.filter(
                    (date) =>
                      date < window!.startDate || date >= window!.endDate
                  ),
                  ...planned.filter(
                    (date) =>
                      date >= window!.startDate && date < window!.endDate
                  ),
                ]
              : [...existing, ...planned]
          )
        ).sort(),
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
  scheduledSessionsByGroupId?: Record<string, string[]>,
  window?: BillingScheduleWindow
) {
  const billingUserGroups = useMemo(
    () =>
      mergeBillingSessionDates(userGroups, scheduledSessionsByGroupId, window),
    [scheduledSessionsByGroupId, userGroups, window]
  );
  const groupsWithScheduleIds = useMemo(
    () => getGroupsWithScheduleIds(billingUserGroups),
    [billingUserGroups]
  );
  return { billingUserGroups, groupsWithScheduleIds };
}
