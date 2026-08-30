import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import {
  attendanceSessionsQueryKey,
  buildAttendanceMap,
  filterAttendanceSessions,
  getAttendanceMonth,
} from './group-attendance-utils';

const rows = [
  {
    notes: 'Legacy note',
    session_id: null,
    status: 'ABSENT',
    user_id: 'student-1',
  },
  {
    notes: 'Session note',
    session_id: 'session-1',
    status: 'PRESENT',
    user_id: 'student-1',
  },
];

function session(
  id: string,
  startsAt: string,
  status: WorkspaceUserGroupSession['status'] = 'scheduled',
  startTimezone = 'Asia/Ho_Chi_Minh'
): WorkspaceUserGroupSession {
  return {
    description: null,
    descriptionJson: null,
    endTimezone: startTimezone,
    endsAt: new Date(
      new Date(startsAt).getTime() + 60 * 60 * 1000
    ).toISOString(),
    files: [],
    groupId: 'group-1',
    groupName: 'Group 1',
    id,
    recurrenceInstanceDate: startsAt.slice(0, 10),
    seriesId: 'series-1',
    source: 'test',
    startTimezone,
    startsAt,
    status,
    tags: [],
    title: null,
  };
}

describe('group attendance state helpers', () => {
  it('uses legacy attendance when no session is selected', () => {
    expect(buildAttendanceMap(rows)).toEqual({
      'student-1': { note: 'Legacy note', status: 'ABSENT' },
    });
  });

  it('deterministically overlays selected-session history on legacy rows', () => {
    expect(buildAttendanceMap([...rows].reverse(), 'session-1')).toEqual({
      'student-1': { note: 'Session note', status: 'PRESENT' },
    });
  });

  it('keeps an August attendance date synchronized to the August month', () => {
    expect(getAttendanceMonth(new Date(2026, 7, 3))).toEqual(
      new Date(2026, 7, 1)
    );
  });

  it('hides cancelled future occurrences left behind by a schedule update', () => {
    const asOf = new Date('2026-08-19T03:00:00.000Z');
    const sessions = [
      session('past-cancelled', '2026-08-13T12:30:00.000Z', 'cancelled'),
      session('today-cancelled', '2026-08-19T12:30:00.000Z', 'cancelled'),
      session('future-cancelled', '2026-08-20T00:00:00.000Z', 'cancelled'),
      session('future-scheduled', '2026-08-20T12:30:00.000Z'),
    ];

    expect(
      filterAttendanceSessions(sessions, asOf).map(({ id }) => id)
    ).toEqual(['past-cancelled', 'today-cancelled', 'future-scheduled']);
  });

  it('keeps superseded cancellations hidden after their calendar date passes', () => {
    const superseded = session(
      'superseded-cancelled',
      '2026-08-30T10:30:00.000Z',
      'cancelled'
    );
    superseded.recurrence = {
      daysOfWeek: [0, 6],
      intervalWeeks: 1,
      startDate: '2026-07-01',
      untilDate: '2026-08-21',
    };
    superseded.recurrenceInstanceDate = '2026-08-30';

    const historical = session(
      'historical-cancelled',
      '2026-08-20T10:30:00.000Z',
      'cancelled'
    );
    historical.recurrence = {
      daysOfWeek: [4],
      intervalWeeks: 1,
      startDate: '2026-07-01',
      untilDate: '2026-08-21',
    };
    historical.recurrenceInstanceDate = '2026-08-20';

    expect(
      filterAttendanceSessions(
        [superseded, historical],
        new Date('2026-08-30T12:00:00.000Z')
      ).map(({ id }) => id)
    ).toEqual(['historical-cancelled']);
  });

  it('uses each session timezone when deciding whether a cancellation is historical', () => {
    const asOf = new Date('2026-08-20T00:30:00.000Z');
    const sessions = [
      session(
        'los-angeles-today',
        '2026-08-20T06:00:00.000Z',
        'cancelled',
        'America/Los_Angeles'
      ),
      session(
        'los-angeles-tomorrow',
        '2026-08-21T06:00:00.000Z',
        'cancelled',
        'America/Los_Angeles'
      ),
    ];

    expect(
      filterAttendanceSessions(sessions, asOf).map(({ id }) => id)
    ).toEqual(['los-angeles-today']);
  });

  it('does not mutate or reorder the supplied session list', () => {
    const asOf = new Date('2026-08-19T03:00:00.000Z');
    const sessions = [
      session('scheduled', '2026-08-27T12:30:00.000Z'),
      session('cancelled', '2026-08-27T00:00:00.000Z', 'cancelled'),
    ];

    const filtered = filterAttendanceSessions(sessions, asOf);

    expect(filtered.map(({ id }) => id)).toEqual(['scheduled']);
    expect(sessions.map(({ id }) => id)).toEqual(['scheduled', 'cancelled']);
  });

  it('uses the shared schedule cache prefix so schedule mutations refresh attendance', () => {
    expect(
      attendanceSessionsQueryKey('ws-1', 'group-1', {
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-09-01T00:00:00.000Z',
      })
    ).toEqual([
      'workspace-user-group-sessions',
      'ws-1',
      'attendance',
      'group-1',
      '2026-08-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z',
    ]);
  });
});
