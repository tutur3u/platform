/**
 * Tests for Duration Optimizer
 *
 * Tests the smart duration optimization for habits, including:
 * - Duration bounds calculation (min/max/preferred)
 * - Optimal duration selection based on slot characteristics
 * - Time matching and preference detection
 * - Slot scoring and selection
 */

import type { TimeOfDayPreference } from '@tuturuuu/types/primitives/Habit';
import { describe, expect, it } from 'vitest';

import {
  calculateOptimalDuration,
  findBestSlotForHabit,
  getEffectiveDurationBounds,
  getSlotCharacteristics,
  type HabitDurationConfig,
  scoreSlotForHabit,
  slotMatchesPreference,
  timeMatchesSlot,
  type TimeSlotInfo,
} from './duration-optimizer';

// Helper to create a habit config with defaults
function createHabit(
  overrides: Partial<HabitDurationConfig> = {}
): HabitDurationConfig {
  return {
    duration_minutes: 30,
    min_duration_minutes: null,
    max_duration_minutes: null,
    ideal_time: null,
    time_preference: null,
    ...overrides,
  };
}

// Helper to create a time slot
function createSlot(
  startHour: number,
  endHour: number,
  maxAvailable?: number,
  baseDate: Date = new Date('2025-01-15')
): TimeSlotInfo {
  const start = new Date(baseDate);
  start.setHours(startHour, 0, 0, 0);

  const end = new Date(baseDate);
  end.setHours(endHour, 0, 0, 0);

  return {
    start,
    end,
    maxAvailable: maxAvailable ?? (endHour - startHour) * 60,
  };
}

describe('Duration Optimizer', () => {
  describe('getEffectiveDurationBounds', () => {
    it('should return explicit min/max when set', () => {
      const habit = createHabit({
        duration_minutes: 30,
        min_duration_minutes: 20,
        max_duration_minutes: 60,
      });

      const result = getEffectiveDurationBounds(habit);

      expect(result.preferred).toBe(30);
      expect(result.min).toBe(20);
      expect(result.max).toBe(60);
    });

    it('should calculate default min as 50% of preferred (minimum 15)', () => {
      const habit = createHabit({ duration_minutes: 60 });
      const result = getEffectiveDurationBounds(habit);
      expect(result.min).toBe(30); // 50% of 60
    });

    it('should enforce minimum of 15 minutes for calculated min', () => {
      const habit = createHabit({ duration_minutes: 20 });
      const result = getEffectiveDurationBounds(habit);
      expect(result.min).toBe(15); // 50% of 20 = 10, but minimum is 15
    });

    it('should calculate default max as 150% of preferred', () => {
      const habit = createHabit({ duration_minutes: 60 });
      const result = getEffectiveDurationBounds(habit);
      expect(result.max).toBe(90); // 150% of 60
    });

    it('should enforce maximum of 180 minutes for calculated max', () => {
      const habit = createHabit({ duration_minutes: 150 });
      const result = getEffectiveDurationBounds(habit);
      expect(result.max).toBe(180); // 150% of 150 = 225, but max is 180
    });

    it('should handle small durations correctly', () => {
      const habit = createHabit({ duration_minutes: 15 });
      const result = getEffectiveDurationBounds(habit);
      expect(result.preferred).toBe(15);
      expect(result.min).toBe(15); // 50% of 15 = 7.5, floored = 7, but minimum is 15
      expect(result.max).toBe(23); // 150% of 15 = 22.5, ceiled = 23
    });

    it('should handle explicit min without explicit max', () => {
      const habit = createHabit({
        duration_minutes: 30,
        min_duration_minutes: 10,
      });
      const result = getEffectiveDurationBounds(habit);
      expect(result.min).toBe(10);
      expect(result.max).toBe(45); // calculated: 150% of 30
    });

    it('should handle explicit max without explicit min', () => {
      const habit = createHabit({
        duration_minutes: 30,
        max_duration_minutes: 90,
      });
      const result = getEffectiveDurationBounds(habit);
      expect(result.min).toBe(15); // calculated: 50% of 30
      expect(result.max).toBe(90);
    });
  });

  describe('timeMatchesSlot', () => {
    it('should return true when ideal_time falls within slot', () => {
      const slot = createSlot(9, 12); // 9am-12pm
      expect(timeMatchesSlot('10:30', slot)).toBe(true);
    });

    it('should return true when ideal_time is at slot start', () => {
      const slot = createSlot(9, 12);
      expect(timeMatchesSlot('09:00', slot)).toBe(true);
    });

    it('should return false when ideal_time is at slot end', () => {
      const slot = createSlot(9, 12);
      expect(timeMatchesSlot('12:00', slot)).toBe(false); // end is exclusive
    });

    it('should return false when ideal_time is before slot', () => {
      const slot = createSlot(9, 12);
      expect(timeMatchesSlot('08:00', slot)).toBe(false);
    });

    it('should return false when ideal_time is after slot', () => {
      const slot = createSlot(9, 12);
      expect(timeMatchesSlot('13:00', slot)).toBe(false);
    });

    it('should handle midnight correctly', () => {
      const slot = createSlot(23, 24);
      expect(timeMatchesSlot('23:30', slot)).toBe(true);
    });

    it('should return false for invalid time format', () => {
      const slot = createSlot(9, 12);
      expect(timeMatchesSlot('invalid', slot)).toBe(false);
    });
  });

  describe('slotMatchesPreference', () => {
    describe('morning preference (6am-12pm)', () => {
      it('should return true for slot fully within morning', () => {
        const slot = createSlot(8, 10);
        expect(slotMatchesPreference('morning', slot)).toBe(true);
      });

      it('should return true for slot overlapping morning start', () => {
        const slot = createSlot(5, 8);
        expect(slotMatchesPreference('morning', slot)).toBe(true);
      });

      it('should return true for slot overlapping morning end', () => {
        const slot = createSlot(11, 14);
        expect(slotMatchesPreference('morning', slot)).toBe(true);
      });

      it('should return false for slot completely outside morning', () => {
        const slot = createSlot(14, 17);
        expect(slotMatchesPreference('morning', slot)).toBe(false);
      });
    });

    describe('afternoon preference (12pm-5pm)', () => {
      it('should return true for slot within afternoon', () => {
        const slot = createSlot(13, 15);
        expect(slotMatchesPreference('afternoon', slot)).toBe(true);
      });

      it('should return false for morning slot', () => {
        const slot = createSlot(8, 11);
        expect(slotMatchesPreference('afternoon', slot)).toBe(false);
      });
    });

    describe('evening preference (5pm-9pm)', () => {
      it('should return true for slot within evening', () => {
        const slot = createSlot(18, 20);
        expect(slotMatchesPreference('evening', slot)).toBe(true);
      });

      it('should return true for slot overlapping evening', () => {
        const slot = createSlot(16, 19);
        expect(slotMatchesPreference('evening', slot)).toBe(true);
      });

      it('should return false for afternoon slot', () => {
        const slot = createSlot(13, 16);
        expect(slotMatchesPreference('evening', slot)).toBe(false);
      });
    });

    describe('night preference (9pm-12am)', () => {
      it('should return true for slot within night', () => {
        const slot = createSlot(22, 23);
        expect(slotMatchesPreference('night', slot)).toBe(true);
      });

      it('should return false for evening slot', () => {
        const slot = createSlot(18, 20);
        expect(slotMatchesPreference('night', slot)).toBe(false);
      });
    });

    it('should return false for invalid preference', () => {
      const slot = createSlot(10, 12);
      expect(
        slotMatchesPreference('invalid' as TimeOfDayPreference, slot)
      ).toBe(false);
    });
  });

  describe('getSlotCharacteristics', () => {
    it('should detect ideal time match', () => {
      const habit = createHabit({ ideal_time: '10:00' });
      const slot = createSlot(9, 12);

      const result = getSlotCharacteristics(habit, slot);

      expect(result.matchesIdealTime).toBe(true);
      expect(result.matchesPreference).toBe(false);
    });

    it('should detect time preference match', () => {
      const habit = createHabit({ time_preference: 'morning' });
      const slot = createSlot(9, 11);

      const result = getSlotCharacteristics(habit, slot);

      expect(result.matchesIdealTime).toBe(false);
      expect(result.matchesPreference).toBe(true);
    });

    it('should detect both matches', () => {
      const habit = createHabit({
        ideal_time: '10:00',
        time_preference: 'morning',
      });
      const slot = createSlot(9, 12);

      const result = getSlotCharacteristics(habit, slot);

      expect(result.matchesIdealTime).toBe(true);
      expect(result.matchesPreference).toBe(true);
    });

    it('should return no matches when neither applies', () => {
      const habit = createHabit({
        ideal_time: '15:00',
        time_preference: 'evening',
      });
      const slot = createSlot(9, 12);

      const result = getSlotCharacteristics(habit, slot);

      expect(result.matchesIdealTime).toBe(false);
      expect(result.matchesPreference).toBe(false);
    });

    it('should handle habit with no preferences', () => {
      const habit = createHabit();
      const slot = createSlot(9, 12);

      const result = getSlotCharacteristics(habit, slot);

      expect(result.matchesIdealTime).toBe(false);
      expect(result.matchesPreference).toBe(false);
    });
  });

  describe('calculateOptimalDuration', () => {
    it('should return max duration for ideal time match', () => {
      const habit = createHabit({
        duration_minutes: 30,
        max_duration_minutes: 60,
      });
      const slot = createSlot(9, 12, 120); // 2 hours available
      const characteristics = {
        matchesIdealTime: true,
        matchesPreference: true,
      };

      const result = calculateOptimalDuration(habit, slot, characteristics);

      expect(result).toBe(60); // Uses max_duration_minutes
    });

    it('should cap at slot availability for ideal time match', () => {
      const habit = createHabit({
        duration_minutes: 30,
        max_duration_minutes: 120,
      });
      const slot = createSlot(9, 10, 45); // Only 45 minutes available
      const characteristics = {
        matchesIdealTime: true,
        matchesPreference: true,
      };

      const result = calculateOptimalDuration(habit, slot, characteristics);

      expect(result).toBe(45); // Capped at slot availability
    });

    it('should return preferred duration for preference match (no ideal match)', () => {
      const habit = createHabit({
        duration_minutes: 30,
        max_duration_minutes: 60,
      });
      const slot = createSlot(9, 12, 120);
      const characteristics = {
        matchesIdealTime: false,
        matchesPreference: true,
      };

      const result = calculateOptimalDuration(habit, slot, characteristics);

      expect(result).toBe(30); // Uses preferred, not max
    });

    it('should return minimum when slot is constrained', () => {
      const habit = createHabit({
        duration_minutes: 60,
        min_duration_minutes: 30,
      });
      const slot = createSlot(9, 10, 45); // Less than preferred
      const characteristics = {
        matchesIdealTime: false,
        matchesPreference: false,
      };

      const result = calculateOptimalDuration(habit, slot, characteristics);

      expect(result).toBe(45); // Uses all available, above min
    });

    it('should return 0 when slot is too small for minimum', () => {
      const habit = createHabit({
        duration_minutes: 60,
        min_duration_minutes: 30,
      });
      const slot = createSlot(9, 10, 20); // Less than minimum
      const characteristics = {
        matchesIdealTime: false,
        matchesPreference: false,
      };

      const result = calculateOptimalDuration(habit, slot, characteristics);

      expect(result).toBe(0); // Can't fit
    });

    it('should return preferred duration for no special conditions', () => {
      const habit = createHabit({
        duration_minutes: 30,
        min_duration_minutes: 15,
        max_duration_minutes: 60,
      });
      const slot = createSlot(9, 12, 120);
      const characteristics = {
        matchesIdealTime: false,
        matchesPreference: false,
      };

      const result = calculateOptimalDuration(habit, slot, characteristics);

      expect(result).toBe(30); // Uses preferred
    });

    it('should use calculated defaults for duration bounds', () => {
      const habit = createHabit({ duration_minutes: 40 }); // No explicit min/max
      const slot = createSlot(9, 12, 120);
      const characteristics = {
        matchesIdealTime: true,
        matchesPreference: false,
      };

      const result = calculateOptimalDuration(habit, slot, characteristics);

      // Max should be 150% of 40 = 60 minutes
      expect(result).toBe(60);
    });
  });

  describe('scoreSlotForHabit', () => {
    it('should give highest score to ideal time match', () => {
      const habit = createHabit({
        duration_minutes: 30,
        ideal_time: '10:00',
      });
      const idealSlot = createSlot(9, 12, 120);

      const score = scoreSlotForHabit(habit, idealSlot);

      expect(score).toBeGreaterThanOrEqual(1000); // Ideal time bonus
    });

    it('should give medium score to preference match', () => {
      const habit = createHabit({
        duration_minutes: 30,
        time_preference: 'morning',
      });
      const morningSlot = createSlot(9, 11, 120);
      const afternoonSlot = createSlot(14, 16, 120);

      const morningScore = scoreSlotForHabit(habit, morningSlot);
      const afternoonScore = scoreSlotForHabit(habit, afternoonSlot);

      expect(morningScore).toBeGreaterThan(afternoonScore);
      expect(morningScore).toBeGreaterThanOrEqual(500); // Preference bonus
    });

    it('should give bonus for slots that fit preferred duration', () => {
      const habit = createHabit({
        duration_minutes: 60,
        min_duration_minutes: 30,
      });
      const largeSlot = createSlot(9, 12, 120); // Fits preferred
      const smallSlot = createSlot(9, 10, 45); // Only fits min

      const largeScore = scoreSlotForHabit(habit, largeSlot);
      const smallScore = scoreSlotForHabit(habit, smallSlot);

      expect(largeScore).toBeGreaterThan(smallScore);
    });

    it('should prefer earlier slots (tiebreaker)', () => {
      const habit = createHabit({ duration_minutes: 30 });
      const earlySlot = createSlot(8, 10, 60);
      const lateSlot = createSlot(16, 18, 60);

      const earlyScore = scoreSlotForHabit(habit, earlySlot);
      const lateScore = scoreSlotForHabit(habit, lateSlot);

      // Both have same base score (can fit preferred), but early is slightly better
      expect(earlyScore).toBeGreaterThan(lateScore);
    });

    it('should combine multiple bonuses correctly', () => {
      const habit = createHabit({
        duration_minutes: 30,
        ideal_time: '10:00',
        time_preference: 'morning',
      });
      const perfectSlot = createSlot(9, 12, 120); // Matches ideal + preference + fits

      const score = scoreSlotForHabit(habit, perfectSlot);

      // Should have: ideal time (1000) + preference (500) + fits preferred (200) - tiebreaker (9 * 0.1 = 0.9)
      // Total: 1699.1
      expect(score).toBeGreaterThanOrEqual(1699);
    });
  });

  describe('findBestSlotForHabit', () => {
    it('should return null when no slots provided', () => {
      const habit = createHabit({ duration_minutes: 30 });
      const result = findBestSlotForHabit(habit, []);
      expect(result).toBeNull();
    });

    it('should return null when no slots are viable', () => {
      const habit = createHabit({
        duration_minutes: 60,
        min_duration_minutes: 30,
      });
      const tinySlots = [
        createSlot(9, 10, 15), // Too small
        createSlot(11, 12, 20), // Too small
      ];

      const result = findBestSlotForHabit(habit, tinySlots);

      expect(result).toBeNull();
    });

    it('should return the only viable slot', () => {
      const habit = createHabit({
        duration_minutes: 30,
        min_duration_minutes: 15,
      });
      const slots = [
        createSlot(9, 10, 10), // Too small
        createSlot(11, 12, 45), // Viable
        createSlot(13, 14, 10), // Too small
      ];

      const result = findBestSlotForHabit(habit, slots);

      expect(result).not.toBeNull();
      expect(result?.start.getHours()).toBe(11);
    });

    it('should return best scoring slot when multiple are available', () => {
      const habit = createHabit({
        duration_minutes: 30,
        ideal_time: '10:00',
        time_preference: 'morning',
      });
      const slots = [
        createSlot(14, 16, 60), // Afternoon - no match
        createSlot(9, 12, 60), // Morning with ideal time - best
        createSlot(7, 9, 60), // Morning - good but no ideal time
      ];

      const result = findBestSlotForHabit(habit, slots);

      expect(result).not.toBeNull();
      expect(result?.start.getHours()).toBe(9); // The one with ideal time
    });

    it('should prefer earlier slot when scores are similar', () => {
      const habit = createHabit({ duration_minutes: 30 });
      const slots = [
        createSlot(14, 16, 60),
        createSlot(10, 12, 60),
        createSlot(8, 10, 60), // Earliest - should win
      ];

      const result = findBestSlotForHabit(habit, slots);

      expect(result).not.toBeNull();
      expect(result?.start.getHours()).toBe(8);
    });

    it('should prefer slot that fits preferred over one that only fits min', () => {
      const habit = createHabit({
        duration_minutes: 60,
        min_duration_minutes: 30,
      });
      const slots = [
        createSlot(8, 9, 45), // Can only fit min
        createSlot(14, 16, 90), // Can fit preferred (despite being later)
      ];

      const result = findBestSlotForHabit(habit, slots);

      expect(result).not.toBeNull();
      expect(result?.start.getHours()).toBe(14); // Fits preferred, even though later
    });

    it('should handle complex multi-factor selection', () => {
      const habit = createHabit({
        duration_minutes: 45,
        min_duration_minutes: 30,
        max_duration_minutes: 90,
        ideal_time: '15:00',
        time_preference: 'afternoon',
      });
      const slots = [
        createSlot(8, 10, 60), // Morning - no match
        createSlot(12, 14, 60), // Early afternoon - preference match
        createSlot(14, 17, 90), // Afternoon with ideal time - best
        createSlot(18, 20, 60), // Evening - no match
      ];

      const result = findBestSlotForHabit(habit, slots);

      expect(result).not.toBeNull();
      expect(result?.start.getHours()).toBe(14); // Has ideal time + preference
    });
  });

  describe('integration scenarios', () => {
    it('should handle a typical morning meditation habit', () => {
      const meditation = createHabit({
        duration_minutes: 20,
        min_duration_minutes: 10,
        max_duration_minutes: 30,
        ideal_time: '06:30',
        time_preference: 'morning',
      });

      const slots = [
        createSlot(6, 7, 60), // Contains ideal time
        createSlot(8, 9, 45), // Morning but no ideal time
        createSlot(12, 13, 60), // Afternoon
      ];

      const bestSlot = findBestSlotForHabit(meditation, slots);
      expect(bestSlot?.start.getHours()).toBe(6);

      const characteristics = getSlotCharacteristics(meditation, bestSlot!);
      expect(characteristics.matchesIdealTime).toBe(true);
      expect(characteristics.matchesPreference).toBe(true);

      const duration = calculateOptimalDuration(
        meditation,
        bestSlot!,
        characteristics
      );
      expect(duration).toBe(30); // Max because ideal time match
    });

    it('should handle an evening workout habit', () => {
      const workout = createHabit({
        duration_minutes: 60,
        min_duration_minutes: 30,
        max_duration_minutes: 90,
        time_preference: 'evening',
      });

      const slots = [
        createSlot(7, 8, 45), // Morning - constrained
        createSlot(17, 19, 120), // Evening - perfect
        createSlot(21, 22, 45), // Night - constrained
      ];

      const bestSlot = findBestSlotForHabit(workout, slots);
      expect(bestSlot?.start.getHours()).toBe(17);

      const characteristics = getSlotCharacteristics(workout, bestSlot!);
      expect(characteristics.matchesIdealTime).toBe(false);
      expect(characteristics.matchesPreference).toBe(true);

      const duration = calculateOptimalDuration(
        workout,
        bestSlot!,
        characteristics
      );
      expect(duration).toBe(60); // Preferred because preference match
    });

    it('should handle habit with only explicit bounds', () => {
      const reading = createHabit({
        duration_minutes: 45,
        min_duration_minutes: 20,
        max_duration_minutes: 90,
      });

      const slot = createSlot(20, 22, 60);
      const characteristics = getSlotCharacteristics(reading, slot);

      // No preferences set
      expect(characteristics.matchesIdealTime).toBe(false);
      expect(characteristics.matchesPreference).toBe(false);

      const duration = calculateOptimalDuration(reading, slot, characteristics);
      expect(duration).toBe(45); // Uses preferred since slot is adequate
    });

    it('should gracefully degrade when ideal slot unavailable', () => {
      const habit = createHabit({
        duration_minutes: 30,
        min_duration_minutes: 15,
        ideal_time: '10:00',
        time_preference: 'morning',
      });

      // No slot contains 10:00, but one is in the morning
      const slots = [
        createSlot(7, 9, 60), // Morning but no ideal time
        createSlot(14, 16, 60), // Afternoon
      ];

      const bestSlot = findBestSlotForHabit(habit, slots);
      expect(bestSlot?.start.getHours()).toBe(7); // Morning slot wins

      const characteristics = getSlotCharacteristics(habit, bestSlot!);
      expect(characteristics.matchesIdealTime).toBe(false);
      expect(characteristics.matchesPreference).toBe(true);
    });
  });
});
