import { describe, expect, it } from 'vitest';
import { isTutoringGroupExcluded } from './tutoring-group-rules';
import {
  EASY_CENTER_TUTORING_POLICY,
  getEasyCenterTutoringPolicy,
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

describe('accent matching v2', () => {
  for (const match of ['exact', 'contains', 'prefix', 'suffix'] as const) {
    for (const target of ['name', 'tag'] as const) {
      it(`${match} ${target} folds accents only when enabled`, () => {
        const policy = {
          ...STANDARD_TUTORING_POLICY,
          groupExclusions: [
            { scope: 'make_up' as const, match, target, value: 'Mẫu giáo' },
          ],
        };
        const args = [
          policy,
          target === 'name' ? 'MAU GIAO' : 'unrelated',
          'make_up',
          null,
          target === 'tag' ? ['MAU GIAO'] : [],
        ] as const;
        expect(isTutoringGroupExcluded(...args)).toBe(false);
        expect(isTutoringGroupExcluded(...args, true)).toBe(true);
        expect(
          isTutoringGroupExcluded(
            policy,
            'MAU GIAO',
            'weak_support',
            null,
            ['MAU GIAO'],
            true
          )
        ).toBe(false);
      });
    }
  }
});

it('excludes DDT in the language center preset', () => {
  for (const name of ['DDT morning']) {
    expect(
      isTutoringGroupExcluded(EASY_CENTER_TUTORING_POLICY, name, 'make_up')
    ).toBe(true);
  }
});

it('gates IELTS defaults for old stored policies', () => {
  for (const groupExclusions of [
    undefined,
    [{ scope: 'all', match: 'contains', value: 'DDT' }],
  ]) {
    const { groupExclusions: omitted, ...base } = EASY_CENTER_TUTORING_POLICY;
    const saved =
      groupExclusions === undefined ? base : { ...base, groupExclusions };
    expect(
      parseTutoringPolicy(saved)?.groupExclusions.some(
        (r) => r.value === 'IELTS'
      )
    ).toBe(false);
    expect(
      parseTutoringPolicy(saved, true)?.groupExclusions.some(
        (r) => r.value === 'IELTS'
      )
    ).toBe(true);
  }
  const saved = {
    ...EASY_CENTER_TUTORING_POLICY,
    groupExclusions: EASY_CENTER_TUTORING_POLICY.groupExclusions.filter(
      (r) => r.value !== 'IELTS'
    ),
  };
  expect(parseTutoringPolicy(saved, true)?.groupExclusions).toHaveLength(3);
});
for (const scope of ['all', 'weak_support'] as const) {
  for (const [match, expected] of [
    ['exact', false],
    ['contains', true],
    ['prefix', true],
    ['suffix', false],
  ] as const) {
    it(`${scope} ${match} distinguishes operators with Vietnamese folding`, () => {
      const policy = {
        ...STANDARD_TUTORING_POLICY,
        groupExclusions: [{ scope, match, value: 'duc' }],
      };
      expect(
        isTutoringGroupExcluded(
          policy,
          'Đức class',
          'weak_support',
          null,
          [],
          true
        )
      ).toBe(expected);
      expect(
        isTutoringGroupExcluded(
          policy,
          'class Đức',
          'weak_support',
          null,
          [],
          true
        )
      ).toBe(match === 'contains' || match === 'suffix');
    });
  }
}
it('folds crossed d for exact names', () => {
  for (const [value, name] of [
    ['DDT', 'ĐĐT'],
    ['duc', 'Đức'],
  ]) {
    const policy = {
      ...STANDARD_TUTORING_POLICY,
      groupExclusions: [
        { scope: 'all' as const, match: 'exact' as const, value },
      ],
    };
    expect(
      isTutoringGroupExcluded(policy, name, 'make_up', null, [], true)
    ).toBe(true);
  }
});

it('applies IELTS only to the upgraded explicit preset', () => {
  expect(getEasyCenterTutoringPolicy(false)).toEqual(
    EASY_CENTER_TUTORING_POLICY
  );
  expect(getEasyCenterTutoringPolicy(true).groupExclusions).toHaveLength(4);
  expect(getEasyCenterTutoringPolicy(true).groupExclusions.at(-1)?.value).toBe(
    'IELTS'
  );
});
