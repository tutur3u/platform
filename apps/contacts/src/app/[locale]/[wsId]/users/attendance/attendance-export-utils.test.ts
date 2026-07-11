import type { WorkspaceAttendanceExportRecord } from '@tuturuuu/internal-api/users';
import { describe, expect, it } from 'vitest';
import {
  buildAttendanceExportFilename,
  toAttendanceExportRows,
} from './attendance-export-utils';

const labels = {
  columns: {
    date: 'Date',
    userName: 'User',
    email: 'Email',
    group: 'Group',
    status: 'Status',
    notes: 'Notes',
    userId: 'User ID',
    groupId: 'Group ID',
  },
  statuses: {
    absent: 'Absent',
    late: 'Late',
    present: 'Present',
    unknown: 'Unknown',
  },
};

describe('attendance export utils', () => {
  it('builds a predictable filename', () => {
    expect(
      buildAttendanceExportFilename('2026-04-01', '2026-04-30', 'excel')
    ).toBe('attendance_2026-04-01_to_2026-04-30.xlsx');
  });

  it('maps and sorts export rows', () => {
    const records: WorkspaceAttendanceExportRecord[] = [
      {
        date: '2026-04-10',
        groupId: 'group-b',
        groupName: 'Beta',
        notes: '',
        status: 'ABSENT',
        userDisplayName: null,
        userEmail: null,
        userFullName: null,
        userId: 'user-b',
        userName: 'Bao',
      },
      {
        date: '2026-04-09',
        groupId: 'group-a',
        groupName: 'Alpha',
        notes: 'Arrived late',
        status: 'LATE',
        userDisplayName: null,
        userEmail: 'an@example.com',
        userFullName: null,
        userId: 'user-a',
        userName: 'An',
      },
    ];

    expect(toAttendanceExportRows(records, labels)).toEqual([
      {
        Date: '2026-04-09',
        Email: 'an@example.com',
        Group: 'Alpha',
        'Group ID': 'group-a',
        Notes: 'Arrived late',
        Status: 'Late',
        User: 'An',
        'User ID': 'user-a',
      },
      {
        Date: '2026-04-10',
        Email: '',
        Group: 'Beta',
        'Group ID': 'group-b',
        Notes: '',
        Status: 'Absent',
        User: 'Bao',
        'User ID': 'user-b',
      },
    ]);
  });
});
