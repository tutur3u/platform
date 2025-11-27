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
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
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
      expect(occurrences[0]).toEqual(new Date('2024-01-01T00:00:00.000Z'));
      expect(occurrences[1]).toEqual(new Date('2024-01-02T00:00:00.000Z'));
      expect(occurrences[2]).toEqual(new Date('2024-01-03T00:00:00.000Z'));
      expect(occurrences[3]).toEqual(new Date('2024-01-04T00:00:00.000Z'));
      expect(occurrences[4]).toEqual(new Date('2024-01-05T00:00:00.000Z'));
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
      expect(occurrences[0]).toEqual(new Date('2024-01-01T00:00:00.000Z'));
      expect(occurrences[1]).toEqual(new Date('2024-01-04T00:00:00.000Z'));
      expect(occurrences[2]).toEqual(new Date('2024-01-07T00:00:00.000Z'));
      expect(occurrences[3]).toEqual(new Date('2024-01-10T00:00:00.000Z'));
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
      expect(occurrences[0]).toEqual(new Date('2024-01-01T00:00:00.000Z'));
      expect(occurrences[1]).toEqual(new Date('2024-01-08T00:00:00.000Z'));
      expect(occurrences[2]).toEqual(new Date('2024-01-15T00:00:00.000Z'));
      expect(occurrences[3]).toEqual(new Date('2024-01-22T00:00:00.000Z'));
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
      expect(occurrences[0]).toEqual(new Date('2024-01-01T00:00:00.000Z')); // Mon
      expect(occurrences[1]).toEqual(new Date('2024-01-03T00:00:00.000Z')); // Wed
      expect(occurrences[2]).toEqual(new Date('2024-01-05T00:00:00.000Z')); // Fri
      // Week 2: Mon Jan 8, Wed Jan 10, Fri Jan 12
      expect(occurrences[3]).toEqual(new Date('2024-01-08T00:00:00.000Z')); // Mon
      expect(occurrences[4]).toEqual(new Date('2024-01-10T00:00:00.000Z')); // Wed
      expect(occurrences[5]).toEqual(new Date('2024-01-12T00:00:00.000Z')); // Fri
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
      expect(occurrences[0]).toEqual(new Date('2024-01-01T00:00:00.000Z'));
      expect(occurrences[1]).toEqual(new Date('2024-01-15T00:00:00.000Z')); // 2 weeks later
      expect(occurrences[2]).toEqual(new Date('2024-01-29T00:00:00.000Z')); // 4 weeks later
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
      expect(occurrences[0]).toEqual(new Date('2024-01-15T00:00:00.000Z'));
      expect(occurrences[1]).toEqual(new Date('2024-02-15T00:00:00.000Z'));
      expect(occurrences[2]).toEqual(new Date('2024-03-15T00:00:00.000Z'));
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
      expect(occurrences[0]).toEqual(new Date('2024-01-31T00:00:00.000Z'));
      expect(occurrences[1]).toEqual(new Date('2024-02-29T00:00:00.000Z')); // Feb 29 (2024 is leap year)
      expect(occurrences[2]).toEqual(new Date('2024-03-31T00:00:00.000Z'));
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
      expect(occurrences[0]).toEqual(new Date('2024-01-09T00:00:00.000Z')); // 2nd Tue of Jan
      expect(occurrences[1]).toEqual(new Date('2024-02-13T00:00:00.000Z')); // 2nd Tue of Feb
      expect(occurrences[2]).toEqual(new Date('2024-03-12T00:00:00.000Z')); // 2nd Tue of Mar
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
      expect(occurrences[0]).toEqual(new Date('2024-01-26T00:00:00.000Z')); // Last Fri of Jan
      expect(occurrences[1]).toEqual(new Date('2024-02-23T00:00:00.000Z')); // Last Fri of Feb
      expect(occurrences[2]).toEqual(new Date('2024-03-29T00:00:00.000Z')); // Last Fri of Mar
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
      expect(occurrences[0]).toEqual(new Date('2024-03-15T00:00:00.000Z'));
      expect(occurrences[1]).toEqual(new Date('2025-03-15T00:00:00.000Z'));
      expect(occurrences[2]).toEqual(new Date('2026-03-15T00:00:00.000Z'));
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
      expect(occurrences[0]).toEqual(new Date('2024-02-29T00:00:00.000Z'));
      expect(occurrences[1]).toEqual(new Date('2028-02-29T00:00:00.000Z')); // Next leap year
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

      expect(next).toEqual(new Date('2024-01-08T00:00:00.000Z'));
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
      expect(occurrences[0]).toEqual(new Date('2024-01-05T00:00:00.000Z'));
      expect(occurrences[5]).toEqual(new Date('2024-01-10T00:00:00.000Z'));
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
      expect(occurrences[0]).toEqual(new Date('2024-01-05T00:00:00.000Z'));
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
