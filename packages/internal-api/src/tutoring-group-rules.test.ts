import { describe, expect, it } from 'vitest';
import {
  filterTutoringEligibleGroups,
  isTutoringGroupExcluded,
  tutoringExclusionReason,
} from './tutoring-group-rules';
import {
  EASY_CENTER_TUTORING_POLICY,
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

  describe('class exclusions on every tutoring screen', () => {
    const groups = [
      { id: 'a1', name: 'Lớp ddt 3' },
      { id: 'a2', name: 'IELTS 5.0 evening' },
      { id: 'a3', name: 'Mẫu giáo Hoa Mai' },
      { id: 'a4', name: 'KINDERGARTEN Sunflower' },
      { id: 'a5', name: 'Starters DDT-2' },
      { id: 'a6', name: null },
    ];

    it('maps each session reason to the rule scope it reads', () => {
      expect(tutoringExclusionReason('ABSENT_RECOVERY')).toBe('make_up');
      expect(tutoringExclusionReason('WEAK_SUPPORT')).toBe('weak_support');
      expect(tutoringExclusionReason('CUSTOM')).toBeNull();
      expect(tutoringExclusionReason(undefined)).toBeNull();
    });

    it('drops DDT classes from the arrange list, matching case-insensitively', () => {
      for (const reason of ['make_up', 'weak_support', null] as const) {
        expect(
          filterTutoringEligibleGroups(
            EASY_CENTER_TUTORING_POLICY,
            groups,
            reason
          ).map((group) => group.id)
        ).toEqual(['a2', 'a6']);
      }
    });

    it('drops kindergarten classes by either preset name', () => {
      const kept = filterTutoringEligibleGroups(
        EASY_CENTER_TUTORING_POLICY,
        groups,
        'make_up'
      ).map((group) => group.name);
      expect(kept).not.toContain('Mẫu giáo Hoa Mai');
      expect(kept).not.toContain('KINDERGARTEN Sunflower');
    });

    it('keeps every class under a custom policy without a DDT rule', () => {
      const custom = {
        ...EASY_CENTER_TUTORING_POLICY,
        preset: 'custom' as const,
        groupExclusions: [
          { scope: 'all' as const, match: 'exact' as const, value: 'IELTS' },
        ],
      };
      expect(
        filterTutoringEligibleGroups(custom, groups, 'make_up')
      ).toHaveLength(groups.length);
      expect(
        filterTutoringEligibleGroups(STANDARD_TUTORING_POLICY, groups, null)
      ).toHaveLength(groups.length);
    });

    it('applies a scoped rule only to its own reason; custom sessions read all-scope rules', () => {
      const scoped = {
        ...STANDARD_TUTORING_POLICY,
        groupExclusions: [
          {
            scope: 'weak_support' as const,
            match: 'contains' as const,
            value: 'ddt',
          },
        ],
      };
      expect(isTutoringGroupExcluded(scoped, 'DDT 1', 'weak_support')).toBe(
        true
      );
      expect(isTutoringGroupExcluded(scoped, 'DDT 1', 'make_up')).toBe(false);
      expect(isTutoringGroupExcluded(scoped, 'DDT 1', null)).toBe(false);
      expect(
        isTutoringGroupExcluded(EASY_CENTER_TUTORING_POLICY, 'DDT 1', null)
      ).toBe(true);
    });

    it('reads class tags and tutor groups when filtering', () => {
      const policy = {
        ...STANDARD_TUTORING_POLICY,
        tutorGroupIds: ['a2'],
        groupExclusions: [
          {
            scope: 'all' as const,
            match: 'exact' as const,
            value: 'ddt',
            target: 'tag' as const,
          },
        ],
      };
      expect(
        filterTutoringEligibleGroups(
          policy,
          groups,
          'make_up',
          new Map([['a3', ['DDT']]])
        ).map((group) => group.id)
      ).toEqual(['a1', 'a4', 'a5', 'a6']);
    });
  });

  describe('diacritic-insensitive matching', () => {
    const rule = (
      match: 'contains' | 'exact' | 'prefix' | 'suffix',
      value: string,
      target?: 'tag'
    ) => ({
      ...STANDARD_TUTORING_POLICY,
      groupExclusions: [
        { scope: 'all' as const, match, value, ...(target ? { target } : {}) },
      ],
    });

    it('matches DDT against ĐĐT, đđt and Đdt, and the other way round', () => {
      for (const name of ['Lớp ĐĐT 2', 'đđt starters', 'Movers Đdt']) {
        expect(
          isTutoringGroupExcluded(rule('contains', 'DDT'), name, 'make_up')
        ).toBe(true);
      }
      expect(
        isTutoringGroupExcluded(rule('contains', 'ĐĐT'), 'Starters DDT', null)
      ).toBe(true);
      expect(
        isTutoringGroupExcluded(
          EASY_CENTER_TUTORING_POLICY,
          'ĐĐT Hoa Mai',
          'weak_support'
        )
      ).toBe(true);
    });

    it('matches Mẫu giáo against Mau giao in names and tags', () => {
      expect(
        isTutoringGroupExcluded(
          EASY_CENTER_TUTORING_POLICY,
          'MAU GIAO Hoa Mai',
          'make_up'
        )
      ).toBe(true);
      expect(
        isTutoringGroupExcluded(
          rule('contains', 'mau giao'),
          'Mẫu giáo A',
          null
        )
      ).toBe(true);
      expect(
        isTutoringGroupExcluded(
          rule('exact', 'Mau giao', 'tag'),
          'Class 7A',
          null,
          null,
          ['Mẫu Giáo']
        )
      ).toBe(true);
    });

    it('keeps exact, prefix and suffix semantics on the folded text', () => {
      expect(isTutoringGroupExcluded(rule('exact', 'ĐĐT'), ' ddt ', null)).toBe(
        true
      );
      expect(isTutoringGroupExcluded(rule('exact', 'ĐĐT'), 'DDT 2', null)).toBe(
        false
      );
      expect(
        isTutoringGroupExcluded(rule('prefix', 'đđt'), 'DDT Movers', null)
      ).toBe(true);
      expect(
        isTutoringGroupExcluded(rule('prefix', 'đđt'), 'Movers DDT', null)
      ).toBe(false);
      expect(
        isTutoringGroupExcluded(rule('suffix', 'giáo'), 'Mau GIAO', null)
      ).toBe(true);
      expect(
        isTutoringGroupExcluded(rule('suffix', 'giáo'), 'Giao tiếp 1', null)
      ).toBe(false);
    });

    it('leaves a non-match a non-match', () => {
      for (const name of ['English A1', 'DT Starters', 'D-D-T', 'Đội tuyển']) {
        expect(
          isTutoringGroupExcluded(rule('contains', 'DDT'), name, null)
        ).toBe(false);
      }
      expect(
        isTutoringGroupExcluded(rule('contains', 'Mẫu giáo'), 'Mẫu vẽ', null)
      ).toBe(false);
    });
  });

  describe('single-word contains rules match whole tokens', () => {
    const contains = (value: string) => ({
      ...STANDARD_TUTORING_POLICY,
      groupExclusions: [
        { scope: 'all' as const, match: 'contains' as const, value },
      ],
    });

    it('matches DDT as its own token, next to digits and punctuation', () => {
      for (const name of [
        'DDT',
        'DDT1',
        'DDT-A',
        'Lớp DDT 2',
        'ĐĐT',
        'GDĐT DDT',
      ])
        expect(isTutoringGroupExcluded(contains('DDT'), name, null), name).toBe(
          true
        );
    });

    it('does not match DDT inside a longer word such as GDĐT', () => {
      for (const name of ['GDĐT', 'KĐĐT', 'ADĐT', 'Ôn thi Sở GDĐT', 'DDTX'])
        expect(isTutoringGroupExcluded(contains('DDT'), name, null), name).toBe(
          false
        );
      expect(
        isTutoringGroupExcluded(
          EASY_CENTER_TUTORING_POLICY,
          'Ôn thi Sở GDĐT',
          'make_up'
        )
      ).toBe(false);
    });

    it('keeps plain substring matching for multi-word values', () => {
      for (const name of ['Lớp mẫu giáo 2', 'Mẫu giáoA', 'xmau giao'])
        expect(
          isTutoringGroupExcluded(contains('mẫu giáo'), name, null),
          name
        ).toBe(true);
    });

    it('leaves exact, prefix and suffix rules unchanged', () => {
      const rule = (match: 'exact' | 'prefix' | 'suffix') => ({
        ...STANDARD_TUTORING_POLICY,
        groupExclusions: [{ scope: 'all' as const, match, value: 'DDT' }],
      });
      expect(isTutoringGroupExcluded(rule('prefix'), 'DDTX 1', null)).toBe(
        true
      );
      expect(isTutoringGroupExcluded(rule('suffix'), 'GDĐT', null)).toBe(true);
      expect(isTutoringGroupExcluded(rule('exact'), 'GDĐT', null)).toBe(false);
    });
  });
});
