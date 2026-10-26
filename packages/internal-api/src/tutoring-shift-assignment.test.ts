import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import {
  carryTutoringShiftAssignments,
  EASY_CENTER_TUTORING_POLICY,
  getAssignedTutoringShift,
  parseTutoringPolicy,
  readTutoringPolicyConfigRows,
  STANDARD_TUTORING_POLICY,
  serializeTutoringPolicyConfigRows,
} from './tutoring-policy';
import {
  buildShiftRuleSessions,
  suggestTutoringSlots,
} from './tutoring-suggestion';

const GROUP = '11111111-1111-4111-8111-111111111111';
// Monday 2026-10-26 18:00 in Asia/Ho_Chi_Minh.
const now = new Date('2026-10-26T11:00:00Z');

/** Legacy calendar dates were imported at a 07:00 local placeholder. */
function placeholder(date: string) {
  return {
    groupId: GROUP,
    startTimezone: 'Asia/Ho_Chi_Minh',
    startsAt: `${date}T00:00:00Z`,
    status: 'scheduled',
  } as WorkspaceUserGroupSession;
}

const assigned = (label: string) => ({
  ...EASY_CENTER_TUTORING_POLICY,
  shiftByGroupId: { [GROUP]: label },
});

describe('group shift assignment policy', () => {
  it('stores assignments and the class window without invalidating renamed shifts', () => {
    const policy = parseTutoringPolicy({
      ...EASY_CENTER_TUTORING_POLICY,
      shiftByGroupId: { [GROUP]: 'Renamed shift' },
    });
    expect(policy?.shiftByGroupId).toEqual({ [GROUP]: 'Renamed shift' });
    expect(policy && getAssignedTutoringShift(policy, GROUP)).toBeNull();
    expect(
      policy?.timeRules.find((rule) => rule.label === 'Shift 1')
    ).toMatchObject({
      classEndTime: '19:30',
      classWeekdays: [1, 3, 5],
      weekdays: [3, 5],
    });
  });

  it('defaults older saved policies to no assignments', () => {
    const { shiftByGroupId: _, ...saved } = STANDARD_TUTORING_POLICY;
    expect(parseTutoringPolicy(saved)?.shiftByGroupId).toEqual({});
  });

  it('rejects malformed assignments and class windows', () => {
    expect(
      parseTutoringPolicy({
        ...STANDARD_TUTORING_POLICY,
        shiftByGroupId: { 'not-a-group': 'Shift 1' },
      })
    ).toBeNull();
    expect(
      parseTutoringPolicy({
        ...STANDARD_TUTORING_POLICY,
        timeRules: [
          {
            weekdays: [1],
            classStartTime: '18:00',
            classEndTime: '25:00',
            tutoringStartTime: '17:15',
            durationMinutes: 45,
          },
        ],
      })
    ).toBeNull();
  });

  it('round-trips assignments through chunked workspace config rows', () => {
    const policy = assigned('Shift 2');
    expect(
      readTutoringPolicyConfigRows(serializeTutoringPolicyConfigRows(policy))
        .shiftByGroupId
    ).toEqual({ [GROUP]: 'Shift 2' });
  });
});

describe('English center weekend evening shift', () => {
  it('places 45 minutes before a Saturday 19:00 class (Shift 8)', () => {
    expect(
      suggestTutoringSlots(
        [
          {
            groupId: GROUP,
            startTimezone: 'Asia/Ho_Chi_Minh',
            startsAt: '2026-10-31T12:00:00Z',
            status: 'scheduled',
          } as WorkspaceUserGroupSession,
        ],
        '2026-10-25',
        1,
        EASY_CENTER_TUTORING_POLICY,
        'separate',
        now
      )
    ).toEqual([
      {
        classStartsAt: '19:00',
        durationMinutes: 45,
        sessionDate: '2026-10-31',
        startTime: '18:15',
      },
    ]);
  });
});

describe('carrying assignments across shift renames', () => {
  const rules = EASY_CENTER_TUTORING_POLICY.timeRules;
  const labels = rules.map((rule) => rule.label);

  it('moves groups to the renamed shift', () => {
    const renamed = rules.map((rule) =>
      rule.label === 'Shift 2' ? { ...rule, label: 'Ca 2' } : rule
    );
    expect(
      carryTutoringShiftAssignments({ [GROUP]: 'Shift 2' }, labels, renamed)
    ).toEqual({ assignments: { [GROUP]: 'Ca 2' }, orphaned: 0 });
  });

  it('keeps groups on a label another rule still uses', () => {
    const renamed = rules.map((rule) =>
      rule.label === 'Shift 2' ? { ...rule, label: 'Shift 1' } : rule
    );
    expect(
      carryTutoringShiftAssignments({ [GROUP]: 'Shift 1' }, labels, renamed)
        .assignments
    ).toEqual({ [GROUP]: 'Shift 1' });
  });

  it('counts groups left on a removed shift', () => {
    expect(
      carryTutoringShiftAssignments(
        { [GROUP]: 'Shift 2' },
        labels.filter((label) => label !== 'Shift 2'),
        rules.filter((rule) => rule.label !== 'Shift 2')
      )
    ).toEqual({ assignments: { [GROUP]: 'Shift 2' }, orphaned: 1 });
  });
});

describe('shift-assigned make-up suggestions', () => {
  const calendar = ['2026-10-28', '2026-10-30', '2026-11-02', '2026-11-04'].map(
    placeholder
  );

  it('ignores placeholder class times and skips Monday for Shift 1', () => {
    expect(
      suggestTutoringSlots(
        calendar,
        '2026-10-05',
        3,
        assigned('Shift 1'),
        'separate',
        now
      )
    ).toEqual([
      expect.objectContaining({
        sessionDate: '2026-10-28',
        startTime: '17:15',
      }),
      expect.objectContaining({
        sessionDate: '2026-10-30',
        startTime: '17:15',
      }),
      expect.objectContaining({
        sessionDate: '2026-11-04',
        startTime: '17:15',
      }),
    ]);
  });

  it('suggests one slot per date when placeholder times differ', () => {
    const sameDay = {
      ...placeholder('2026-10-28'),
      startsAt: '2026-10-28T00:30:00Z',
    };
    expect(
      suggestTutoringSlots(
        [placeholder('2026-10-28'), sameDay, placeholder('2026-10-30')],
        '2026-10-05',
        2,
        assigned('Shift 1'),
        'separate',
        now
      ).map((slot) => slot.sessionDate)
    ).toEqual(['2026-10-28', '2026-10-30']);
  });

  it('finds nothing for placeholder times without an assignment', () => {
    expect(
      suggestTutoringSlots(
        calendar,
        '2026-10-05',
        3,
        EASY_CENTER_TUTORING_POLICY,
        'separate',
        now
      )
    ).toEqual([]);
  });

  it('keeps the after-class weekend shift after the real class start', () => {
    expect(
      suggestTutoringSlots(
        [placeholder('2026-10-31')],
        '2026-10-25',
        2,
        assigned('Shift 4'),
        'consecutive',
        now
      )
    ).toMatchObject([
      { sessionDate: '2026-10-31', startTime: '09:30', classStartsAt: '08:00' },
      { sessionDate: '2026-10-31', startTime: '10:30' },
    ]);
  });

  it('derives classes from the assigned shift when the calendar is empty', () => {
    const sessions = buildShiftRuleSessions({
      days: 6,
      fromDate: '2026-10-26',
      groupId: GROUP,
      policy: assigned('Shift 2'),
    });
    expect(sessions.map((session) => session.startsAt)).toEqual([
      '2026-10-27T11:00:00.000Z',
      '2026-10-29T11:00:00.000Z',
    ]);
    expect(sessions[0]).toMatchObject({
      endsAt: '2026-10-27T12:30:00.000Z',
      source: 'tutoring_shift_rule',
      status: 'scheduled',
    });
    expect(
      suggestTutoringSlots(
        sessions,
        '2026-10-26',
        1,
        assigned('Shift 2'),
        'separate',
        now
      )
    ).toMatchObject([{ sessionDate: '2026-10-27', startTime: '17:15' }]);
  });

  it('derives nothing for an unassigned group', () => {
    expect(
      buildShiftRuleSessions({
        days: 14,
        fromDate: '2026-10-26',
        groupId: GROUP,
        policy: EASY_CENTER_TUTORING_POLICY,
      })
    ).toEqual([]);
  });
});
