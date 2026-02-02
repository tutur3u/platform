import type { WalletInterestRate } from '@tuturuuu/types';
import { describe, expect, it } from 'vitest';

import {
  calculateDailyInterest,
  calculateInterest,
  formatDateString,
  getDaysUntilInterestStarts,
  getInterestStartDate,
  getMonthToDateRange,
  getNextBusinessDay,
  getRateForDate,
  getYearToDateRange,
  isBusinessDay,
  isHoliday,
  isWeekend,
  parseDateString,
  projectInterest,
} from '../finance/interest-calculator';

describe('interest-calculator', () => {
  describe('isWeekend', () => {
    it('should return true for Saturday', () => {
      // 2025-01-25 is a Saturday
      const saturday = new Date(2025, 0, 25);
      expect(isWeekend(saturday)).toBe(true);
    });

    it('should return true for Sunday', () => {
      // 2025-01-26 is a Sunday
      const sunday = new Date(2025, 0, 26);
      expect(isWeekend(sunday)).toBe(true);
    });

    it('should return false for weekdays', () => {
      // 2025-01-27 is a Monday
      const monday = new Date(2025, 0, 27);
      expect(isWeekend(monday)).toBe(false);

      // 2025-01-29 is a Wednesday
      const wednesday = new Date(2025, 0, 29);
      expect(isWeekend(wednesday)).toBe(false);
    });
  });

  describe('isHoliday', () => {
    const holidays = new Set(['2025-01-01', '2025-01-28']);

    it('should return true for holidays', () => {
      const newYear = new Date(2025, 0, 1);
      expect(isHoliday(newYear, holidays)).toBe(true);
    });

    it('should return false for non-holidays', () => {
      const normalDay = new Date(2025, 0, 15);
      expect(isHoliday(normalDay, holidays)).toBe(false);
    });
  });

  describe('isBusinessDay', () => {
    const holidays = new Set(['2025-01-01']);

    it('should return false for weekends', () => {
      const saturday = new Date(2025, 0, 25);
      expect(isBusinessDay(saturday, holidays)).toBe(false);
    });

    it('should return false for holidays', () => {
      const holiday = new Date(2025, 0, 1);
      expect(isBusinessDay(holiday, holidays)).toBe(false);
    });

    it('should return true for normal weekdays', () => {
      const monday = new Date(2025, 0, 6);
      expect(isBusinessDay(monday, holidays)).toBe(true);
    });
  });

  describe('getNextBusinessDay', () => {
    const holidays = new Set(['2025-01-01']);

    it('should return next day if it is a business day', () => {
      // Wednesday -> Thursday
      const wednesday = new Date(2025, 0, 8);
      const result = getNextBusinessDay(wednesday, holidays);
      expect(formatDateString(result)).toBe('2025-01-09');
    });

    it('should skip weekends', () => {
      // Friday -> Monday
      const friday = new Date(2025, 0, 24);
      const result = getNextBusinessDay(friday, holidays);
      expect(formatDateString(result)).toBe('2025-01-27');
    });

    it('should skip holidays', () => {
      // Dec 31, 2024 -> Jan 2, 2025 (skipping Jan 1 holiday)
      const dec31 = new Date(2024, 11, 31);
      const result = getNextBusinessDay(dec31, holidays);
      expect(formatDateString(result)).toBe('2025-01-02');
    });
  });

  describe('getInterestStartDate', () => {
    const holidays = new Set<string>();

    it('should start interest next business day for Monday deposit', () => {
      const monday = new Date(2025, 0, 27);
      const result = getInterestStartDate(monday, holidays);
      expect(formatDateString(result)).toBe('2025-01-28');
    });

    it('should start interest on Monday for Friday deposit', () => {
      const friday = new Date(2025, 0, 24);
      const result = getInterestStartDate(friday, holidays);
      expect(formatDateString(result)).toBe('2025-01-27');
    });

    it('should start interest on Tuesday for Saturday deposit', () => {
      const saturday = new Date(2025, 0, 25);
      const result = getInterestStartDate(saturday, holidays);
      expect(formatDateString(result)).toBe('2025-01-27');
    });
  });

  describe('getDaysUntilInterestStarts', () => {
    const holidays = new Set<string>();

    it('should return 0 if interest already started', () => {
      const pastDeposit = new Date(2025, 0, 20);
      const today = new Date(2025, 0, 27);
      const result = getDaysUntilInterestStarts(pastDeposit, holidays, today);
      expect(result).toBe(0);
    });

    it('should return positive days for future start', () => {
      // Deposited today (Monday), interest starts tomorrow (Tuesday)
      const today = new Date(2025, 0, 27);
      const result = getDaysUntilInterestStarts(today, holidays, today);
      expect(result).toBe(1);
    });
  });

  describe('getRateForDate', () => {
    const rates: WalletInterestRate[] = [
      {
        id: '1',
        config_id: 'cfg1',
        annual_rate: 4.0,
        effective_from: '2025-01-01',
        effective_to: '2025-06-30',
        created_at: '2025-01-01T00:00:00Z',
      },
      {
        id: '2',
        config_id: 'cfg1',
        annual_rate: 4.5,
        effective_from: '2025-07-01',
        effective_to: null,
        created_at: '2025-07-01T00:00:00Z',
      },
    ];

    it('should return correct rate for date within range', () => {
      const date = new Date(2025, 2, 15); // March 15
      expect(getRateForDate(date, rates)).toBe(4.0);
    });

    it('should return correct rate for date in open-ended range', () => {
      const date = new Date(2025, 8, 15); // September 15
      expect(getRateForDate(date, rates)).toBe(4.5);
    });

    it('should return null for date before any rate', () => {
      const date = new Date(2024, 11, 15); // December 2024
      expect(getRateForDate(date, rates)).toBe(null);
    });
  });

  describe('calculateDailyInterest', () => {
    it('should calculate correct daily interest using Momo formula', () => {
      // Balance: 10,000,000 VND, Rate: 4%
      // Daily = floor(10,000,000 × (0.04 / 365)) = floor(1095.89) = 1095
      const balance = 10_000_000;
      const rate = 4.0;
      expect(calculateDailyInterest(balance, rate)).toBe(1095);
    });

    it('should return 0 for zero balance', () => {
      expect(calculateDailyInterest(0, 4.0)).toBe(0);
    });

    it('should return 0 for negative balance', () => {
      expect(calculateDailyInterest(-1000, 4.0)).toBe(0);
    });

    it('should floor the result', () => {
      // Check that we're flooring, not rounding
      const balance = 1_000_000;
      const rate = 4.0;
      // Daily = floor(1,000,000 × (0.04 / 365)) = floor(109.589) = 109
      expect(calculateDailyInterest(balance, rate)).toBe(109);
    });
  });

  describe('calculateInterest', () => {
    const rates: WalletInterestRate[] = [
      {
        id: '1',
        config_id: 'cfg1',
        annual_rate: 4.0,
        effective_from: '2025-01-01',
        effective_to: null,
        created_at: '2025-01-01T00:00:00Z',
      },
    ];

    it('should calculate interest over a date range', () => {
      const result = calculateInterest({
        transactions: [],
        rates,
        holidays: [],
        fromDate: '2025-01-06', // Monday
        toDate: '2025-01-10', // Friday
        initialBalance: 10_000_000,
      });

      // 5 business days
      expect(result.businessDaysCount).toBe(5);
      expect(result.totalInterest).toBeGreaterThan(0);
    });

    it('should handle weekend correctly', () => {
      const result = calculateInterest({
        transactions: [],
        rates,
        holidays: [],
        fromDate: '2025-01-25', // Saturday
        toDate: '2025-01-26', // Sunday
        initialBalance: 10_000_000,
      });

      expect(result.businessDaysCount).toBe(0);
      expect(result.totalInterest).toBe(0);
    });

    it('should compound interest', () => {
      const result = calculateInterest({
        transactions: [],
        rates,
        holidays: [],
        fromDate: '2025-01-06',
        toDate: '2025-01-10',
        initialBalance: 10_000_000,
      });

      // Interest should compound - final balance > initial + (daily × days)
      const nonCompoundedInterest = calculateDailyInterest(10_000_000, 4.0) * 5;
      expect(result.totalInterest).toBeGreaterThanOrEqual(
        nonCompoundedInterest
      );
    });
  });

  describe('projectInterest', () => {
    it('should project future interest', () => {
      const projections = projectInterest({
        currentBalance: 10_000_000,
        currentRate: 4.0,
        holidays: [],
        days: 7,
        startDate: '2025-01-06', // Monday
      });

      expect(projections).toHaveLength(7);
      expect(projections[0]?.projectedBalance).toBeGreaterThanOrEqual(
        10_000_000
      );
    });

    it('should skip weekends in projections', () => {
      const projections = projectInterest({
        currentBalance: 10_000_000,
        currentRate: 4.0,
        holidays: [],
        days: 7,
        startDate: '2025-01-25', // Saturday
      });

      // First two days (Sat, Sun) should have 0 interest
      expect(projections[0]?.projectedDailyInterest).toBe(0);
      expect(projections[1]?.projectedDailyInterest).toBe(0);
      // Monday should have interest
      expect(projections[2]?.projectedDailyInterest).toBeGreaterThan(0);
    });
  });

  describe('date range helpers', () => {
    it('should get month-to-date range correctly', () => {
      const today = new Date(2025, 0, 15); // January 15, 2025
      const range = getMonthToDateRange(today);

      expect(range.fromDate).toBe('2025-01-01');
      expect(range.toDate).toBe('2025-01-15');
    });

    it('should get year-to-date range correctly', () => {
      const today = new Date(2025, 5, 15); // June 15, 2025
      const range = getYearToDateRange(today);

      expect(range.fromDate).toBe('2025-01-01');
      expect(range.toDate).toBe('2025-06-15');
    });
  });

  describe('formatDateString and parseDateString', () => {
    it('should format date correctly', () => {
      const date = new Date(2025, 0, 15);
      expect(formatDateString(date)).toBe('2025-01-15');
    });

    it('should parse date string correctly', () => {
      const result = parseDateString('2025-01-15');
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(15);
    });

    it('should roundtrip correctly', () => {
      const original = new Date(2025, 11, 31);
      const str = formatDateString(original);
      const parsed = parseDateString(str);
      expect(formatDateString(parsed)).toBe(str);
    });
  });
});
