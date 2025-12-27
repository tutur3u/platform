import type { Habit } from '@tuturuuu/types/primitives/Habit';
import { describe, expect, it } from 'vitest';
import {
  calculateOccurrences,
  getNextOccurrence,
  getOccurrencesInRange,
  isOccurrenceDate,
} from './recurrence-calculator';

function createTestHabit(overrides: Partial<Habit>): Habit {
  return {
    id: 'test-habit-1',
    ws_id: 'ws-1',
    name: 'Test Habit',
    color: 'BLUE',
    calendar_hours: 'personal_hours',
    priority: 'normal',
    duration_minutes: 30,
    frequency: 'daily',
    recurrence_interval: 1,
    start_date: '2024-01-01',
    is_active: true,
    auto_schedule: true,
    is_visible_in_calendar: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * Helper to compare dates by their local date components (year, month, day)
 * This makes tests timezone-independent
 */
function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function expectDateEquals(actual: Date, expectedDateStr: string) {
  expect(toLocalDateString(actual)).toBe(expectedDateStr);
}

describe('Recurrence Calculator', () => {
  describe('Daily Recurrence', () => {
    it('should return every day for daily habit', () => {
      const habit = createTestHabit({
        frequency: 'daily',
        recurrence_interval: 1,
        start_date: '2024-01-01',
      });

      const occurrences = calculateOccurrences(
        habit,
        new Date('2024-01-01'),
        5
      );

      expect(occurrences).toHaveLength(5);
      expectDateEquals(occurrences[0]!, '2024-01-01');
      expectDateEquals(occurrences[1]!, '2024-01-02');
      expectDateEquals(occurrences[2]!, '2024-01-03');
      expectDateEquals(occurrences[3]!, '2024-01-04');
      expectDateEquals(occurrences[4]!, '2024-01-05');
    });

    it('should return every 3 days for interval of 3', () => {
      const habit = createTestHabit({
        frequency: 'daily',
        recurrence_interval: 3,
        start_date: '2024-01-01',
      });

      const occurrences = calculateOccurrences(
        habit,
        new Date('2024-01-01'),
        4
      );

      expect(occurrences).toHaveLength(4);
      expectDateEquals(occurrences[0]!, '2024-01-01');
      expectDateEquals(occurrences[1]!, '2024-01-04');
      expectDateEquals(occurrences[2]!, '2024-01-07');
      expectDateEquals(occurrences[3]!, '2024-01-10');
    });

    it('should respect end date', () => {
      const habit = createTestHabit({
        frequency: 'daily',
        recurrence_interval: 1,
        start_date: '2024-01-01',
        end_date: '2024-01-03',
      });

      const occurrences = calculateOccurrences(
        habit,
        new Date('2024-01-01'),
        10
      );

      expect(occurrences).toHaveLength(3);
    });
  });

  describe('Weekly Recurrence', () => {
    it('should return every week on same day', () => {
      const habit = createTestHabit({
        frequency: 'weekly',
        recurrence_interval: 1,
        start_date: '2024-01-01', // Monday
      });

      const occurrences = calculateOccurrences(
        habit,
        new Date('2024-01-01'),
        4
      );

      expect(occurrences).toHaveLength(4);
      expectDateEquals(occurrences[0]!, '2024-01-01');
      expectDateEquals(occurrences[1]!, '2024-01-08');
      expectDateEquals(occurrences[2]!, '2024-01-15');
      expectDateEquals(occurrences[3]!, '2024-01-22');
    });

    it('should return specific days of week', () => {
      const habit = createTestHabit({
        frequency: 'weekly',
        recurrence_interval: 1,
        start_date: '2024-01-01', // Monday
        days_of_week: [1, 3, 5], // Mon, Wed, Fri
      });

      const occurrences = calculateOccurrences(
        habit,
        new Date('2024-01-01'),
        6
      );

      expect(occurrences).toHaveLength(6);
      // Week 1: Mon Jan 1, Wed Jan 3, Fri Jan 5
      expectDateEquals(occurrences[0]!, '2024-01-01'); // Mon
      expectDateEquals(occurrences[1]!, '2024-01-03'); // Wed
      expectDateEquals(occurrences[2]!, '2024-01-05'); // Fri
      // Week 2: Mon Jan 8, Wed Jan 10, Fri Jan 12
      expectDateEquals(occurrences[3]!, '2024-01-08'); // Mon
      expectDateEquals(occurrences[4]!, '2024-01-10'); // Wed
      expectDateEquals(occurrences[5]!, '2024-01-12'); // Fri
    });

    it('should handle every 2 weeks', () => {
      const habit = createTestHabit({
        frequency: 'weekly',
        recurrence_interval: 2,
        start_date: '2024-01-01', // Monday
        days_of_week: [1], // Monday only
      });

      const occurrences = calculateOccurrences(
        habit,
        new Date('2024-01-01'),
        3
      );

      expect(occurrences).toHaveLength(3);
      expectDateEquals(occurrences[0]!, '2024-01-01');
      expectDateEquals(occurrences[1]!, '2024-01-15'); // 2 weeks later
      expectDateEquals(occurrences[2]!, '2024-01-29'); // 4 weeks later
    });
  });

  describe('Monthly Recurrence', () => {
    it('should return same day of month', () => {
      const habit = createTestHabit({
        frequency: 'monthly',
        recurrence_interval: 1,
        start_date: '2024-01-15',
        monthly_type: 'day_of_month',
        day_of_month: 15,
      });

      const occurrences = calculateOccurrences(
        habit,
        new Date('2024-01-15'),
        3
      );

      expect(occurrences).toHaveLength(3);
      expectDateEquals(occurrences[0]!, '2024-01-15');
      expectDateEquals(occurrences[1]!, '2024-02-15');
      expectDateEquals(occurrences[2]!, '2024-03-15');
    });

    it('should handle end of month edge case (31st)', () => {
      const habit = createTestHabit({
        frequency: 'monthly',
        recurrence_interval: 1,
        start_date: '2024-01-31',
        monthly_type: 'day_of_month',
        day_of_month: 31,
      });

      const occurrences = calculateOccurrences(
        habit,
        new Date('2024-01-31'),
        3
      );

      expect(occurrences).toHaveLength(3);
      expectDateEquals(occurrences[0]!, '2024-01-31');
      expectDateEquals(occurrences[1]!, '2024-02-29'); // Feb 29 (2024 is leap year)
      expectDateEquals(occurrences[2]!, '2024-03-31');
    });

    it('should return nth weekday of month (2nd Tuesday)', () => {
      const habit = createTestHabit({
        frequency: 'monthly',
        recurrence_interval: 1,
        start_date: '2024-01-09', // 2nd Tuesday of Jan 2024
        monthly_type: 'day_of_week',
        week_of_month: 2,
        day_of_week_monthly: 2, // Tuesday
      });

      const occurrences = calculateOccurrences(
        habit,
        new Date('2024-01-01'),
        3
      );

      expect(occurrences).toHaveLength(3);
      expectDateEquals(occurrences[0]!, '2024-01-09'); // 2nd Tue of Jan
      expectDateEquals(occurrences[1]!, '2024-02-13'); // 2nd Tue of Feb
      expectDateEquals(occurrences[2]!, '2024-03-12'); // 2nd Tue of Mar
    });

    it('should handle last weekday of month', () => {
      const habit = createTestHabit({
        frequency: 'monthly',
        recurrence_interval: 1,
        start_date: '2024-01-26', // Last Friday of Jan 2024
        monthly_type: 'day_of_week',
        week_of_month: 5, // 5 = last
        day_of_week_monthly: 5, // Friday
      });

      const occurrences = calculateOccurrences(
        habit,
        new Date('2024-01-01'),
        3
      );

      expect(occurrences).toHaveLength(3);
      expectDateEquals(occurrences[0]!, '2024-01-26'); // Last Fri of Jan
      expectDateEquals(occurrences[1]!, '2024-02-23'); // Last Fri of Feb
      expectDateEquals(occurrences[2]!, '2024-03-29'); // Last Fri of Mar
    });
  });

  describe('Yearly Recurrence', () => {
    it('should return same date every year', () => {
      const habit = createTestHabit({
        frequency: 'yearly',
        recurrence_interval: 1,
        start_date: '2024-03-15',
      });

      const occurrences = calculateOccurrences(
        habit,
        new Date('2024-03-15'),
        3
      );

      expect(occurrences).toHaveLength(3);
      expectDateEquals(occurrences[0]!, '2024-03-15');
      expectDateEquals(occurrences[1]!, '2025-03-15');
      expectDateEquals(occurrences[2]!, '2026-03-15');
    });

    it('should handle leap year birthday (Feb 29)', () => {
      const habit = createTestHabit({
        frequency: 'yearly',
        recurrence_interval: 1,
        start_date: '2024-02-29', // Leap year
      });

      const occurrences = calculateOccurrences(
        habit,
        new Date('2024-02-29'),
        2
      );

      expect(occurrences).toHaveLength(2);
      expectDateEquals(occurrences[0]!, '2024-02-29');
      expectDateEquals(occurrences[1]!, '2028-02-29'); // Next leap year
    });
  });

  describe('isOccurrenceDate', () => {
    it('should return true for valid occurrence', () => {
      const habit = createTestHabit({
        frequency: 'weekly',
        recurrence_interval: 1,
        start_date: '2024-01-01', // Monday
        days_of_week: [1, 3, 5],
      });

      expect(isOccurrenceDate(habit, new Date('2024-01-01'))).toBe(true); // Mon
      expect(isOccurrenceDate(habit, new Date('2024-01-03'))).toBe(true); // Wed
      expect(isOccurrenceDate(habit, new Date('2024-01-05'))).toBe(true); // Fri
    });

    it('should return false for non-occurrence', () => {
      const habit = createTestHabit({
        frequency: 'weekly',
        recurrence_interval: 1,
        start_date: '2024-01-01',
        days_of_week: [1, 3, 5],
      });

      expect(isOccurrenceDate(habit, new Date('2024-01-02'))).toBe(false); // Tue
      expect(isOccurrenceDate(habit, new Date('2024-01-04'))).toBe(false); // Thu
    });

    it('should return false for dates before start', () => {
      const habit = createTestHabit({
        frequency: 'daily',
        recurrence_interval: 1,
        start_date: '2024-01-15',
      });

      expect(isOccurrenceDate(habit, new Date('2024-01-01'))).toBe(false);
      expect(isOccurrenceDate(habit, new Date('2024-01-14'))).toBe(false);
    });

    it('should return false for dates after end', () => {
      const habit = createTestHabit({
        frequency: 'daily',
        recurrence_interval: 1,
        start_date: '2024-01-01',
        end_date: '2024-01-10',
      });

      expect(isOccurrenceDate(habit, new Date('2024-01-11'))).toBe(false);
      expect(isOccurrenceDate(habit, new Date('2024-01-15'))).toBe(false);
    });
  });

  describe('getNextOccurrence', () => {
    it('should find next occurrence after given date', () => {
      const habit = createTestHabit({
        frequency: 'weekly',
        recurrence_interval: 1,
        start_date: '2024-01-01',
        days_of_week: [1], // Monday only
      });

      const next = getNextOccurrence(habit, new Date('2024-01-02'));

      expect(next).not.toBeNull();
      expectDateEquals(next!, '2024-01-08');
    });

    it('should return null if no more occurrences', () => {
      const habit = createTestHabit({
        frequency: 'daily',
        recurrence_interval: 1,
        start_date: '2024-01-01',
        end_date: '2024-01-05',
      });

      const next = getNextOccurrence(habit, new Date('2024-01-05'));

      expect(next).toBeNull();
    });
  });

  describe('getOccurrencesInRange', () => {
    it('should return all occurrences in date range', () => {
      const habit = createTestHabit({
        frequency: 'daily',
        recurrence_interval: 1,
        start_date: '2024-01-01',
      });

      const occurrences = getOccurrencesInRange(
        habit,
        new Date('2024-01-05'),
        new Date('2024-01-10')
      );

      expect(occurrences).toHaveLength(6);
      expectDateEquals(occurrences[0]!, '2024-01-05');
      expectDateEquals(occurrences[5]!, '2024-01-10');
    });

    it('should handle habit start date within range', () => {
      const habit = createTestHabit({
        frequency: 'daily',
        recurrence_interval: 1,
        start_date: '2024-01-05',
      });

      const occurrences = getOccurrencesInRange(
        habit,
        new Date('2024-01-01'),
        new Date('2024-01-10')
      );

      expect(occurrences).toHaveLength(6); // Jan 5-10
      expectDateEquals(occurrences[0]!, '2024-01-05');
    });

    it('should handle habit end date within range', () => {
      const habit = createTestHabit({
        frequency: 'daily',
        recurrence_interval: 1,
        start_date: '2024-01-01',
        end_date: '2024-01-05',
      });

      const occurrences = getOccurrencesInRange(
        habit,
        new Date('2024-01-01'),
        new Date('2024-01-10')
      );

      expect(occurrences).toHaveLength(5); // Jan 1-5
    });
  });
});
