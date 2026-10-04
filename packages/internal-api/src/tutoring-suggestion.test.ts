import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import {
  EASY_CENTER_TUTORING_POLICY,
  parseTutoringPolicy,
  renderTutoringParentMessage,
  STANDARD_TUTORING_POLICY,
} from './tutoring-policy';
import {
  suggestTutoringBeforeNextClass,
  suggestTutoringSlots,
} from './tutoring-suggestion';

function session(
  startsAt: string,
  status: 'scheduled' | 'cancelled' = 'scheduled'
) {
  return {
    startTimezone: 'Asia/Ho_Chi_Minh',
    startsAt,
    status,
  } as WorkspaceUserGroupSession;
}

describe('next-class tutoring suggestion', () => {
  const now = new Date('2026-09-25T00:00:00Z');

  it('places a Saturday absence before the next Sunday class', () => {
    expect(
      suggestTutoringBeforeNextClass(
        [session('2026-09-27T11:00:00Z')],
        '2026-09-26',
        now
      )
    ).toEqual({
      classStartsAt: '18:00',
      sessionDate: '2026-09-27',
      startTime: '17:15',
    });
  });

  it('places a Sunday absence before the next Saturday class', () => {
    expect(
      suggestTutoringBeforeNextClass(
        [session('2026-10-03T11:00:00Z')],
        '2026-09-27',
        now
      )?.sessionDate
    ).toBe('2026-10-03');
  });

  it('places a Monday absence before the Wednesday class', () => {
    expect(
      suggestTutoringBeforeNextClass(
        [session('2026-09-30T11:00:00Z')],
        '2026-09-28',
        now
      )
    ).toMatchObject({ sessionDate: '2026-09-30', startTime: '17:15' });
  });

  it('skips cancelled and elapsed classes', () => {
    expect(
      suggestTutoringBeforeNextClass(
        [
          session('2026-09-28T11:00:00Z'),
          session('2026-09-30T11:00:00Z', 'cancelled'),
          session('2026-10-01T11:00:00Z'),
        ],
        '2026-09-26',
        new Date('2026-09-29T00:00:00Z')
      )
    ).toMatchObject({ sessionDate: '2026-10-01', startTime: '17:15' });
    expect(suggestTutoringBeforeNextClass([], '2026-09-28', now)).toBeNull();
  });
});

describe('center scheduling policy', () => {
  const now = new Date('2026-09-25T00:00:00Z');

  it('spreads two absence recovery sessions across upcoming classes', () => {
    expect(
      suggestTutoringSlots(
        [session('2026-09-27T11:00:00Z'), session('2026-10-03T11:00:00Z')],
        '2026-09-26',
        2,
        EASY_CENTER_TUTORING_POLICY,
        'separate',
        now
      )
    ).toMatchObject([
      { sessionDate: '2026-09-27', startTime: '17:15' },
      { sessionDate: '2026-10-03', startTime: '17:15' },
    ]);
  });

  it('uses the weekend morning exception after class', () => {
    expect(
      suggestTutoringSlots(
        [session('2026-09-27T01:00:00Z')],
        '2026-09-26',
        1,
        EASY_CENTER_TUTORING_POLICY,
        'separate',
        now
      )
    ).toMatchObject([
      { sessionDate: '2026-09-27', startTime: '09:30', durationMinutes: 60 },
    ]);
  });

  it('skips Monday without generic fallback and uses the next attended Wednesday or Friday', () => {
    const classes = [
      session('2026-09-28T11:00:00Z'),
      session('2026-09-30T11:00:00Z'),
      session('2026-10-02T11:00:00Z'),
    ];
    expect(
      suggestTutoringSlots(
        classes,
        '2026-09-27',
        2,
        EASY_CENTER_TUTORING_POLICY,
        'separate',
        now
      )
    ).toMatchObject([
      { sessionDate: '2026-09-30', startTime: '17:15', durationMinutes: 45 },
      { sessionDate: '2026-10-02', startTime: '17:15', durationMinutes: 45 },
    ]);
    expect(
      suggestTutoringSlots(
        classes.slice(0, 1),
        '2026-09-27',
        1,
        EASY_CENTER_TUTORING_POLICY,
        'separate',
        now
      )
    ).toEqual([]);
    expect(
      suggestTutoringSlots(
        classes,
        '2026-09-27',
        1,
        { ...EASY_CENTER_TUTORING_POLICY, preset: 'custom' },
        'separate',
        now
      )
    ).toMatchObject([{ sessionDate: '2026-09-28', startTime: '17:15' }]);
  });

  it('keeps staff-edited Easy Center timing and standard fallback intact', () => {
    const custom = {
      ...EASY_CENTER_TUTORING_POLICY,
      timeRules: EASY_CENTER_TUTORING_POLICY.timeRules.map((rule, index) =>
        index === 0
          ? { ...rule, weekdays: [1, 3, 5], tutoringStartTime: '17:00' }
          : rule
      ),
    };
    expect(
      suggestTutoringSlots(
        [session('2026-09-28T11:00:00Z')],
        '2026-09-27',
        1,
        custom,
        'separate',
        now
      )
    ).toMatchObject([{ startTime: '17:00' }]);
    expect(
      suggestTutoringSlots(
        [session('2026-09-28T11:00:00Z')],
        '2026-09-27',
        1,
        STANDARD_TUTORING_POLICY,
        'separate',
        now
      )
    ).toMatchObject([{ startTime: '17:15' }]);
  });

  it('fits two weak-support sessions before one evening class', () => {
    expect(
      suggestTutoringSlots(
        [session('2026-09-27T11:00:00Z')],
        '2026-09-26',
        2,
        EASY_CENTER_TUTORING_POLICY,
        'consecutive',
        now
      )
    ).toMatchObject([
      { startTime: '16:30', durationMinutes: 45 },
      { startTime: '17:15', durationMinutes: 45 },
    ]);
  });

  it('rejects an invalid policy and leaves tokens outside the template alone', () => {
    expect(
      parseTutoringPolicy({ ...STANDARD_TUTORING_POLICY, leadMinutes: -1 })
    ).toBeNull();
    expect(
      renderTutoringParentMessage('Hello {{student}} {{unknown}}', {
        student: 'Lan',
        reason: '',
        date: '',
        time: '',
        duration: '',
        group: '',
        campus: '',
        teacher: '',
      })
    ).toBe('Hello Lan {{unknown}}');
  });
});
