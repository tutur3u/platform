import { describe, expect, it } from 'vitest';
import {
  hasTutoringTagExclusions,
  isTutoringGroupExcluded,
  parseTutoringGroupExclusions,
} from './tutoring-group-rules';
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

describe('parseTutoringGroupExclusions', () => {
  it('parses valid group exclusions and trims values', () => {
    const parsed = parseTutoringGroupExclusions([
      { scope: 'all', match: 'contains', value: '  DDT  ' },
      { scope: 'make_up', match: 'prefix', value: 'K', target: 'name' },
      { scope: 'weak_support', match: 'exact', value: 'IELTS', target: 'tag' },
      { scope: 'all', match: 'suffix', value: 'Lab' },
    ]);
    expect(parsed).toEqual([
      { scope: 'all', match: 'contains', value: 'DDT' },
      { scope: 'make_up', match: 'prefix', value: 'K' },
      { scope: 'weak_support', match: 'exact', value: 'IELTS', target: 'tag' },
      { scope: 'all', match: 'suffix', value: 'Lab' },
    ]);
  });

  it('returns an empty array for an empty input list', () => {
    expect(parseTutoringGroupExclusions([])).toEqual([]);
  });

  it('returns null on invalid entries or rules', () => {
    expect(
      parseTutoringGroupExclusions([null as unknown as object])
    ).toBeNull();
    expect(
      parseTutoringGroupExclusions(['invalid' as unknown as object])
    ).toBeNull();
    expect(
      parseTutoringGroupExclusions([
        { scope: 'other', match: 'contains', value: 'DDT' },
      ])
    ).toBeNull();
    expect(
      parseTutoringGroupExclusions([
        { scope: 'all', match: 'regex', value: 'DDT' },
      ])
    ).toBeNull();
    expect(
      parseTutoringGroupExclusions([
        { scope: 'all', match: 'contains', value: 'DDT', target: 'invalid' },
      ])
    ).toBeNull();
    expect(
      parseTutoringGroupExclusions([
        { scope: 'all', match: 'contains', value: 123 },
      ])
    ).toBeNull();
    expect(
      parseTutoringGroupExclusions([
        { scope: 'all', match: 'contains', value: '   ' },
      ])
    ).toBeNull();
    expect(
      parseTutoringGroupExclusions([
        { scope: 'all', match: 'contains', value: 'a'.repeat(81) },
      ])
    ).toBeNull();
  });
});

describe('hasTutoringTagExclusions', () => {
  it('returns true when any exclusion rule targets tags', () => {
    expect(
      hasTutoringTagExclusions({
        groupExclusions: [
          { scope: 'all', match: 'contains', value: 'DDT' },
          { scope: 'all', match: 'exact', value: 'IELTS', target: 'tag' },
        ],
      })
    ).toBe(true);
  });

  it('returns false when no rules target tags', () => {
    expect(hasTutoringTagExclusions({ groupExclusions: [] })).toBe(false);
    expect(
      hasTutoringTagExclusions({
        groupExclusions: [
          { scope: 'all', match: 'contains', value: 'DDT' },
          { scope: 'make_up', match: 'prefix', value: 'K' },
        ],
      })
    ).toBe(false);
  });
});
