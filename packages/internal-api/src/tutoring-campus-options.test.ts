import { describe, expect, it } from 'vitest';
import {
  EASY_CENTER_TUTORING_POLICY,
  getTutoringCampusChoices,
  parseTutoringCampusOptions,
  parseTutoringPolicy,
  readTutoringPolicyConfigRows,
  STANDARD_TUTORING_POLICY,
  serializeTutoringPolicyConfigRows,
} from './tutoring-policy';

const groupId = '11111111-1111-4111-8111-111111111111';
const otherGroupId = '22222222-2222-4222-8222-222222222222';

describe('tutoring campus options parser', () => {
  it('reads a missing list as empty and accepts an empty list', () => {
    expect(parseTutoringCampusOptions(undefined)).toEqual([]);
    expect(parseTutoringCampusOptions([])).toEqual([]);
  });

  it('trims labels, drops blanks and removes duplicates in order', () => {
    expect(
      parseTutoringCampusOptions([
        '  Campus North ',
        '',
        '   ',
        'Campus South',
        'Campus North',
      ])
    ).toEqual(['Campus North', 'Campus South']);
  });

  it('caps each label at 80 characters after trimming', () => {
    const longest = 'x'.repeat(80);
    expect(parseTutoringCampusOptions([` ${longest} `])).toEqual([longest]);
    expect(parseTutoringCampusOptions(['x'.repeat(81)])).toBeNull();
  });

  it('rejects non-list and non-string values', () => {
    expect(parseTutoringCampusOptions('Campus North')).toBeNull();
    expect(parseTutoringCampusOptions(null)).toBeNull();
    expect(parseTutoringCampusOptions(['Campus North', 3])).toBeNull();
    expect(
      parseTutoringCampusOptions(Array.from({ length: 101 }, (_, i) => `${i}`))
    ).toBeNull();
  });
});

describe('tutoring policy campus options', () => {
  it('parses a legacy policy without the key unchanged apart from the empty default', () => {
    const { campusOptions: _omitted, ...legacy } = {
      ...EASY_CENTER_TUTORING_POLICY,
      campusByGroupId: { [groupId]: 'Campus North' },
    };
    expect(parseTutoringPolicy(legacy)).toEqual({
      ...legacy,
      campusOptions: [],
    });
    expect(STANDARD_TUTORING_POLICY.campusOptions).toEqual([]);
  });

  it('normalizes the list and rejects an over-long label at the write boundary', () => {
    expect(
      parseTutoringPolicy({
        ...STANDARD_TUTORING_POLICY,
        campusOptions: [' Campus North', 'Campus North', ''],
      })?.campusOptions
    ).toEqual(['Campus North']);
    expect(
      parseTutoringPolicy({
        ...STANDARD_TUTORING_POLICY,
        campusOptions: ['x'.repeat(81)],
      })
    ).toBeNull();
  });

  it('round trips the list through chunked storage with every other field preserved', () => {
    const policy = parseTutoringPolicy({
      ...EASY_CENTER_TUTORING_POLICY,
      preset: 'custom',
      campusByGroupId: { [groupId]: 'Campus North' },
      campusOptions: ['Campus North', 'Campus South'],
      shiftByGroupId: { [otherGroupId]: 'Shift 2' },
      parentMessageTemplate: 'A synthetic template {{campus}}',
    });
    expect(policy).not.toBeNull();
    expect(
      readTutoringPolicyConfigRows(serializeTutoringPolicyConfigRows(policy!))
    ).toEqual(policy);
  });
});

describe('tutoring campus choices', () => {
  it('unions the workspace list with legacy mapped labels without dropping any', () => {
    expect(
      getTutoringCampusChoices({
        campusByGroupId: {
          [groupId]: 'Campus North',
          [otherGroupId]: ' Legacy Annex ',
        },
        campusOptions: ['Campus North', 'Campus South'],
      })
    ).toEqual(['Campus North', 'Campus South', 'Legacy Annex']);
  });

  it('falls back to mapped labels when no list was saved', () => {
    expect(
      getTutoringCampusChoices({
        campusByGroupId: { [groupId]: 'Legacy Annex' },
      })
    ).toEqual(['Legacy Annex']);
    expect(getTutoringCampusChoices(STANDARD_TUTORING_POLICY)).toEqual([]);
  });
});
