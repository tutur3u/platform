import { describe, expect, it } from 'vitest';
import {
  formatCoverageRangeLabel,
  getAvailableMonths,
  getBillableAttendanceRecords,
  getBillableQuantityMapForGroupsRange,
  getBillableSessionsForGroups,
  getCoverageMonths,
  getCurrentMonthValue,
  getLinkedFinanceCategorySelection,
  getSubscriptionAttendanceDisplayData,
  getSubscriptionCoverageInvoiceForGroup,
  isSubscriptionMonthPaidForGroup,
  isSubscriptionRangeFullyPaidForGroups,
  resolveBillingTimezone,
  resolveSubscriptionInvoiceCategoryId,
  type UserGroup,
} from './utils';

const groupId = 'group-1';

const userGroups = [
  {
    workspace_user_groups: {
      id: groupId,
      name: 'Math 7',
      sessions: ['2026-03-05', '2026-03-20', '2026-03-25'],
      starting_date: '2026-03-01',
      ending_date: '2026-03-31',
    } as NonNullable<UserGroup['workspace_user_groups']>,
  },
] satisfies UserGroup[];

const attendance = [
  { group_id: groupId, date: '2026-03-05', status: 'PRESENT' },
  { group_id: groupId, date: '2026-03-20', status: 'LATE' },
  { group_id: groupId, date: '2026-03-25', status: 'ABSENT' },
];

describe('subscription invoice attendance display data', () => {
  it('uses full-month attendance and sessions for paid historical months', () => {
    const latestInvoices = [{ group_id: groupId, valid_until: '2026-04-01' }];
    const billableAttendance = getBillableAttendanceRecords(
      attendance,
      [groupId],
      '2026-03',
      latestInvoices
    );
    const billableSessions = getBillableSessionsForGroups(
      userGroups,
      [groupId],
      '2026-03',
      latestInvoices
    );
    const monthlyAttendance = getBillableAttendanceRecords(
      attendance,
      [groupId],
      '2026-03'
    );
    const monthlySessions = getBillableSessionsForGroups(
      userGroups,
      [groupId],
      '2026-03'
    );

    const result = getSubscriptionAttendanceDisplayData({
      isSelectedMonthPaid: true,
      billableAttendance,
      billableSessions,
      monthlyAttendance,
      monthlySessions,
    });

    expect(billableAttendance).toHaveLength(0);
    expect(billableSessions).toHaveLength(0);
    expect(result.displayAttendance.map((record) => record.date)).toEqual([
      '2026-03-05',
      '2026-03-20',
      '2026-03-25',
    ]);
    expect(result.displaySessions.map((session) => session.date)).toEqual([
      '2026-03-05',
      '2026-03-20',
      '2026-03-25',
    ]);
    expect(result.attendanceStats).toEqual({
      present: 1,
      late: 1,
      absent: 1,
      total: 3,
    });
    expect(result.totalSessions).toBe(3);
    expect(result.attendanceRate).toBeCloseTo(66.67, 2);
  });

  it('keeps billable-only attendance and sessions for unpaid months', () => {
    const latestInvoices = [{ group_id: groupId, valid_until: '2026-03-15' }];
    const billableAttendance = getBillableAttendanceRecords(
      attendance,
      [groupId],
      '2026-03',
      latestInvoices
    );
    const billableSessions = getBillableSessionsForGroups(
      userGroups,
      [groupId],
      '2026-03',
      latestInvoices
    );
    const monthlyAttendance = getBillableAttendanceRecords(
      attendance,
      [groupId],
      '2026-03'
    );
    const monthlySessions = getBillableSessionsForGroups(
      userGroups,
      [groupId],
      '2026-03'
    );

    const result = getSubscriptionAttendanceDisplayData({
      isSelectedMonthPaid: false,
      billableAttendance,
      billableSessions,
      monthlyAttendance,
      monthlySessions,
    });

    expect(result.displayAttendance.map((record) => record.date)).toEqual([
      '2026-03-20',
      '2026-03-25',
    ]);
    expect(result.displaySessions.map((session) => session.date)).toEqual([
      '2026-03-20',
      '2026-03-25',
    ]);
    expect(result.attendanceStats).toEqual({
      present: 0,
      late: 1,
      absent: 1,
      total: 2,
    });
    expect(result.totalSessions).toBe(2);
    expect(result.attendanceRate).toBe(50);
  });
});

describe('subscription invoice coverage', () => {
  it('builds coverage months and labels multi-month ranges', () => {
    expect(getCoverageMonths('2026-06', 3)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
    ]);
    expect(
      formatCoverageRangeLabel({
        locale: 'en-US',
        prepaidMonthCount: 3,
        selectedMonth: '2026-06',
      })
    ).toBe('June 2026 - August 2026');
  });

  it('treats valid_until as the exclusive first unpaid month', () => {
    const latestInvoices = [{ group_id: groupId, valid_until: '2026-06-01' }];

    expect(
      isSubscriptionMonthPaidForGroup(groupId, '2026-05', latestInvoices)
    ).toBe(true);
    expect(
      isSubscriptionMonthPaidForGroup(groupId, '2026-06', latestInvoices)
    ).toBe(false);
  });

  it('treats timestamp valid_until values as civil invoice months', () => {
    const latestInvoices = [
      { group_id: groupId, valid_until: '2026-07-01T00:00:00.000Z' },
    ];

    expect(
      isSubscriptionMonthPaidForGroup(groupId, '2026-06', latestInvoices)
    ).toBe(true);
    expect(
      isSubscriptionMonthPaidForGroup(groupId, '2026-07', latestInvoices)
    ).toBe(false);
  });

  it('treats null and invalid valid_until values as unpaid', () => {
    expect(
      isSubscriptionMonthPaidForGroup(groupId, '2026-05', [
        { group_id: groupId, valid_until: null },
      ])
    ).toBe(false);
    expect(
      isSubscriptionMonthPaidForGroup(groupId, '2026-05', [
        { group_id: groupId, valid_until: 'not-a-date' },
      ])
    ).toBe(false);
  });

  it('uses the furthest valid_until over the newest created_at', () => {
    const latestInvoices = [
      {
        created_at: '2026-06-10T00:00:00.000Z',
        group_id: groupId,
        valid_until: '2026-06-01',
      },
      {
        created_at: '2026-05-10T00:00:00.000Z',
        group_id: groupId,
        valid_until: '2026-07-01',
      },
    ];

    expect(
      getSubscriptionCoverageInvoiceForGroup(latestInvoices, groupId)
    ).toEqual(latestInvoices[1]);
    expect(
      isSubscriptionMonthPaidForGroup(groupId, '2026-06', latestInvoices)
    ).toBe(true);
  });

  it('requires every coverage month to be paid before marking a range paid', () => {
    expect(
      isSubscriptionRangeFullyPaidForGroups([groupId], '2026-06', 3, [
        { group_id: groupId, valid_until: '2026-08-01' },
      ])
    ).toBe(false);
    expect(
      isSubscriptionRangeFullyPaidForGroups([groupId], '2026-06', 3, [
        { group_id: groupId, valid_until: '2026-09-01' },
      ])
    ).toBe(true);
  });

  it('generates prepaid future month options capped by group ending dates', () => {
    const groups = [
      {
        workspace_user_groups: {
          id: groupId,
          name: 'Math 7',
          sessions: ['2026-06-05', '2026-07-05', '2026-08-05'],
          starting_date: '2026-06-01',
          ending_date: '2026-08-31',
        } as NonNullable<UserGroup['workspace_user_groups']>,
      },
    ] satisfies UserGroup[];

    expect(
      getAvailableMonths(groups, [groupId], [], 'en-US', '2026-06', 12).map(
        (month) => month.value
      )
    ).toEqual(['2026-06', '2026-07', '2026-08']);
  });

  it('skips paid months and uses scheduled sessions for future prepaid quantities', () => {
    const groups = [
      {
        workspace_user_groups: {
          id: groupId,
          name: 'Math 7',
          sessions: ['2026-06-05', '2026-07-05', '2026-08-05'],
          starting_date: '2026-06-01',
          ending_date: null,
        } as NonNullable<UserGroup['workspace_user_groups']>,
      },
    ] satisfies UserGroup[];

    expect(
      getBillableQuantityMapForGroupsRange({
        groupIds: [groupId],
        latestInvoices: [{ group_id: groupId, valid_until: '2026-07-01' }],
        now: new Date(2026, 5, 15),
        prepaidMonthCount: 3,
        selectedMonth: '2026-06',
        useAttendanceBased: true,
        userAttendance: [
          { group_id: groupId, date: '2026-06-05', status: 'PRESENT' },
        ],
        userGroups: groups,
      })
    ).toEqual({ [groupId]: 2 });
  });

  it('uses workspace timezone, not browser timezone, for current-month recommendations', () => {
    const groups = [
      {
        workspace_user_groups: {
          id: groupId,
          name: 'Math 7',
          sessions: ['2026-07-05'],
          starting_date: '2026-07-01',
          ending_date: null,
        } as NonNullable<UserGroup['workspace_user_groups']>,
      },
    ] satisfies UserGroup[];
    const now = new Date('2026-06-30T18:00:00.000Z');

    expect(getCurrentMonthValue('UTC', now)).toBe('2026-06');
    expect(getCurrentMonthValue('Asia/Ho_Chi_Minh', now)).toBe('2026-07');
    expect(getCurrentMonthValue('America/Los_Angeles', now)).toBe('2026-06');
    expect(resolveBillingTimezone('auto')).toBe('UTC');
    expect(resolveBillingTimezone('Not/A_Timezone')).toBe('UTC');

    expect(
      getBillableQuantityMapForGroupsRange({
        groupIds: [groupId],
        now,
        selectedMonth: '2026-07',
        useAttendanceBased: true,
        userAttendance: [],
        userGroups: groups,
        workspaceTimezone: 'Asia/Ho_Chi_Minh',
      })
    ).toEqual({ [groupId]: 0 });
    expect(
      getBillableQuantityMapForGroupsRange({
        groupIds: [groupId],
        now,
        selectedMonth: '2026-07',
        useAttendanceBased: true,
        userAttendance: [],
        userGroups: groups,
        workspaceTimezone: 'America/Los_Angeles',
      })
    ).toEqual({ [groupId]: 1 });
  });
});

describe('linked finance category selection', () => {
  it('returns the single linked finance category across selected products', () => {
    expect(
      getLinkedFinanceCategorySelection([
        { product: { finance_category_id: 'category-1' } },
        { product: { finance_category_id: 'category-1' } },
        { product: { finance_category_id: null } },
      ])
    ).toEqual({
      categoryId: 'category-1',
      hasMixedCategories: false,
      hasSingleCategory: true,
    });
  });

  it('marks mixed linked finance categories for manual selection', () => {
    expect(
      getLinkedFinanceCategorySelection([
        { product: { finance_category_id: 'category-1' } },
        { product: { finance_category_id: 'category-2' } },
      ])
    ).toEqual({
      categoryId: null,
      hasMixedCategories: true,
      hasSingleCategory: false,
    });
  });

  it('resolves subscription checkout category precedence', () => {
    expect(
      resolveSubscriptionInvoiceCategoryId({
        defaultCategoryId: 'category-default',
        items: [{ product: { finance_category_id: 'category-linked' } }],
      })
    ).toBe('category-linked');
    expect(
      resolveSubscriptionInvoiceCategoryId({
        defaultCategoryId: 'category-default',
        items: [
          { product: { finance_category_id: 'category-a' } },
          { product: { finance_category_id: 'category-b' } },
        ],
      })
    ).toBe('');
    expect(
      resolveSubscriptionInvoiceCategoryId({
        defaultCategoryId: 'category-default',
        items: [{ product: { finance_category_id: null } }],
      })
    ).toBe('category-default');
  });
});
