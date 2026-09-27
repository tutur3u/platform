import { describe, expect, it } from 'vitest';
import {
  EASY_CENTER_TUTORING_POLICY,
  getTutoringCampus,
  getTutoringShiftLabel,
  isTutoringGroupExcluded,
  parseTutoringPolicy,
  readTutoringPolicyConfigRows,
  renderTutoringParentMessage,
  serializeTutoringPolicyConfigRows,
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

  it('uses configurable group eligibility scopes', () => {
    expect(
      isTutoringGroupExcluded(
        EASY_CENTER_TUTORING_POLICY,
        'Kindergarten DDT',
        'make_up'
      )
    ).toBe(true);
    for (const name of ['Lớp Mẫu Giáo A', 'Kindergarten Bluebirds']) {
      expect(
        isTutoringGroupExcluded(EASY_CENTER_TUTORING_POLICY, name, 'make_up')
      ).toBe(true);
      expect(
        isTutoringGroupExcluded(
          EASY_CENTER_TUTORING_POLICY,
          name,
          'weak_support'
        )
      ).toBe(true);
    }
    expect(
      isTutoringGroupExcluded(
        EASY_CENTER_TUTORING_POLICY,
        'Class 246',
        'weak_support'
      )
    ).toBe(false);
    expect(
      isTutoringGroupExcluded(
        {
          ...EASY_CENTER_TUTORING_POLICY,
          groupExclusions: [
            { scope: 'weak_support', match: 'suffix', value: ' junior' },
          ],
        },
        'Kids Junior',
        'weak_support'
      )
    ).toBe(true);
    expect(
      parseTutoringPolicy({
        ...EASY_CENTER_TUTORING_POLICY,
        groupExclusions: [{ scope: 'all', match: 'contains', value: '' }],
      })
    ).toBeNull();
  });

  it('fills new rules when reading an older saved policy', () => {
    const { weakContentReviewDays, groupExclusions, ...legacy } =
      EASY_CENTER_TUTORING_POLICY;
    expect(weakContentReviewDays).toBe(14);
    expect(groupExclusions).toHaveLength(3);
    expect(parseTutoringPolicy(legacy)).toMatchObject({
      weakContentReviewDays: 14,
      groupExclusions,
    });
  });

  it('upgrades only the prior Easy Center exclusion preset', () => {
    const priorRules = [{ scope: 'all', match: 'contains', value: 'DDT' }];
    expect(
      parseTutoringPolicy({
        ...EASY_CENTER_TUTORING_POLICY,
        groupExclusions: priorRules,
      })?.groupExclusions
    ).toEqual(EASY_CENTER_TUTORING_POLICY.groupExclusions);
    expect(
      parseTutoringPolicy({
        ...EASY_CENTER_TUTORING_POLICY,
        preset: 'custom',
        groupExclusions: priorRules,
      })?.groupExclusions
    ).toEqual(priorRules);
  });
});

describe('tutoring policy storage', () => {
  it('round trips the full center preset under the database value limit', () => {
    const rows = serializeTutoringPolicyConfigRows(EASY_CENTER_TUTORING_POLICY);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.every((row) => row.value.length <= 1000)).toBe(true);
    expect(readTutoringPolicyConfigRows(rows)).toEqual(
      EASY_CENTER_TUTORING_POLICY
    );
    expect(readTutoringPolicyConfigRows(rows.slice(0, 1))).not.toEqual(
      EASY_CENTER_TUTORING_POLICY
    );
  });

  it('keeps emoji intact when a chunk ends at a surrogate pair', () => {
    const messageStart =
      JSON.stringify({
        ...EASY_CENTER_TUTORING_POLICY,
        parentMessageTemplate: '',
      }).indexOf('parentMessageTemplate') + 'parentMessageTemplate":"'.length;
    const message = `${'a'.repeat(899 - (messageStart % 900))}🙂`;
    const policy = {
      ...EASY_CENTER_TUTORING_POLICY,
      parentMessageTemplate: message,
    };
    const rows = serializeTutoringPolicyConfigRows(policy);
    expect(rows.every((row) => row.value.length <= 900)).toBe(true);
    expect(
      rows.slice(1).every((row) => {
        const lastCodeUnit = row.value.charCodeAt(row.value.length - 1);
        return lastCodeUnit < 0xd800 || lastCodeUnit > 0xdbff;
      })
    ).toBe(true);
    expect(readTutoringPolicyConfigRows(rows).parentMessageTemplate).toBe(
      message
    );
  });
});
