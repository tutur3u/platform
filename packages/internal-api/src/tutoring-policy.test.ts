import { describe, expect, it } from 'vitest';
import {
  EASY_CENTER_TUTORING_POLICY,
  getTutoringCampus,
  getTutoringShiftLabel,
  parseTutoringPolicy,
  renderTutoringParentMessage,
} from './tutoring-policy';

describe('Easy Center tutoring shifts', () => {
  it('keeps the latest weekend morning shift names and times', () => {
    expect(EASY_CENTER_TUTORING_POLICY.timeRules).toHaveLength(7);
    expect(
      EASY_CENTER_TUTORING_POLICY.timeRules.find(
        (rule) => rule.label === 'Shift 4'
      )
    ).toMatchObject({ durationMinutes: 50, tutoringStartTime: '09:30' });
    expect(
      getTutoringShiftLabel(
        EASY_CENTER_TUTORING_POLICY,
        '2026-09-26',
        '08:45:00'
      )
    ).toBe('Shift 3');
    expect(
      getTutoringShiftLabel(
        EASY_CENTER_TUTORING_POLICY,
        '2026-09-26',
        '09:30:00'
      )
    ).toBe('Shift 4');
    expect(
      getTutoringShiftLabel(
        EASY_CENTER_TUTORING_POLICY,
        '2026-09-28',
        '17:15:00'
      )
    ).toBe('Shift 1');
  });

  it('accepts editable labels and the attendance lookback', () => {
    const parsed = parseTutoringPolicy(EASY_CENTER_TUTORING_POLICY);
    expect(parsed?.absenceLookbackDays).toBe(21);
    expect(parsed?.timeRules[0]?.label).toBe('Shift 1');
  });

  it('validates campus mappings without changing the preset default', () => {
    const groupId = '42529372-c669-4833-bb32-2cab1f4ffd83';
    expect(
      parseTutoringPolicy({
        ...EASY_CENTER_TUTORING_POLICY,
        campusByGroupId: { [groupId]: 'CS1' },
      })?.campusByGroupId[groupId]
    ).toBe('CS1');
    expect(
      parseTutoringPolicy({
        ...EASY_CENTER_TUTORING_POLICY,
        campusByGroupId: { invalid: 'CS1' },
      })
    ).toBeNull();
    expect(
      renderTutoringParentMessage('Cơ sở: {{campus}}', {
        campus: 'CS1',
        student: '',
        reason: '',
        date: '',
        time: '',
        duration: '',
        group: '',
        teacher: '',
      })
    ).toBe('Cơ sở: CS1');
    expect(
      getTutoringCampus(EASY_CENTER_TUTORING_POLICY, groupId, 'Kids CS2')
    ).toBe('CS2');
    expect(
      getTutoringCampus(EASY_CENTER_TUTORING_POLICY, groupId, 'Class 246')
    ).toBeNull();
    expect(
      getTutoringCampus(
        {
          ...EASY_CENTER_TUTORING_POLICY,
          campusByGroupId: { [groupId]: 'CS1' },
        },
        groupId,
        'Kids CS2'
      )
    ).toBe('CS1');
  });
});
