import { describe, expect, it } from 'vitest';
import { isTutoringGroupExcluded } from './tutoring-group-rules';
import {
  parseTutoringPolicy,
  readTutoringPolicyConfigRows,
  STANDARD_TUTORING_POLICY,
  serializeTutoringPolicyConfigRows,
} from './tutoring-policy';

const supportGroup = '0c6f3a52-8d1e-4b7a-9e2f-5a4b3c2d1e0f';

describe('tutoring group rules', () => {
  it('keeps name rules in their stored shape and round-trips tag rules', () => {
    const policy = parseTutoringPolicy({
      ...STANDARD_TUTORING_POLICY,
      groupExclusions: [
        { scope: 'all', match: 'contains', value: 'DDT' },
        { scope: 'all', match: 'exact', value: 'IELTS', target: 'tag' },
        { scope: 'make_up', match: 'prefix', value: 'K', target: 'name' },
      ],
    });
    expect(policy?.groupExclusions).toEqual([
      { scope: 'all', match: 'contains', value: 'DDT' },
      { scope: 'all', match: 'exact', value: 'IELTS', target: 'tag' },
      { scope: 'make_up', match: 'prefix', value: 'K' },
    ]);
    expect(
      parseTutoringPolicy({
        ...STANDARD_TUTORING_POLICY,
        groupExclusions: [
          { scope: 'all', match: 'exact', value: 'x', target: 'course' },
        ],
      })
    ).toBeNull();
  });

  it('matches tag rules against tag names only', () => {
    const policy = {
      ...STANDARD_TUTORING_POLICY,
      groupExclusions: [
        {
          scope: 'all' as const,
          match: 'exact' as const,
          value: 'ielts',
          target: 'tag' as const,
        },
      ],
    };
    expect(
      isTutoringGroupExcluded(policy, 'Class 7A', 'make_up', null, ['IELTS'])
    ).toBe(true);
    expect(
      isTutoringGroupExcluded(policy, 'IELTS evening', 'make_up', null, [])
    ).toBe(false);
    expect(
      isTutoringGroupExcluded(
        STANDARD_TUTORING_POLICY,
        'Class 7A',
        'make_up',
        null,
        ['IELTS']
      )
    ).toBe(false);
  });

  it('defaults support groups to empty and keeps them through config storage', () => {
    // Policies saved before support groups existed have no such key.
    const { supportGroupIds: _, ...legacy } = STANDARD_TUTORING_POLICY;
    expect(parseTutoringPolicy(legacy)?.supportGroupIds).toEqual([]);
    expect(
      parseTutoringPolicy({
        ...STANDARD_TUTORING_POLICY,
        supportGroupIds: ['not-a-uuid'],
      })
    ).toBeNull();
    const stored = serializeTutoringPolicyConfigRows({
      ...STANDARD_TUTORING_POLICY,
      supportGroupIds: [supportGroup.toUpperCase()],
    });
    expect(readTutoringPolicyConfigRows(stored).supportGroupIds).toEqual([
      supportGroup,
    ]);
  });
});
