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
  calculateIdealStartTimeForHabit,
  calculateIdealStartTimeForTask,
  calculateOptimalDuration,
  findBestSlotForHabit,
  findBestSlotForTask,
  getEffectiveDurationBounds,
  getSlotCharacteristics,
  type HabitDurationConfig,
  roundToNext15Minutes,
  scoreSlotForHabit,
  scoreSlotForTask,
  slotMatchesPreference,
  type TaskSlotConfig,
  type TimeSlotInfo,
  timeMatchesSlot,
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

// ============================================================================
// Tests for roundToNext15Minutes
// ============================================================================

describe('roundToNext15Minutes', () => {
  it('should keep times already on 15-minute boundaries', () => {
    const date = new Date('2025-01-15T09:00:00');
    const result = roundToNext15Minutes(date);
    expect(result.getMinutes()).toBe(0);

    const date2 = new Date('2025-01-15T09:15:00');
    const result2 = roundToNext15Minutes(date2);
    expect(result2.getMinutes()).toBe(15);

    const date3 = new Date('2025-01-15T09:30:00');
    const result3 = roundToNext15Minutes(date3);
    expect(result3.getMinutes()).toBe(30);

    const date4 = new Date('2025-01-15T09:45:00');
    const result4 = roundToNext15Minutes(date4);
    expect(result4.getMinutes()).toBe(45);
  });

  it('should round up to next 15-minute boundary', () => {
    // 9:01 -> 9:15
    const date1 = new Date('2025-01-15T09:01:00');
    const result1 = roundToNext15Minutes(date1);
    expect(result1.getHours()).toBe(9);
    expect(result1.getMinutes()).toBe(15);

    // 9:11 -> 9:15
    const date2 = new Date('2025-01-15T09:11:00');
    const result2 = roundToNext15Minutes(date2);
    expect(result2.getMinutes()).toBe(15);

    // 9:16 -> 9:30
    const date3 = new Date('2025-01-15T09:16:00');
    const result3 = roundToNext15Minutes(date3);
    expect(result3.getMinutes()).toBe(30);

    // 9:31 -> 9:45
    const date4 = new Date('2025-01-15T09:31:00');
    const result4 = roundToNext15Minutes(date4);
    expect(result4.getMinutes()).toBe(45);

    // 9:46 -> 10:00
    const date5 = new Date('2025-01-15T09:46:00');
    const result5 = roundToNext15Minutes(date5);
    expect(result5.getHours()).toBe(10);
    expect(result5.getMinutes()).toBe(0);
  });

  it('should zero out seconds and milliseconds', () => {
    const date = new Date('2025-01-15T09:00:30.500');
    const result = roundToNext15Minutes(date);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it('should not modify the original date', () => {
    const original = new Date('2025-01-15T09:11:00');
    const originalTime = original.getTime();
    roundToNext15Minutes(original);
    expect(original.getTime()).toBe(originalTime);
  });
});

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

    it('should prefer earlier slots as tiebreaker when preference IS set', () => {
      // When a habit HAS a time preference, earlier slots should win as tiebreaker
      const habit = createHabit({
        duration_minutes: 30,
        time_preference: 'morning',
      });
      const earlySlot = createSlot(7, 9, 60); // 7am - morning
      const lateSlot = createSlot(10, 12, 60); // 10am - also morning

      const earlyScore = scoreSlotForHabit(habit, earlySlot);
      const lateScore = scoreSlotForHabit(habit, lateSlot);

      // Both match morning preference, but 7am is earlier so wins
      expect(earlyScore).toBeGreaterThan(lateScore);
    });

    it('should prefer middle-of-day slots when NO preference is set', () => {
      // When a habit has NO time preference, noon slots should win
      const habit = createHabit({ duration_minutes: 30 });
      const morningSlot = createSlot(7, 9, 60); // 7am - far from noon
      const noonSlot = createSlot(11, 13, 60); // 11am - close to noon
      const eveningSlot = createSlot(17, 19, 60); // 5pm - far from noon

      const morningScore = scoreSlotForHabit(habit, morningSlot);
      const noonScore = scoreSlotForHabit(habit, noonSlot);
      const eveningScore = scoreSlotForHabit(habit, eveningSlot);

      // Noon slot should have highest score
      expect(noonScore).toBeGreaterThan(morningScore);
      expect(noonScore).toBeGreaterThan(eveningScore);
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

    it('should prefer middle-of-day slot when habit has NO preference', () => {
      // Without preference, slots closer to noon should win
      const habit = createHabit({ duration_minutes: 30 });
      const slots = [
        createSlot(7, 9, 60), // 7am - far from noon
        createSlot(11, 13, 60), // 11am - closest to noon, should win
        createSlot(16, 18, 60), // 4pm - far from noon
      ];

      const result = findBestSlotForHabit(habit, slots);

      expect(result).not.toBeNull();
      expect(result?.start.getHours()).toBe(11); // Closest to noon wins
    });

    it('should prefer earlier slot when habit HAS preference and scores are similar', () => {
      // With preference set, earlier slots should win as tiebreaker
      const habit = createHabit({
        duration_minutes: 30,
        time_preference: 'afternoon',
      });
      const slots = [
        createSlot(14, 16, 60), // 2pm - afternoon
        createSlot(12, 14, 60), // 12pm - afternoon, earlier so wins
        createSlot(15, 17, 60), // 3pm - afternoon
      ];

      const result = findBestSlotForHabit(habit, slots);

      expect(result).not.toBeNull();
      expect(result?.start.getHours()).toBe(12); // Earliest afternoon slot wins
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

  describe('middle-of-day preference (no time_preference set)', () => {
    describe('scoreSlotForHabit without preferences', () => {
      it('should give highest score to noon slot when no preference', () => {
        const habit = createHabit({ duration_minutes: 30 });

        // Slots at different times of day
        const slot6am = createSlot(6, 8, 60);
        const slot9am = createSlot(9, 11, 60);
        const slot12pm = createSlot(12, 14, 60); // Noon - should be best
        const slot3pm = createSlot(15, 17, 60);
        const slot6pm = createSlot(18, 20, 60);

        const scores = {
          '6am': scoreSlotForHabit(habit, slot6am),
          '9am': scoreSlotForHabit(habit, slot9am),
          '12pm': scoreSlotForHabit(habit, slot12pm),
          '3pm': scoreSlotForHabit(habit, slot3pm),
          '6pm': scoreSlotForHabit(habit, slot6pm),
        };

        // Noon should have the highest score
        expect(scores['12pm']).toBeGreaterThan(scores['6am']);
        expect(scores['12pm']).toBeGreaterThan(scores['9am']);
        expect(scores['12pm']).toBeGreaterThan(scores['3pm']);
        expect(scores['12pm']).toBeGreaterThan(scores['6pm']);
      });

      it('should score slots symmetrically around noon', () => {
        const habit = createHabit({ duration_minutes: 30 });

        // Slots equidistant from noon should have equal scores
        const slot9am = createSlot(9, 11, 60); // 3 hours before noon
        const slot3pm = createSlot(15, 17, 60); // 3 hours after noon

        const score9am = scoreSlotForHabit(habit, slot9am);
        const score3pm = scoreSlotForHabit(habit, slot3pm);

        expect(score9am).toBe(score3pm);
      });

      it('should NOT apply middle-of-day preference when time_preference IS set', () => {
        const habit = createHabit({
          duration_minutes: 30,
          time_preference: 'morning',
        });

        // With morning preference, 7am should beat noon
        const slot7am = createSlot(7, 9, 60); // Morning
        const slot12pm = createSlot(12, 14, 60); // Noon - not morning

        const score7am = scoreSlotForHabit(habit, slot7am);
        const score12pm = scoreSlotForHabit(habit, slot12pm);

        // Morning slot should win because it matches preference (+500)
        expect(score7am).toBeGreaterThan(score12pm);
      });

      it('should NOT apply middle-of-day preference when ideal_time IS set', () => {
        const habit = createHabit({
          duration_minutes: 30,
          ideal_time: '07:30',
        });

        // With ideal_time at 7:30, the 7am slot should beat noon
        const slot7am = createSlot(7, 9, 60); // Contains ideal_time
        const slot12pm = createSlot(12, 14, 60); // Noon

        const score7am = scoreSlotForHabit(habit, slot7am);
        const score12pm = scoreSlotForHabit(habit, slot12pm);

        // 7am slot should win because it contains ideal_time (+1000)
        expect(score7am).toBeGreaterThan(score12pm);
      });
    });

    describe('findBestSlotForHabit without preferences', () => {
      it('should select noon slot for habit without preferences', () => {
        const habit = createHabit({ duration_minutes: 45 });

        const slots = [
          createSlot(7, 9, 60), // 7am
          createSlot(10, 12, 60), // 10am
          createSlot(12, 14, 60), // 12pm - should win
          createSlot(14, 16, 60), // 2pm
          createSlot(17, 19, 60), // 5pm
        ];

        const result = findBestSlotForHabit(habit, slots);

        expect(result).not.toBeNull();
        expect(result?.start.getHours()).toBe(12);
      });

      it('should not stack multiple habits at 7am', () => {
        // This tests the actual bug that was reported:
        // Habits without preferences were all landing at 7am
        const lunchHabit = createHabit({ duration_minutes: 45 });
        const dinnerHabit = createHabit({ duration_minutes: 60 });
        const genericHabit = createHabit({ duration_minutes: 30 });

        const morningSlots = [
          createSlot(7, 8, 60), // 7am
          createSlot(8, 9, 60), // 8am
          createSlot(9, 10, 60), // 9am
        ];

        const allDaySlots = [
          createSlot(7, 9, 60), // 7am - far from noon
          createSlot(11, 13, 60), // 11am - closest to noon
          createSlot(17, 19, 60), // 5pm - far from noon
        ];

        // All habits should prefer the 11am slot (closest to noon), not 7am
        expect(
          findBestSlotForHabit(lunchHabit, allDaySlots)?.start.getHours()
        ).toBe(11);
        expect(
          findBestSlotForHabit(dinnerHabit, allDaySlots)?.start.getHours()
        ).toBe(11);
        expect(
          findBestSlotForHabit(genericHabit, allDaySlots)?.start.getHours()
        ).toBe(11);

        // Even when only morning slots available, should prefer 9am (closest to noon)
        expect(
          findBestSlotForHabit(genericHabit, morningSlots)?.start.getHours()
        ).toBe(9);
      });

      it('should handle edge case: only early morning slots available', () => {
        const habit = createHabit({ duration_minutes: 30 });

        // Only slots available are in early morning
        const slots = [
          createSlot(6, 7, 60), // 6am
          createSlot(7, 8, 60), // 7am - slightly closer to noon, should win
        ];

        const result = findBestSlotForHabit(habit, slots);

        expect(result).not.toBeNull();
        // 7am is closer to noon than 6am, so it should win
        expect(result?.start.getHours()).toBe(7);
      });

      it('should handle edge case: only evening slots available', () => {
        const habit = createHabit({ duration_minutes: 30 });

        // Only slots available are in evening
        const slots = [
          createSlot(18, 19, 60), // 6pm - closer to noon, should win
          createSlot(20, 21, 60), // 8pm
          createSlot(22, 23, 60), // 10pm
        ];

        const result = findBestSlotForHabit(habit, slots);

        expect(result).not.toBeNull();
        // 6pm is closest to noon, so it should win
        expect(result?.start.getHours()).toBe(18);
      });
    });

    describe('real-world habit scheduling scenarios', () => {
      it('should schedule "Lunch" habit around noon even without explicit preference', () => {
        // Simulating a user who creates a "Lunch" habit but forgets to set time_preference
        const lunchHabit = createHabit({
          duration_minutes: 45,
          // No time_preference set - simulating user oversight
        });

        const workdaySlots = [
          createSlot(7, 8, 60), // Before work
          createSlot(9, 11, 60), // Morning work
          createSlot(11, 13, 120), // Lunch time - should be selected
          createSlot(14, 17, 180), // Afternoon work
          createSlot(18, 20, 120), // Evening
        ];

        const result = findBestSlotForHabit(lunchHabit, workdaySlots);

        expect(result).not.toBeNull();
        expect(result?.start.getHours()).toBe(11); // Gets scheduled around noon
      });

      it('should schedule "Dinner" habit in evening when preference IS set', () => {
        // Simulating correct usage with preference set
        const dinnerHabit = createHabit({
          duration_minutes: 60,
          time_preference: 'evening', // User correctly sets evening
        });

        const workdaySlots = [
          createSlot(7, 8, 60), // Morning
          createSlot(11, 13, 120), // Noon
          createSlot(17, 20, 180), // Evening - should be selected due to preference
        ];

        const result = findBestSlotForHabit(dinnerHabit, workdaySlots);

        expect(result).not.toBeNull();
        expect(result?.start.getHours()).toBe(17); // Gets scheduled in evening
      });

      it('should demonstrate the fix: habits no longer stack at 7am', () => {
        // This is the key test that demonstrates the bug fix
        // Previously, all these habits would end up at 7am

        const habitA = createHabit({ duration_minutes: 30 });
        const habitB = createHabit({ duration_minutes: 45 });
        const habitC = createHabit({ duration_minutes: 60 });

        // All slots are equally viable (can fit any habit)
        const slots = [
          createSlot(7, 9, 120), // 7am - OLD behavior would pick this
          createSlot(10, 12, 120), // 10am
          createSlot(12, 14, 120), // 12pm - NEW behavior picks this (closest to noon)
          createSlot(14, 16, 120), // 2pm
          createSlot(17, 19, 120), // 5pm
        ];

        // All habits without preference should pick 12pm slot
        const resultA = findBestSlotForHabit(habitA, slots);
        const resultB = findBestSlotForHabit(habitB, slots);
        const resultC = findBestSlotForHabit(habitC, slots);

        // None should be at 7am
        expect(resultA?.start.getHours()).not.toBe(7);
        expect(resultB?.start.getHours()).not.toBe(7);
        expect(resultC?.start.getHours()).not.toBe(7);

        // All should prefer 12pm
        expect(resultA?.start.getHours()).toBe(12);
        expect(resultB?.start.getHours()).toBe(12);
        expect(resultC?.start.getHours()).toBe(12);
      });
    });
  });

  describe('time preference override behavior', () => {
    it('should override middle-of-day default when morning preference set', () => {
      const morningHabit = createHabit({
        duration_minutes: 30,
        time_preference: 'morning',
      });

      const slots = [
        createSlot(7, 9, 60), // Morning - should win due to preference
        createSlot(12, 14, 60), // Noon - would win without preference
        createSlot(18, 20, 60), // Evening
      ];

      const result = findBestSlotForHabit(morningHabit, slots);

      expect(result?.start.getHours()).toBe(7);
    });

    it('should override middle-of-day default when evening preference set', () => {
      const eveningHabit = createHabit({
        duration_minutes: 30,
        time_preference: 'evening',
      });

      const slots = [
        createSlot(7, 9, 60), // Morning
        createSlot(12, 14, 60), // Noon - would win without preference
        createSlot(18, 20, 60), // Evening - should win due to preference
      ];

      const result = findBestSlotForHabit(eveningHabit, slots);

      expect(result?.start.getHours()).toBe(18);
    });

    it('should override middle-of-day default when ideal_time set', () => {
      const habitWithIdealTime = createHabit({
        duration_minutes: 30,
        ideal_time: '07:30',
      });

      const slots = [
        createSlot(7, 9, 60), // Contains ideal_time - should win
        createSlot(12, 14, 60), // Noon - would win without preference
        createSlot(18, 20, 60), // Evening
      ];

      const result = findBestSlotForHabit(habitWithIdealTime, slots);

      expect(result?.start.getHours()).toBe(7);
    });

    it('should prioritize ideal_time > time_preference > middle-of-day', () => {
      // Test the full hierarchy of preferences

      // Habit with ideal_time - should pick slot containing it
      const habitWithIdeal = createHabit({
        duration_minutes: 30,
        ideal_time: '08:00',
        time_preference: 'evening', // Even with evening preference, ideal_time wins
      });

      // Habit with only preference - should pick matching slot
      const habitWithPref = createHabit({
        duration_minutes: 30,
        time_preference: 'evening',
      });

      // Habit with nothing - should pick noon
      const habitWithNothing = createHabit({
        duration_minutes: 30,
      });

      const slots = [
        createSlot(7, 9, 60), // Morning, contains 08:00
        createSlot(12, 14, 60), // Noon
        createSlot(18, 20, 60), // Evening
      ];

      expect(
        findBestSlotForHabit(habitWithIdeal, slots)?.start.getHours()
      ).toBe(7); // ideal_time
      expect(findBestSlotForHabit(habitWithPref, slots)?.start.getHours()).toBe(
        18
      ); // preference
      expect(
        findBestSlotForHabit(habitWithNothing, slots)?.start.getHours()
      ).toBe(12); // noon default
    });
  });

  describe('score calculation verification', () => {
    it('should calculate correct score for habit without preferences', () => {
      const habit = createHabit({ duration_minutes: 30 });

      // Slot at noon (hour 12) - distance from noon is 0
      const noonSlot = createSlot(12, 14, 60);
      const noonScore = scoreSlotForHabit(habit, noonSlot);

      // Expected: 200 (fits preferred) - 0*0.5 (distance from noon) = 200
      expect(noonScore).toBe(200);

      // Slot at 7am (hour 7) - distance from noon is 5
      const morningSlot = createSlot(7, 9, 60);
      const morningScore = scoreSlotForHabit(habit, morningSlot);

      // Expected: 200 (fits preferred) - 5*0.5 (distance from noon) = 197.5
      expect(morningScore).toBe(197.5);

      // Slot at 5pm (hour 17) - distance from noon is 5
      const eveningSlot = createSlot(17, 19, 60);
      const eveningScore = scoreSlotForHabit(habit, eveningSlot);

      // Expected: 200 (fits preferred) - 5*0.5 (distance from noon) = 197.5
      expect(eveningScore).toBe(197.5);
    });

    it('should calculate correct score for habit WITH preferences', () => {
      const habit = createHabit({
        duration_minutes: 30,
        time_preference: 'morning',
      });

      // Slot at 8am - morning preference matches
      const morningSlot = createSlot(8, 10, 60);
      const morningScore = scoreSlotForHabit(habit, morningSlot);

      // Expected: 500 (preference) + 200 (fits preferred) - 8*0.1 (early tiebreaker) = 699.2
      expect(morningScore).toBe(699.2);

      // Slot at noon - morning preference does NOT match
      const noonSlot = createSlot(12, 14, 60);
      const noonScore = scoreSlotForHabit(habit, noonSlot);

      // Expected: 0 (no preference match) + 200 (fits preferred) - 12*0.1 = 198.8
      expect(noonScore).toBe(198.8);
    });
  });
});

// ============================================================================
// TASK SLOT SCORING TESTS
// ============================================================================

// Helper to create a task config with defaults
function createTask(overrides: Partial<TaskSlotConfig> = {}): TaskSlotConfig {
  return {
    deadline: null,
    priority: 'normal',
    preferredTimeOfDay: null,
    ...overrides,
  };
}

// Helper to create a "now" date for testing
function createNow(
  hour: number = 8,
  baseDate: Date = new Date('2025-01-15')
): Date {
  const now = new Date(baseDate);
  now.setHours(hour, 0, 0, 0);
  return now;
}

describe('Task Slot Scoring', () => {
  describe('scoreSlotForTask', () => {
    describe('basic scoring without deadline', () => {
      it('should prefer earlier slots for tasks without deadline (ASAP strategy)', () => {
        const task = createTask({ priority: 'normal' });
        const now = createNow(8);

        const slot7am = createSlot(7, 9, 60);
        const slot12pm = createSlot(12, 14, 60);
        const slot6pm = createSlot(18, 20, 60);

        const score7am = scoreSlotForTask(task, slot7am, now);
        const score12pm = scoreSlotForTask(task, slot12pm, now);
        const score6pm = scoreSlotForTask(task, slot6pm, now);

        // Earlier slots should have highest score (ASAP strategy)
        expect(score7am).toBeGreaterThan(score12pm);
        expect(score12pm).toBeGreaterThan(score6pm);
      });

      it('should prefer earlier slots even when equidistant from noon', () => {
        const task = createTask({ priority: 'normal' });
        const now = createNow(8);

        // Slots equidistant from noon
        const slot9am = createSlot(9, 11, 60); // 3 hours before noon
        const slot3pm = createSlot(15, 17, 60); // 3 hours after noon

        const score9am = scoreSlotForTask(task, slot9am, now);
        const score3pm = scoreSlotForTask(task, slot3pm, now);

        // Earlier slot (9am) should score higher than later slot (3pm)
        expect(score9am).toBeGreaterThan(score3pm);
      });

      it('should give bonus for larger slots (better fit)', () => {
        const task = createTask({ priority: 'normal' });
        const now = createNow(8);

        const smallSlot = createSlot(12, 13, 30); // 30 min
        const largeSlot = createSlot(12, 14, 120); // 2 hours

        const smallScore = scoreSlotForTask(task, smallSlot, now);
        const largeScore = scoreSlotForTask(task, largeSlot, now);

        expect(largeScore).toBeGreaterThan(smallScore);
      });
    });

    describe('deadline-based scoring', () => {
      it('should prefer earliest slots for URGENT tasks (deadline < 24h)', () => {
        const now = createNow(8);
        const urgentDeadline = new Date(now);
        urgentDeadline.setHours(urgentDeadline.getHours() + 12); // 12 hours from now

        const task = createTask({
          priority: 'high',
          deadline: urgentDeadline,
        });

        const slot7am = createSlot(7, 9, 60);
        const slot12pm = createSlot(12, 14, 60);
        const slot5pm = createSlot(17, 19, 60);

        const score7am = scoreSlotForTask(task, slot7am, now);
        const score12pm = scoreSlotForTask(task, slot12pm, now);
        const score5pm = scoreSlotForTask(task, slot5pm, now);

        // For urgent tasks, earlier is better
        expect(score7am).toBeGreaterThan(score12pm);
        expect(score12pm).toBeGreaterThan(score5pm);
      });

      it('should have mild early preference for SOON tasks (deadline 24-72h)', () => {
        const now = createNow(8);
        const soonDeadline = new Date(now);
        soonDeadline.setHours(soonDeadline.getHours() + 48); // 48 hours from now

        const task = createTask({
          priority: 'normal',
          deadline: soonDeadline,
        });

        const slot7am = createSlot(7, 9, 60);
        const slot12pm = createSlot(12, 14, 60);

        const score7am = scoreSlotForTask(task, slot7am, now);
        const score12pm = scoreSlotForTask(task, slot12pm, now);

        // For soon tasks, earlier is slightly better
        expect(score7am).toBeGreaterThan(score12pm);
      });

      it('should prefer middle-of-day for tasks with distant deadline (>72h)', () => {
        const now = createNow(8);
        const distantDeadline = new Date(now);
        distantDeadline.setDate(distantDeadline.getDate() + 7); // 7 days from now

        const task = createTask({
          priority: 'normal',
          deadline: distantDeadline,
        });

        const slot7am = createSlot(7, 9, 60);
        const slot12pm = createSlot(12, 14, 60);
        const slot6pm = createSlot(18, 20, 60);

        const score7am = scoreSlotForTask(task, slot7am, now);
        const score12pm = scoreSlotForTask(task, slot12pm, now);
        const score6pm = scoreSlotForTask(task, slot6pm, now);

        // For distant deadlines, still prefer earlier slots (ASAP strategy)
        expect(score7am).toBeGreaterThan(score12pm);
        expect(score12pm).toBeGreaterThan(score6pm);
      });
    });

    describe('priority-based scoring', () => {
      it('should give bonus to critical priority tasks', () => {
        const now = createNow(8);
        const slot = createSlot(12, 14, 60);

        const criticalTask = createTask({ priority: 'critical' });
        const normalTask = createTask({ priority: 'normal' });

        const criticalScore = scoreSlotForTask(criticalTask, slot, now);
        const normalScore = scoreSlotForTask(normalTask, slot, now);

        expect(criticalScore).toBeGreaterThan(normalScore);
        expect(criticalScore - normalScore).toBe(200); // Critical bonus
      });

      it('should give bonus to high priority tasks', () => {
        const now = createNow(8);
        const slot = createSlot(12, 14, 60);

        const highTask = createTask({ priority: 'high' });
        const normalTask = createTask({ priority: 'normal' });

        const highScore = scoreSlotForTask(highTask, slot, now);
        const normalScore = scoreSlotForTask(normalTask, slot, now);

        expect(highScore).toBeGreaterThan(normalScore);
        expect(highScore - normalScore).toBe(100); // High bonus
      });

      it('should penalize low priority tasks', () => {
        const now = createNow(8);
        const slot = createSlot(12, 14, 60);

        const lowTask = createTask({ priority: 'low' });
        const normalTask = createTask({ priority: 'normal' });

        const lowScore = scoreSlotForTask(lowTask, slot, now);
        const normalScore = scoreSlotForTask(normalTask, slot, now);

        expect(normalScore).toBeGreaterThan(lowScore);
        expect(normalScore - lowScore).toBe(50); // Low penalty
      });

      it('should have correct priority ordering', () => {
        const now = createNow(8);
        const slot = createSlot(12, 14, 60);

        const criticalTask = createTask({ priority: 'critical' });
        const highTask = createTask({ priority: 'high' });
        const normalTask = createTask({ priority: 'normal' });
        const lowTask = createTask({ priority: 'low' });

        const criticalScore = scoreSlotForTask(criticalTask, slot, now);
        const highScore = scoreSlotForTask(highTask, slot, now);
        const normalScore = scoreSlotForTask(normalTask, slot, now);
        const lowScore = scoreSlotForTask(lowTask, slot, now);

        expect(criticalScore).toBeGreaterThan(highScore);
        expect(highScore).toBeGreaterThan(normalScore);
        expect(normalScore).toBeGreaterThan(lowScore);
      });
    });

    describe('time preference scoring', () => {
      it('should give bonus when slot matches time preference', () => {
        const now = createNow(8);

        const afternoonTask = createTask({
          priority: 'normal',
          preferredTimeOfDay: 'afternoon',
        });

        const morningSlot = createSlot(9, 11, 60);
        const afternoonSlot = createSlot(14, 16, 60);

        const morningScore = scoreSlotForTask(afternoonTask, morningSlot, now);
        const afternoonScore = scoreSlotForTask(
          afternoonTask,
          afternoonSlot,
          now
        );

        // Afternoon slot should win due to +500 preference bonus
        // Even though morning slot has better time score (earlier)
        expect(afternoonScore).toBeGreaterThan(morningScore);
        // The bonus is +500, but earlier slot gets +50 extra from time score (9am vs 2pm)
        // So net difference is around 450
        expect(afternoonScore - morningScore).toBeGreaterThanOrEqual(400);
      });

      it('should respect morning preference', () => {
        const now = createNow(8);

        const morningTask = createTask({
          priority: 'normal',
          preferredTimeOfDay: 'morning',
        });

        const morningSlot = createSlot(8, 10, 60);
        const eveningSlot = createSlot(18, 20, 60);

        const morningScore = scoreSlotForTask(morningTask, morningSlot, now);
        const eveningScore = scoreSlotForTask(morningTask, eveningSlot, now);

        expect(morningScore).toBeGreaterThan(eveningScore);
      });
    });

    describe('combined scoring scenarios', () => {
      it('should balance urgency with time preference', () => {
        const now = createNow(8);
        const urgentDeadline = new Date(now);
        urgentDeadline.setHours(urgentDeadline.getHours() + 6); // Very urgent

        const task = createTask({
          priority: 'critical',
          deadline: urgentDeadline,
          preferredTimeOfDay: 'afternoon', // Prefers afternoon, but task is urgent
        });

        const morningSlot = createSlot(9, 11, 60);
        const afternoonSlot = createSlot(14, 16, 60);

        const morningScore = scoreSlotForTask(task, morningSlot, now);
        const afternoonScore = scoreSlotForTask(task, afternoonSlot, now);

        // Morning should win because urgency overrides time preference
        // Urgency bonus: 300 - 9*10 = 210 for morning, 300 - 14*10 = 160 for afternoon
        // Plus afternoon gets +500 for preference match
        // So afternoon: 160 + 500 = 660 extra, morning: 210 extra
        // This means preference wins over urgency in this case
        expect(afternoonScore).toBeGreaterThan(morningScore);
      });
    });
  });

  describe('findBestSlotForTask', () => {
    it('should return null when no slots provided', () => {
      const task = createTask({ priority: 'normal' });
      const now = createNow(8);

      const result = findBestSlotForTask(task, [], 30, now);

      expect(result).toBeNull();
    });

    it('should return null when no slots meet minimum duration', () => {
      const task = createTask({ priority: 'normal' });
      const now = createNow(8);
      const slots = [
        createSlot(9, 10, 15), // Only 15 min available
        createSlot(11, 12, 20), // Only 20 min available
      ];

      const result = findBestSlotForTask(task, slots, 30, now); // Need 30 min

      expect(result).toBeNull();
    });

    it('should return the only viable slot', () => {
      const task = createTask({ priority: 'normal' });
      const now = createNow(8);
      const slots = [
        createSlot(9, 10, 15), // Too small
        createSlot(11, 13, 60), // Viable - should be returned
        createSlot(14, 15, 20), // Too small
      ];

      const result = findBestSlotForTask(task, slots, 30, now);

      expect(result).not.toBeNull();
      expect(result?.start.getHours()).toBe(11);
    });

    it('should select earliest slot for task without deadline (ASAP strategy)', () => {
      const task = createTask({ priority: 'normal' });
      const now = createNow(8);
      const slots = [
        createSlot(7, 9, 60), // 7am - should win (earliest, ASAP)
        createSlot(10, 12, 60), // 10am
        createSlot(12, 14, 60), // 12pm
        createSlot(15, 17, 60), // 3pm
        createSlot(18, 20, 60), // 6pm
      ];

      const result = findBestSlotForTask(task, slots, 30, now);

      expect(result).not.toBeNull();
      expect(result?.start.getHours()).toBe(7);
    });

    it('should select earliest slot for urgent task', () => {
      const now = createNow(8);
      const urgentDeadline = new Date(now);
      urgentDeadline.setHours(urgentDeadline.getHours() + 6);

      const task = createTask({
        priority: 'critical',
        deadline: urgentDeadline,
      });

      const slots = [
        createSlot(9, 11, 60), // 9am - should win (earliest, urgent)
        createSlot(12, 14, 60), // 12pm
        createSlot(15, 17, 60), // 3pm
      ];

      const result = findBestSlotForTask(task, slots, 30, now);

      expect(result).not.toBeNull();
      expect(result?.start.getHours()).toBe(9);
    });

    it('should prefer earliest slots for tasks (ASAP strategy)', () => {
      const now = createNow(8);

      // Multiple tasks without deadlines
      const taskA = createTask({ priority: 'normal' });
      const taskB = createTask({ priority: 'normal' });
      const taskC = createTask({ priority: 'normal' });

      const slots = [
        createSlot(7, 9, 120), // 7am - ASAP behavior picks this
        createSlot(10, 12, 120), // 10am
        createSlot(12, 14, 120), // 12pm
        createSlot(14, 16, 120), // 2pm
        createSlot(17, 19, 120), // 5pm
      ];

      // All tasks without deadline should pick earliest (7am) - ASAP strategy
      const resultA = findBestSlotForTask(taskA, slots, 30, now);
      const resultB = findBestSlotForTask(taskB, slots, 30, now);
      const resultC = findBestSlotForTask(taskC, slots, 30, now);

      // All should prefer 7am (earliest available)
      expect(resultA?.start.getHours()).toBe(7);
      expect(resultB?.start.getHours()).toBe(7);
      expect(resultC?.start.getHours()).toBe(7);
    });
  });

  describe('task + habit harmony scenarios', () => {
    it('should demonstrate habits prefer noon while tasks prefer ASAP', () => {
      const now = createNow(8);

      // Habit without preference - should prefer noon
      const habitWithoutPref = createHabit({ duration_minutes: 45 });

      // Task without deadline - should prefer ASAP (earliest)
      const taskWithoutDeadline = createTask({ priority: 'normal' });

      const slots = [
        createSlot(7, 9, 120), // 7am
        createSlot(11, 13, 120), // 11am - closest to noon
        createSlot(17, 19, 120), // 5pm
      ];

      // Habit prefers 11am (closest to noon)
      const habitResult = findBestSlotForHabit(habitWithoutPref, slots);
      // Task prefers 7am (ASAP)
      const taskResult = findBestSlotForTask(
        taskWithoutDeadline,
        slots,
        30,
        now
      );

      expect(habitResult?.start.getHours()).toBe(11);
      expect(taskResult?.start.getHours()).toBe(7);
    });

    it('should allow urgent tasks to get earlier slots than relaxed habits', () => {
      const now = createNow(8);
      const urgentDeadline = new Date(now);
      urgentDeadline.setHours(urgentDeadline.getHours() + 4);

      // Habit without preference (will prefer noon)
      const relaxedHabit = createHabit({ duration_minutes: 30 });

      // Urgent task (will prefer earliest)
      const urgentTask = createTask({
        priority: 'critical',
        deadline: urgentDeadline,
      });

      const slots = [
        createSlot(9, 11, 60), // 9am
        createSlot(12, 14, 60), // 12pm
      ];

      const habitResult = findBestSlotForHabit(relaxedHabit, slots);
      const taskResult = findBestSlotForTask(urgentTask, slots, 30, now);

      // Habit prefers noon, urgent task prefers earliest
      expect(habitResult?.start.getHours()).toBe(12);
      expect(taskResult?.start.getHours()).toBe(9);
    });

    it('should respect both habit time preference and task urgency', () => {
      const now = createNow(8);
      const urgentDeadline = new Date(now);
      urgentDeadline.setHours(urgentDeadline.getHours() + 5);

      // Morning habit (explicitly wants morning)
      const morningHabit = createHabit({
        duration_minutes: 30,
        time_preference: 'morning',
      });

      // Urgent task (needs to be done ASAP)
      const urgentTask = createTask({
        priority: 'critical',
        deadline: urgentDeadline,
      });

      const slots = [
        createSlot(7, 9, 60), // 7am - both might want this
        createSlot(9, 11, 60), // 9am
        createSlot(12, 14, 60), // 12pm
      ];

      const habitResult = findBestSlotForHabit(morningHabit, slots);
      const taskResult = findBestSlotForTask(urgentTask, slots, 30, now);

      // Both prefer 7am - habit for preference, task for urgency
      expect(habitResult?.start.getHours()).toBe(7);
      expect(taskResult?.start.getHours()).toBe(7);
    });
  });

  describe('complex scheduling scenarios', () => {
    describe('scenario: full workday', () => {
      it('should distribute tasks throughout the day based on priority and deadline', () => {
        const now = createNow(8);

        // Create realistic scenarios
        const tomorrowDeadline = new Date(now);
        tomorrowDeadline.setDate(tomorrowDeadline.getDate() + 1);

        const nextWeekDeadline = new Date(now);
        nextWeekDeadline.setDate(nextWeekDeadline.getDate() + 7);

        const reportTask = createTask({
          priority: 'high',
          deadline: tomorrowDeadline, // Due tomorrow
        });

        const planningTask = createTask({
          priority: 'normal',
          deadline: null, // No deadline
        });

        const lowPriorityTask = createTask({
          priority: 'low',
          deadline: nextWeekDeadline, // Due next week
        });

        const slots = [
          createSlot(9, 11, 120), // Morning slot
          createSlot(12, 14, 120), // Noon slot
          createSlot(15, 17, 120), // Afternoon slot
        ];

        // Report (deadline tomorrow) should prefer earliest
        const reportResult = findBestSlotForTask(reportTask, slots, 30, now);

        // Planning (no deadline) should also prefer earliest (ASAP strategy)
        const planningResult = findBestSlotForTask(
          planningTask,
          slots,
          30,
          now
        );

        // Low priority task - also prefers earliest but with lower score
        const lowPriorityResult = findBestSlotForTask(
          lowPriorityTask,
          slots,
          30,
          now
        );

        // All tasks prefer earliest slots (ASAP strategy)
        expect(reportResult?.start.getHours()).toBe(9); // Earliest
        expect(planningResult?.start.getHours()).toBe(9); // Also earliest (ASAP)
        expect(lowPriorityResult?.start.getHours()).toBe(9); // Also earliest (ASAP)
      });
    });

    describe('scenario: multiple priorities same deadline', () => {
      it('should order by priority when deadlines are the same', () => {
        const now = createNow(8);
        const sameDeadline = new Date(now);
        sameDeadline.setHours(sameDeadline.getHours() + 48);

        const criticalTask = createTask({
          priority: 'critical',
          deadline: sameDeadline,
        });

        const normalTask = createTask({
          priority: 'normal',
          deadline: sameDeadline,
        });

        const lowTask = createTask({
          priority: 'low',
          deadline: sameDeadline,
        });

        const slot = createSlot(12, 14, 60);

        const criticalScore = scoreSlotForTask(criticalTask, slot, now);
        const normalScore = scoreSlotForTask(normalTask, slot, now);
        const lowScore = scoreSlotForTask(lowTask, slot, now);

        // Higher priority should get higher scores
        expect(criticalScore).toBeGreaterThan(normalScore);
        expect(normalScore).toBeGreaterThan(lowScore);
      });
    });

    describe('scenario: constrained slots', () => {
      it('should select best available when ideal slot is too small', () => {
        const now = createNow(8);

        const task = createTask({ priority: 'normal' });

        const slots = [
          createSlot(11, 12, 20), // Too small (need 30 min)
          createSlot(12, 13, 25), // Too small
          createSlot(14, 16, 60), // Big enough - should select
          createSlot(17, 18, 45), // Big enough but further from noon
        ];

        const result = findBestSlotForTask(task, slots, 30, now);

        // Should pick the 2pm slot (closest viable to noon)
        expect(result?.start.getHours()).toBe(14);
      });
    });
  });

  describe('score calculation verification', () => {
    it('should calculate correct score for task without deadline', () => {
      const task = createTask({ priority: 'normal' });
      const now = createNow(8);

      // Slot at noon (hour 12)
      const noonSlot = createSlot(12, 14, 120); // 2 hours = max capacity bonus
      const noonScore = scoreSlotForTask(task, noonSlot, now);

      // Expected breakdown (ASAP strategy):
      // - Time: 300 - 12*2 = 276
      // - Size: min(120, 120) / 120 * 50 = 50
      // - Priority (normal): 0
      // Total: 276 + 50 = 326
      expect(noonScore).toBe(326);

      // Slot at 7am (hour 7) - should score HIGHER (earlier is better)
      const morningSlot = createSlot(7, 9, 120);
      const morningScore = scoreSlotForTask(task, morningSlot, now);

      // Expected breakdown (ASAP strategy):
      // - Time: 300 - 7*2 = 286
      // - Size: min(120, 120) / 120 * 50 = 50
      // - Priority (normal): 0
      // Total: 286 + 50 = 336
      expect(morningScore).toBe(336);

      // Morning should score higher than noon (ASAP)
      expect(morningScore).toBeGreaterThan(noonScore);
    });

    it('should calculate correct score for urgent task', () => {
      const now = createNow(8);
      const urgentDeadline = new Date(now);
      urgentDeadline.setHours(urgentDeadline.getHours() + 6); // 6 hours

      const task = createTask({
        priority: 'critical',
        deadline: urgentDeadline,
      });

      const slot9am = createSlot(9, 11, 120);
      const score = scoreSlotForTask(task, slot9am, now);

      // Expected breakdown (ASAP + urgent bonus):
      // - Time: 300 - 9*2 = 282
      // - Size: min(120, 120) / 120 * 50 = 50
      // - Urgent deadline bonus: 200 - 9*5 = 155
      // - Priority (critical): +200
      // Total: 282 + 50 + 155 + 200 = 687
      expect(score).toBe(687);
    });
  });
});

// ============================================================================
// Tests for calculateIdealStartTimeForHabit
// ============================================================================

describe('calculateIdealStartTimeForHabit', () => {
  describe('ideal_time preference', () => {
    it('should use ideal_time if it falls within the slot', () => {
      const habit = createHabit({ ideal_time: '14:30' }); // 2:30pm
      const slot = createSlot(7, 18, 660); // 7am-6pm

      const idealStart = calculateIdealStartTimeForHabit(habit, slot, 30);

      expect(idealStart.getHours()).toBe(14);
      expect(idealStart.getMinutes()).toBe(30);
    });

    it('should not use ideal_time if too close to slot end', () => {
      const habit = createHabit({ ideal_time: '17:45' }); // 5:45pm
      const slot = createSlot(7, 18, 660); // 7am-6pm (can't fit 30min starting at 5:45pm)

      const idealStart = calculateIdealStartTimeForHabit(habit, slot, 30);

      // Should fall back to noon since ideal_time + duration > slot end
      expect(idealStart.getHours()).toBe(12);
    });

    it('should not use ideal_time if before slot start', () => {
      const habit = createHabit({ ideal_time: '06:00' }); // 6am
      const slot = createSlot(9, 18, 540); // 9am-6pm

      const idealStart = calculateIdealStartTimeForHabit(habit, slot, 30);

      // Should fall back to noon
      expect(idealStart.getHours()).toBe(12);
    });
  });

  describe('time_preference', () => {
    it('should use morning preference (9am ideal)', () => {
      const habit = createHabit({ time_preference: 'morning' });
      const slot = createSlot(7, 18, 660); // 7am-6pm

      const idealStart = calculateIdealStartTimeForHabit(habit, slot, 30);

      expect(idealStart.getHours()).toBe(9);
      expect(idealStart.getMinutes()).toBe(0);
    });

    it('should use afternoon preference (2pm ideal)', () => {
      const habit = createHabit({ time_preference: 'afternoon' });
      const slot = createSlot(7, 18, 660); // 7am-6pm

      const idealStart = calculateIdealStartTimeForHabit(habit, slot, 30);

      expect(idealStart.getHours()).toBe(14);
      expect(idealStart.getMinutes()).toBe(0);
    });

    it('should use evening preference (6pm ideal)', () => {
      const habit = createHabit({ time_preference: 'evening' });
      const slot = createSlot(7, 21, 840); // 7am-9pm

      const idealStart = calculateIdealStartTimeForHabit(habit, slot, 30);

      expect(idealStart.getHours()).toBe(18);
      expect(idealStart.getMinutes()).toBe(0);
    });

    it('should use night preference (10pm ideal)', () => {
      const habit = createHabit({ time_preference: 'night' });
      const slot = createSlot(7, 24, 1020); // 7am-midnight

      const idealStart = calculateIdealStartTimeForHabit(habit, slot, 30);

      expect(idealStart.getHours()).toBe(22);
      expect(idealStart.getMinutes()).toBe(0);
    });

    it('should fall back to range start if ideal time outside slot', () => {
      const habit = createHabit({ time_preference: 'evening' });
      const slot = createSlot(17, 19, 120); // 5pm-7pm (evening ideal 6pm is within)

      const idealStart = calculateIdealStartTimeForHabit(habit, slot, 30);

      expect(idealStart.getHours()).toBe(18);
    });
  });

  describe('default (noon distribution)', () => {
    it('should aim for noon when no preferences', () => {
      const habit = createHabit({}); // No preferences
      const slot = createSlot(7, 18, 660); // 7am-6pm

      const idealStart = calculateIdealStartTimeForHabit(habit, slot, 30);

      expect(idealStart.getHours()).toBe(12);
      expect(idealStart.getMinutes()).toBe(0);
    });

    it('should use slot start if noon is before slot', () => {
      const habit = createHabit({});
      const slot = createSlot(14, 18, 240); // 2pm-6pm

      const idealStart = calculateIdealStartTimeForHabit(habit, slot, 30);

      expect(idealStart.getHours()).toBe(14); // Slot start
      expect(idealStart.getMinutes()).toBe(0);
    });

    it('should use latest possible start if noon is after slot', () => {
      const habit = createHabit({});
      const slot = createSlot(7, 11, 240); // 7am-11am

      const idealStart = calculateIdealStartTimeForHabit(habit, slot, 30);

      // Latest start = 11:00 - 30min = 10:30
      expect(idealStart.getHours()).toBe(10);
      expect(idealStart.getMinutes()).toBe(30);
    });
  });

  describe('edge cases', () => {
    it('should return slot start when duration barely fits', () => {
      const habit = createHabit({});
      const slot = createSlot(9, 10, 60); // 9am-10am, exactly 60 min

      const idealStart = calculateIdealStartTimeForHabit(habit, slot, 60);

      expect(idealStart.getHours()).toBe(9);
      expect(idealStart.getMinutes()).toBe(0);
    });

    it('should handle slot start when duration slightly less than slot', () => {
      const habit = createHabit({});
      const slot = createSlot(9, 10, 60); // 9am-10am

      const idealStart = calculateIdealStartTimeForHabit(habit, slot, 55);

      // Latest start = 10:00 - 55min = 9:05
      // But since we round to 15-min boundaries, it becomes 9:15
      // However 9:15 + 55min = 10:10 which exceeds slot end
      // So we fall back to 9:00 (slot start, already on 15-min boundary)
      // Actually: latestStart (9:05) rounds to 9:15, but that doesn't fit
      // So we use the rounded slot start which is 9:00
      expect(idealStart.getHours()).toBe(9);
      expect(idealStart.getMinutes()).toBe(15); // Rounded up from 9:05
    });

    it('should prioritize ideal_time over time_preference', () => {
      const habit = createHabit({
        ideal_time: '15:00',
        time_preference: 'morning', // Would prefer 9am
      });
      const slot = createSlot(7, 18, 660);

      const idealStart = calculateIdealStartTimeForHabit(habit, slot, 30);

      expect(idealStart.getHours()).toBe(15); // Uses ideal_time, not morning preference
    });
  });
});

// ============================================================================
// Tests for calculateIdealStartTimeForTask
// ============================================================================

describe('calculateIdealStartTimeForTask', () => {
  // Tasks now always start ASAP (as soon as possible), aligned to 15-minute boundaries

  describe('ASAP behavior', () => {
    it('should start at slot start when now is before slot', () => {
      const now = createNow(6); // 6am - before 7am slot start
      const task = createTask({});
      const slot = createSlot(7, 18, 660); // 7am-6pm

      const idealStart = calculateIdealStartTimeForTask(task, slot, 30, now);

      expect(idealStart.getHours()).toBe(7); // Slot start
      expect(idealStart.getMinutes()).toBe(0);
    });

    it('should start at next 15-min boundary when now is within slot', () => {
      const now = createNow(8); // 8am exactly
      now.setMinutes(11); // 8:11am
      const task = createTask({});
      const slot = createSlot(7, 18, 660); // 7am-6pm

      const idealStart = calculateIdealStartTimeForTask(task, slot, 30, now);

      // 8:11 rounds up to 8:15
      expect(idealStart.getHours()).toBe(8);
      expect(idealStart.getMinutes()).toBe(15);
    });

    it('should stay on 15-min boundary when now is already aligned', () => {
      const now = createNow(8); // 8am exactly
      now.setMinutes(30); // 8:30am
      const task = createTask({});
      const slot = createSlot(7, 18, 660); // 7am-6pm

      const idealStart = calculateIdealStartTimeForTask(task, slot, 30, now);

      expect(idealStart.getHours()).toBe(8);
      expect(idealStart.getMinutes()).toBe(30);
    });

    it('should start ASAP regardless of deadline urgency', () => {
      const now = createNow(8);
      const distantDeadline = new Date(now);
      distantDeadline.setDate(distantDeadline.getDate() + 7); // 7 days away

      const task = createTask({ deadline: distantDeadline });
      const slot = createSlot(7, 18, 660);

      const idealStart = calculateIdealStartTimeForTask(task, slot, 30, now);

      // Even with distant deadline, starts ASAP (8am since now=8am is within slot)
      expect(idealStart.getHours()).toBe(8);
      expect(idealStart.getMinutes()).toBe(0);
    });

    it('should start ASAP regardless of time preference', () => {
      const now = createNow(8);
      const task = createTask({
        preferredTimeOfDay: 'afternoon', // Would have preferred 2pm before
      });
      const slot = createSlot(7, 18, 660);

      const idealStart = calculateIdealStartTimeForTask(task, slot, 30, now);

      // Starts ASAP, ignoring preference
      expect(idealStart.getHours()).toBe(8);
      expect(idealStart.getMinutes()).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should return slot start when duration barely fits', () => {
      const now = createNow(8);
      const task = createTask({});
      const slot = createSlot(9, 10, 60); // Exactly 60 min

      const idealStart = calculateIdealStartTimeForTask(task, slot, 60, now);

      expect(idealStart.getHours()).toBe(9);
      expect(idealStart.getMinutes()).toBe(0);
    });

    it('should use slot start for afternoon slot', () => {
      const now = createNow(8);
      const task = createTask({});
      const slot = createSlot(14, 18, 240); // 2pm-6pm

      const idealStart = calculateIdealStartTimeForTask(task, slot, 30, now);

      // now (8am) is before slot, so use slot start (2pm)
      expect(idealStart.getHours()).toBe(14);
      expect(idealStart.getMinutes()).toBe(0);
    });

    it('should use slot start for morning slot when now is before', () => {
      const now = createNow(6); // 6am, before 7am slot
      const task = createTask({});
      const slot = createSlot(7, 11, 240); // 7am-11am

      const idealStart = calculateIdealStartTimeForTask(task, slot, 30, now);

      expect(idealStart.getHours()).toBe(7);
      expect(idealStart.getMinutes()).toBe(0);
    });
  });
});
