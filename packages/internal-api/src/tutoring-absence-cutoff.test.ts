import { describe, expect, it } from 'vitest';
import {
  EASY_CENTER_TUTORING_POLICY,
  getTutoringAbsenceCountFromMax,
  getTutoringAbsenceCutoff,
  parseTutoringPolicy,
  readTutoringPolicy,
  readTutoringPolicyConfigRows,
  STANDARD_TUTORING_POLICY,
  serializeTutoringPolicyConfigRows,
  type TutoringPolicy,
} from './tutoring-policy';

// 1 Nov 2026 10:00 in GMT+7.
const NOW = new Date('2026-11-01T03:00:00Z');

describe('absenceCountFromDate', () => {
  it('keeps a valid workspace-local date', () => {
    expect(
      parseTutoringPolicy(
        { ...STANDARD_TUTORING_POLICY, absenceCountFromDate: '2026-11-01' },
        NOW
      )?.absenceCountFromDate
    ).toBe('2026-11-01');
    expect(
      parseTutoringPolicy(
        { ...STANDARD_TUTORING_POLICY, absenceCountFromDate: '2025-01-15' },
        NOW
      )?.absenceCountFromDate
    ).toBe('2025-01-15');
  });

  it('treats a missing or null date as no cutoff', () => {
    const { absenceCountFromDate: _unset, ...legacy } =
      STANDARD_TUTORING_POLICY;
    expect(parseTutoringPolicy(legacy, NOW)).toEqual(STANDARD_TUTORING_POLICY);
    expect(STANDARD_TUTORING_POLICY.absenceCountFromDate).toBeNull();
    expect(EASY_CENTER_TUTORING_POLICY.absenceCountFromDate).toBeNull();
    expect(
      parseTutoringPolicy(
        { ...STANDARD_TUTORING_POLICY, absenceCountFromDate: null },
        NOW
      )?.absenceCountFromDate
    ).toBeNull();
  });

  it.each([
    '',
    '2026-11-31',
    '2026-02-29',
    '2026/11/01',
    '01-11-2026',
    '2026-11-01T00:00:00Z',
    ' 2026-11-01',
    20261101,
    true,
    {},
  ])('rejects %j', (value) => {
    expect(
      parseTutoringPolicy(
        { ...STANDARD_TUTORING_POLICY, absenceCountFromDate: value },
        NOW
      )
    ).toBeNull();
  });

  it('allows up to tomorrow so any workspace timezone can pick its today', () => {
    const at = (date: string) =>
      parseTutoringPolicy(
        { ...STANDARD_TUTORING_POLICY, absenceCountFromDate: date },
        NOW
      );
    expect(at('2026-11-02')?.absenceCountFromDate).toBe('2026-11-02');
    expect(at('2026-11-03')).toBeNull();
    expect(at('2027-11-01')).toBeNull();
    // 31 Oct 23:59 GMT+7 is still 31 Oct in UTC; 1 Nov is already accepted.
    expect(
      parseTutoringPolicy(
        { ...STANDARD_TUTORING_POLICY, absenceCountFromDate: '2026-11-01' },
        new Date('2026-10-31T16:59:00Z')
      )?.absenceCountFromDate
    ).toBe('2026-11-01');
  });

  it('survives the chunked save and read', () => {
    const policy = {
      ...EASY_CENTER_TUTORING_POLICY,
      absenceCountFromDate: '2026-11-01',
    };
    expect(
      readTutoringPolicyConfigRows(serializeTutoringPolicyConfigRows(policy))
        .absenceCountFromDate
    ).toBe('2026-11-01');
  });

  it('is kept when an untouched Easy Center preset is carried forward', () => {
    const legacy = {
      ...EASY_CENTER_TUTORING_POLICY,
      followUpDays: 7,
      weakSupportSessions: 2,
      groupExclusions: [{ scope: 'all', match: 'contains', value: 'DDT' }],
      timeRules: EASY_CENTER_TUTORING_POLICY.timeRules.filter(
        (rule) => rule.label !== 'Shift 8'
      ),
      absenceCountFromDate: '2026-11-01',
    };
    expect(parseTutoringPolicy(legacy, NOW)).toMatchObject({
      followUpDays: 3,
      timeRules: EASY_CENTER_TUTORING_POLICY.timeRules,
      groupExclusions: EASY_CENTER_TUTORING_POLICY.groupExclusions,
      absenceCountFromDate: '2026-11-01',
    });
  });
});

describe('reading a stored absenceCountFromDate', () => {
  // Custom policy with Easy Center exclusions, so a reset to standard shows.
  const saved = {
    ...EASY_CENTER_TUTORING_POLICY,
    preset: 'custom' as const,
    campusByGroupId: {
      '11111111-1111-4111-8111-111111111111': 'Legacy Annex',
    },
  };
  const stored = (absenceCountFromDate: unknown) =>
    serializeTutoringPolicyConfigRows({
      ...saved,
      absenceCountFromDate,
    } as unknown as TutoringPolicy);

  it.each(['2026-02-30', '2099-01-01', '01-11-2026', 20261101, {}])(
    'reads a bad stored date %j as null and keeps the rest',
    (value) => {
      const policy = readTutoringPolicyConfigRows(stored(value));
      expect(policy).toEqual({ ...saved, absenceCountFromDate: null });
      expect(policy.groupExclusions).toEqual(
        EASY_CENTER_TUTORING_POLICY.groupExclusions
      );
      expect(
        readTutoringPolicy(
          JSON.stringify({ ...saved, absenceCountFromDate: value })
        )
      ).toEqual({ ...saved, absenceCountFromDate: null });
    }
  );

  it('still falls back to standard when another field is invalid', () => {
    expect(
      readTutoringPolicy(
        JSON.stringify({
          ...saved,
          leadMinutes: -1,
          absenceCountFromDate: '2026-02-30',
        })
      )
    ).toEqual(STANDARD_TUTORING_POLICY);
  });

  it('keeps rejecting a bad date at the write boundary', () => {
    expect(
      parseTutoringPolicy({ ...saved, absenceCountFromDate: '2026-02-30' }, NOW)
    ).toBeNull();
  });
});

describe('getTutoringAbsenceCountFromMax', () => {
  it('is tomorrow in UTC, the latest date the parser accepts', () => {
    expect(getTutoringAbsenceCountFromMax(NOW.getTime())).toBe('2026-11-02');
    expect(
      getTutoringAbsenceCountFromMax(Date.parse('2026-10-31T16:59:00Z'))
    ).toBe('2026-11-01');
  });
});

describe('getTutoringAbsenceCutoff', () => {
  const now = Date.parse('2026-11-20T03:00:00Z');

  it('is the rolling lookback when no date is set', () => {
    expect(
      getTutoringAbsenceCutoff(
        { absenceLookbackDays: 28, absenceCountFromDate: null },
        now
      )
    ).toBe('2026-10-23');
  });

  it('uses the later of the rolling lookback and the chosen date', () => {
    expect(
      getTutoringAbsenceCutoff(
        { absenceLookbackDays: 28, absenceCountFromDate: '2026-11-01' },
        now
      )
    ).toBe('2026-11-01');
    expect(
      getTutoringAbsenceCutoff(
        { absenceLookbackDays: 7, absenceCountFromDate: '2026-11-01' },
        now
      )
    ).toBe('2026-11-13');
  });
});
