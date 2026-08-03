import { describe, expect, it } from 'vitest';
import {
  buildAttendanceMap,
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
});
