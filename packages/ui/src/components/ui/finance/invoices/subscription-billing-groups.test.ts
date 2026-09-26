import { describe, expect, it } from 'vitest';
import { mergeBillingSessionDates } from './subscription-billing-groups';
import { getBillableQuantityForGroupRange, type UserGroup } from './utils';

describe('subscription billing session dates', () => {
  it('uses projected classes for scheduled billing when older materialized dates stop before the invoice month', () => {
    const groupId = 'group-1';
    const groups = [
      {
        workspace_user_groups: {
          id: groupId,
          name: 'Class 7',
          sessions: ['2026-05-30'],
        } as NonNullable<UserGroup['workspace_user_groups']>,
      },
    ];
    const planned = [
      '2026-09-05',
      '2026-09-12',
      '2026-09-13',
      '2026-09-19',
      '2026-09-20',
      '2026-09-26',
      '2026-09-27',
    ];
    const billingGroups = mergeBillingSessionDates(groups, {
      [groupId]: planned,
    });

    expect(groups[0]?.workspace_user_groups?.sessions).toEqual(['2026-05-30']);
    expect(
      getBillableQuantityForGroupRange({
        groupId,
        now: new Date('2026-09-26T10:00:00.000Z'),
        selectedMonth: '2026-09',
        useAttendanceBased: false,
        userAttendance: [
          { date: '2026-09-20', group_id: groupId, status: 'PRESENT' },
          { date: '2026-09-26', group_id: groupId, status: 'PRESENT' },
        ],
        userGroups: billingGroups,
        workspaceTimezone: 'Asia/Ho_Chi_Minh',
      })
    ).toBe(7);
  });
});
