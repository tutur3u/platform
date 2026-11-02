import { describe, expect, it } from 'vitest';
import {
  EASY_CENTER_TUTORING_POLICY,
  parseTutoringPolicy,
  readTutoringPolicyConfigRows,
  STANDARD_TUTORING_POLICY,
  serializeTutoringPolicyConfigRows,
} from './tutoring-policy';

const id = '00000000-0000-4000-8000-00000000000a';
const entry = {
  weekdays: [1, 5],
  note: 'Fixture note',
  updatedAt: '2026-11-03T03:00:00.000Z',
  updatedBy: id,
};
describe('student day overrides', () => {
  it('round trips through policy config saves', () => {
    const policy = {
      ...EASY_CENTER_TUTORING_POLICY,
      studentDayOverrides: { [id]: entry },
    };
    expect(
      readTutoringPolicyConfigRows(
        serializeTutoringPolicyConfigRows(parseTutoringPolicy(policy)!)
      )
    ).toEqual(policy);
  });
  it('leaves absent keys absent', () => {
    expect(parseTutoringPolicy(STANDARD_TUTORING_POLICY)).toEqual(
      STANDARD_TUTORING_POLICY
    );
  });
  it('keeps 500 entries within the chunk budget and rejects 501', () => {
    const studentDayOverrides = Object.fromEntries(
      Array.from({ length: 500 }, (_, i) => [
        `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`,
        entry,
      ])
    );
    const policy = parseTutoringPolicy({
      ...EASY_CENTER_TUTORING_POLICY,
      studentDayOverrides,
    });
    expect(policy?.studentDayOverrides).toEqual(studentDayOverrides);
    expect(
      serializeTutoringPolicyConfigRows(policy!).length
    ).toBeLessThanOrEqual(101);
    expect(
      parseTutoringPolicy({
        ...STANDARD_TUTORING_POLICY,
        studentDayOverrides: {
          ...studentDayOverrides,
          [id.replace('000a', 'ffff')]: entry,
        },
      })
    ).toBeNull();
  });
  it.each([
    { weekdays: [] },
    { weekdays: [7] },
    { weekdays: [1, 1] },
    { note: 'x'.repeat(201) },
    { updatedAt: 'invalid' },
    { updatedBy: 'invalid' },
  ])('drops invalid entry %j', (bad) => {
    expect(
      parseTutoringPolicy({
        ...STANDARD_TUTORING_POLICY,
        studentDayOverrides: {
          [id]: entry,
          '00000000-0000-4000-8000-00000000000b': { ...entry, ...bad },
          invalid: entry,
        },
      })?.studentDayOverrides
    ).toEqual({ [id]: entry });
  });
});
