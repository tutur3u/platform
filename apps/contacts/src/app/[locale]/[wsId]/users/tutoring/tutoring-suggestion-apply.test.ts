import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';
import { EASY_CENTER_TUTORING_POLICY } from '@tuturuuu/internal-api/tutoring-policy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTutoringSuggestions,
  resolveTutoringClassSchedule,
} from './tutoring-suggestion-apply';
import type { TutoringFormValues } from './tutoring-types';

const GROUP = '11111111-1111-4111-8111-111111111111';

function classAt(startsAt: string) {
  return {
    groupId: GROUP,
    startTimezone: 'Asia/Ho_Chi_Minh',
    startsAt,
    status: 'scheduled',
  } as WorkspaceUserGroupSession;
}

const slot = {
  durationMinutes: 45,
  sessionDate: '',
  startTime: '',
  teacherUserId: '',
};
const form = {
  groupId: GROUP,
  reasonType: 'ABSENT_RECOVERY',
  sessionSlots: [slot, slot, slot],
} as unknown as TutoringFormValues;

describe('applying make-up suggestions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T11:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('keeps a partial plan and leaves the remaining slots blank', () => {
    // Only one Wednesday 18:00 class falls inside the window.
    const result = applyTutoringSuggestions({
      form,
      fromDate: '2026-10-05',
      policy: EASY_CENTER_TUTORING_POLICY,
      schedule: [classAt('2026-10-28T11:00:00Z')],
    });
    expect(result.message).toEqual({
      key: 'suggestion_partial',
      values: { found: 1, total: 3 },
    });
    expect(result.form?.sessionSlots).toMatchObject([
      { sessionDate: '2026-10-28', startTime: '17:15' },
      { sessionDate: '', startTime: '' },
      { sessionDate: '', startTime: '' },
    ]);
  });

  it('explains classes whose times match no shift rule', () => {
    const result = applyTutoringSuggestions({
      form,
      fromDate: '2026-10-05',
      policy: EASY_CENTER_TUTORING_POLICY,
      schedule: [classAt('2026-10-28T00:00:00Z')],
    });
    expect(result).toEqual({
      form: null,
      message: { key: 'suggestion_unmatched', values: { count: 1 } },
    });
  });

  it('reports an empty calendar separately', () => {
    expect(
      applyTutoringSuggestions({
        form,
        fromDate: '2026-10-05',
        policy: EASY_CENTER_TUTORING_POLICY,
        schedule: [],
      }).message
    ).toEqual({ key: 'suggestion_unavailable', values: { days: 56 } });
  });

  it('falls back to the assigned shift only for a loaded empty calendar', () => {
    const policy = {
      ...EASY_CENTER_TUTORING_POLICY,
      shiftByGroupId: { [GROUP]: 'Shift 2' },
    };
    const args = { groupId: GROUP, policy, today: '2026-10-26' };
    expect(
      resolveTutoringClassSchedule({ ...args, calendar: [], loaded: true })
    ).not.toHaveLength(0);
    expect(
      resolveTutoringClassSchedule({ ...args, calendar: [], loaded: false })
    ).toEqual([]);
    const calendar = [classAt('2026-10-27T11:00:00Z')];
    expect(
      resolveTutoringClassSchedule({ ...args, calendar, loaded: true })
    ).toBe(calendar);
  });
});
