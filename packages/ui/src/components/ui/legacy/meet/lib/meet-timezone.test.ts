import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import { describe, expect, it } from 'vitest';
import type { MeetRankedTimeframe } from './meet-insights';
import { candidateToAbsoluteRange } from './meet-timezone';

const candidate: MeetRankedTimeframe = {
  date: '2026-08-04',
  startMinute: 540,
  endMinute: 600,
  confirmedUserIds: [],
  tentativeUserIds: [],
  unavailableUserIds: [],
  confirmedPercent: 0,
  weightedPercent: 0,
};

describe('Tuturuuu Meet timezone conversion', () => {
  it('preserves the fixed offset of a legacy plan', () => {
    const plan: MeetTogetherPlan = {
      duration_minutes: 60,
      start_time: '09:00:00+07',
    };
    expect(candidateToAbsoluteRange(candidate, plan)).toEqual({
      startAt: '2026-08-04T02:00:00.000Z',
      endAt: '2026-08-04T03:00:00.000Z',
    });
  });

  it('uses IANA daylight-saving rules', () => {
    const plan: MeetTogetherPlan = {
      duration_minutes: 60,
      start_time: '09:00:00-04',
      timezone: 'America/New_York',
    };
    expect(candidateToAbsoluteRange(candidate, plan)?.startAt).toBe(
      '2026-08-04T13:00:00.000Z'
    );
  });

  it('rejects a nonexistent DST window', () => {
    const plan: MeetTogetherPlan = {
      duration_minutes: 60,
      start_time: '01:00:00-05',
      timezone: 'America/New_York',
    };
    expect(
      candidateToAbsoluteRange(
        { ...candidate, date: '2026-03-08', startMinute: 120, endMinute: 180 },
        plan
      )
    ).toBeNull();
  });
});
