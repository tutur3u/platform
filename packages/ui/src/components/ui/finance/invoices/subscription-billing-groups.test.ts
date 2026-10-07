import { describe, expect, it } from 'vitest';
import {
  getBillingScheduleWindow,
  mergeBillingSessionDates,
} from './subscription-billing-groups';
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

describe('bounded authoritative schedule responses', () => {
  const groupId = 'bounded-class';
  const window = { startDate: '2026-09-01', endDate: '2026-10-01' };
  const groups: UserGroup[] = [
    {
      workspace_user_groups: {
        id: groupId,
        name: 'Synthetic class',
        // Dates outside the requested September window are historical data.
        sessions: ['2026-08-31', '2026-09-06', '2026-10-04'],
      } as NonNullable<UserGroup['workspace_user_groups']>,
    },
  ];
  const quantity = (userGroups: UserGroup[]) =>
    getBillableQuantityForGroupRange({
      groupId,
      userGroups,
      selectedMonth: '2026-09',
      useAttendanceBased: false,
      userAttendance: [],
      now: new Date('2026-09-15T12:00:00Z'),
      workspaceTimezone: 'Asia/Ho_Chi_Minh',
    });

  it('does not bill a removed same-window date from a nonempty authoritative response', () => {
    // The context route queried [2026-09-01, 2026-10-01). September 6 is
    // absent from its scheduled/cancellation-aware result, not extra billing.
    const merged = mergeBillingSessionDates(
      groups,
      {
        [groupId]: ['2026-09-05', '2026-09-12'],
      },
      window
    );
    expect(quantity(merged)).toBe(2);
    expect(merged[0]?.workspace_user_groups?.sessions).toEqual([
      '2026-08-31',
      '2026-09-05',
      '2026-09-12',
      '2026-10-04',
    ]);
    expect(groups[0]?.workspace_user_groups?.sessions).toEqual([
      '2026-08-31',
      '2026-09-06',
      '2026-10-04',
    ]);
  });

  it('accepts an authoritative empty window without deleting historical dates', () => {
    const merged = mergeBillingSessionDates(groups, { [groupId]: [] }, window);
    expect(quantity(merged)).toBe(0);
    expect(merged[0]?.workspace_user_groups?.sessions).toEqual([
      '2026-08-31',
      '2026-10-04',
    ]);
  });

  it('retains legacy dates when no authoritative response has arrived', () => {
    const merged = mergeBillingSessionDates(groups, undefined, window);
    expect(quantity(merged)).toBe(1);
    expect(merged[0]).toBe(groups[0]);
  });

  it('does not crash or acquire authority from a malformed non-array group receipt', () => {
    const merged = mergeBillingSessionDates(
      groups,
      { [groupId]: {} } as unknown as Record<string, string[]>,
      window
    );
    expect(quantity(merged)).toBe(1);
    expect(merged[0]).toBe(groups[0]);
  });

  it('does not treat a missing group key as an authoritative empty result', () => {
    const merged = mergeBillingSessionDates(groups, {}, window);
    expect(quantity(merged)).toBe(1);
    expect(merged[0]).toBe(groups[0]);
  });
});

describe('prepaid civil authority boundaries', () => {
  it.each([
    ['2026-12', 2, '2027-02-01'],
    ['2026-01', 12, '2027-01-01'],
    ['2026-01', 0, '2026-02-01'],
    ['2026-01', 99, '2027-01-01'],
  ] as const)('bounds %s for %i prepaid months', (month, count, endDate) => {
    expect(getBillingScheduleWindow(month, count)).toEqual({
      startDate: `${month}-01`,
      endDate,
    });
  });
  it('rejects an invalid civil month', () => {
    expect(getBillingScheduleWindow('2026-13', 2)).toBeUndefined();
  });
  it('limits authoritative replacements and incoming dates to the prepaid year-crossing window', () => {
    const window = getBillingScheduleWindow('2026-12', 2)!;
    const groups = [
      {
        workspace_user_groups: {
          id: 'g',
          sessions: ['2026-11-30', '2026-12-06', '2027-01-03', '2027-02-01'],
        } as NonNullable<UserGroup['workspace_user_groups']>,
      },
    ];
    const merged = mergeBillingSessionDates(
      groups,
      {
        g: [
          '2026-11-29',
          '2026-12-05',
          '2027-01-02',
          '2027-01-02',
          '2027-02-02',
        ],
      },
      window
    );
    expect(merged[0]?.workspace_user_groups?.sessions).toEqual([
      '2026-11-30',
      '2026-12-05',
      '2027-01-02',
      '2027-02-01',
    ]);
    for (const workspaceTimezone of [
      'Pacific/Honolulu',
      'Asia/Ho_Chi_Minh',
      'Pacific/Kiritimati',
    ]) {
      expect(
        getBillableQuantityForGroupRange({
          groupId: 'g',
          userGroups: merged,
          selectedMonth: '2026-12',
          prepaidMonthCount: 2,
          useAttendanceBased: false,
          userAttendance: [],
          workspaceTimezone,
          now: new Date('2026-12-31T15:00:00Z'),
        })
      ).toBe(2);
      expect(
        getBillableQuantityForGroupRange({
          groupId: 'g',
          userGroups: merged,
          selectedMonth: '2026-12',
          prepaidMonthCount: 2,
          useAttendanceBased: false,
          userAttendance: [],
          workspaceTimezone,
          latestInvoices: [{ group_id: 'g', covered_months: ['2027-01-01'] }],
          now: new Date('2026-12-31T15:00:00Z'),
        })
      ).toBe(1);
    }
  });
});
