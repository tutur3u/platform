import { describe, expect, it } from 'vitest';
import {
  currentFeeLockMonth,
  formatFeeLockMonth,
  normalizeFeeLockMonth,
  shiftFeeLockMonth,
} from './fee-lock-month';

describe('fee-lock month helpers', () => {
  it('reads the current month in Asia/Ho_Chi_Minh', () => {
    expect(currentFeeLockMonth(new Date('2026-11-30T17:30:00Z'))).toBe(
      '2026-12'
    );
    expect(currentFeeLockMonth(new Date('2026-11-30T16:30:00Z'))).toBe(
      '2026-11'
    );
  });

  it('normalizes, shifts across years and formats as MM/YYYY', () => {
    const now = new Date('2026-11-04T05:00:00Z');
    expect(normalizeFeeLockMonth('2026-12', now)).toBe('2026-12');
    expect(normalizeFeeLockMonth('2026-13', now)).toBe('2026-11');
    expect(normalizeFeeLockMonth(['2026-12'], now)).toBe('2026-11');
    expect(shiftFeeLockMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftFeeLockMonth('2026-01', -1)).toBe('2025-12');
    expect(formatFeeLockMonth('2026-12')).toBe('12/2026');
  });
});
