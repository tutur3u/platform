import { describe, expect, it } from 'vitest';
import {
  getBillableAttendanceRecords,
  getBillableSessionsForGroups,
  getSubscriptionAttendanceDisplayData,
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
