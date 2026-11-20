import { expect, it } from 'vitest';
import {
  hasCompletedTuitionCoverage,
  vietnamBillingMonth,
} from './tuition-coverage';

it('uses the Vietnam month boundary for the Finance ledger', () => {
  expect(vietnamBillingMonth(new Date('2026-08-31T17:00:00Z'))).toBe('2026-09');
});

it('only covers explicit months when there is no legacy cutoff', () => {
  const ledger = [
    { subscription_months: ['2026-08-01', '2026-10-01'], valid_until: null },
  ];
  expect(hasCompletedTuitionCoverage('2026-08', ledger)).toBe(true);
  expect(hasCompletedTuitionCoverage('2026-09', ledger)).toBe(false);
  expect(hasCompletedTuitionCoverage('2026-10', ledger)).toBe(true);
});

it('does not reopen the legacy period when explicit billing starts', () => {
  const ledger = [
    { subscription_months: null, valid_until: '2026-08-31T17:00:00Z' },
    {
      subscription_months: ['2026-11-01'],
      valid_until: '2027-01-01T00:00:00Z',
    },
  ];
  expect(hasCompletedTuitionCoverage('2026-10', ledger)).toBe(true);
  expect(hasCompletedTuitionCoverage('2026-11', ledger)).toBe(true);
  expect(hasCompletedTuitionCoverage('2026-12', ledger)).toBe(false);
});

it('keeps the legacy cutoff month open when no exact invoice covers it', () => {
  const ledger = [
    { subscription_months: null, valid_until: '2026-10-01T00:00:00Z' },
  ];
  expect(hasCompletedTuitionCoverage('2026-09', ledger)).toBe(true);
  expect(hasCompletedTuitionCoverage('2026-10', ledger)).toBe(false);
  expect(hasCompletedTuitionCoverage('2026-10', [])).toBe(false);
});
