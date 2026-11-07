import { describe, expect, it } from 'vitest';
import { getTutoringCampus, STANDARD_TUTORING_POLICY } from './tutoring-policy';

describe('session campus precedence', () => {
  const policy = {
    ...STANDARD_TUTORING_POLICY,
    campusByGroupId: { class: 'North' },
  };
  it('resolves a serialized override ahead of the saved class default', () => {
    const session = JSON.parse(JSON.stringify({ campus_override: 'South' }));
    expect(
      getTutoringCampus(policy, 'class', 'CS1', session.campus_override)
    ).toBe('South');
    expect(policy.campusByGroupId.class).toBe('North');
  });
  it('inherits on null, missing or blank without guessing an unknown class', () => {
    for (const value of [null, undefined, '', ' ']) {
      expect(getTutoringCampus(policy, 'class', 'CS1', value)).toBe('North');
    }
    expect(getTutoringCampus(policy, 'other', 'Class', null)).toBeNull();
    expect(getTutoringCampus(policy, 'other', 'CS2', null)).toBe('CS2');
  });
});
