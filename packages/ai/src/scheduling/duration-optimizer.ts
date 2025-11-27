/**
 * Duration Optimizer for Habit Scheduling
 *
 * This module provides smart duration optimization for habits.
 * It determines the optimal duration within the min/max range based on:
 * - Time slot characteristics (ideal time match, preference match)
 * - Available slot size
 * - Habit preferences
 *
 * Strategy:
 * - Maximize duration in ideal time slots (get most value from habit)
 * - Use preferred duration in preference-matching slots
 * - Shrink to minimum viable in constrained slots
 */

import type { TimeOfDayPreference } from '@tuturuuu/types/primitives/Habit';

/**
 * Habit duration configuration
 */
export interface HabitDurationConfig {
  /** Preferred duration in minutes */
  duration_minutes: number;
  /** Minimum acceptable duration in minutes (optional) */
  min_duration_minutes?: number | null;
  /** Maximum beneficial duration in minutes (optional) */
  max_duration_minutes?: number | null;
  /** Specific preferred time (HH:MM format) */
  ideal_time?: string | null;
  /** Time-of-day preference */
  time_preference?: TimeOfDayPreference | null;
}

/**
 * Time slot information
 */
export interface TimeSlotInfo {
  /** Slot start time */
  start: Date;
  /** Slot end time */
  end: Date;
  /** Maximum available minutes in this slot (accounting for existing events) */
  maxAvailable: number;
}

/**
 * Slot characteristics for optimization decisions
 */
export interface SlotCharacteristics {
  /** Whether this slot matches the habit's ideal_time exactly */
  matchesIdealTime: boolean;
  /** Whether this slot falls within the habit's time_preference range */
  matchesPreference: boolean;
}

/**
 * Get effective duration bounds for a habit
 * Fills in defaults if min/max are not set
 */
export function getEffectiveDurationBounds(habit: HabitDurationConfig): {
  preferred: number;
  min: number;
  max: number;
} {
  const preferred = habit.duration_minutes;

  // Default min: 50% of preferred (minimum 15 minutes)
  const min =
    habit.min_duration_minutes ?? Math.max(15, Math.floor(preferred * 0.5));

  // Default max: 150% of preferred (maximum 180 minutes)
  const max =
    habit.max_duration_minutes ?? Math.min(180, Math.ceil(preferred * 1.5));

  return { preferred, min, max };
}

/**
 * Calculate the optimal duration for a habit in a given slot
 *
 * Strategy:
 * 1. If slot matches ideal_time exactly - maximize (use max duration)
 * 2. If slot matches time_preference - use preferred duration
 * 3. If slot is constrained - use minimum viable duration
 * 4. Otherwise - use preferred duration
 */
export function calculateOptimalDuration(
  habit: HabitDurationConfig,
  slot: TimeSlotInfo,
  characteristics: SlotCharacteristics
): number {
  const { preferred, min, max } = getEffectiveDurationBounds(habit);

  // If slot can't fit even minimum duration, return 0 (can't schedule)
  if (slot.maxAvailable < min) {
    return 0;
  }

  // If slot matches ideal time exactly, maximize the duration
  // This gives the user maximum benefit from their preferred time
  if (characteristics.matchesIdealTime) {
    return Math.min(max, slot.maxAvailable);
  }

  // If slot matches time preference, use preferred duration
  if (characteristics.matchesPreference) {
    return Math.min(preferred, slot.maxAvailable);
  }

  // If slot is constrained (can't fit preferred), use minimum viable
  if (slot.maxAvailable < preferred) {
    return Math.max(min, slot.maxAvailable);
  }

  // Default: use preferred duration
  return Math.min(preferred, slot.maxAvailable);
}

/**
 * Check if a time (HH:MM) falls within a time slot
 */
export function timeMatchesSlot(
  idealTime: string,
  slot: TimeSlotInfo
): boolean {
  const [hours, minutes] = idealTime.split(':').map(Number);
  if (hours === undefined || minutes === undefined) return false;

  const idealDate = new Date(slot.start);
  idealDate.setHours(hours, minutes, 0, 0);

  // Check if ideal time falls within the slot
  return idealDate >= slot.start && idealDate < slot.end;
}

/**
 * Time ranges for time-of-day preferences
 */
const TIME_PREFERENCE_RANGES: Record<
  TimeOfDayPreference,
  { start: number; end: number }
> = {
  morning: { start: 6, end: 12 }, // 6am-12pm
  afternoon: { start: 12, end: 17 }, // 12pm-5pm
  evening: { start: 17, end: 21 }, // 5pm-9pm
  night: { start: 21, end: 24 }, // 9pm-12am
};

/**
 * Check if a slot falls within a time-of-day preference
 */
export function slotMatchesPreference(
  preference: TimeOfDayPreference,
  slot: TimeSlotInfo
): boolean {
  const range = TIME_PREFERENCE_RANGES[preference];
  if (!range) return false;

  const slotStartHour = slot.start.getHours();
  const slotEndHour = slot.end.getHours();

  // Slot matches if it overlaps with the preference range
  return slotStartHour < range.end && slotEndHour > range.start;
}

/**
 * Get slot characteristics for a habit
 */
export function getSlotCharacteristics(
  habit: HabitDurationConfig,
  slot: TimeSlotInfo
): SlotCharacteristics {
  const matchesIdealTime = habit.ideal_time
    ? timeMatchesSlot(habit.ideal_time, slot)
    : false;

  const matchesPreference = habit.time_preference
    ? slotMatchesPreference(habit.time_preference, slot)
    : false;

  return { matchesIdealTime, matchesPreference };
}

/**
 * Score a slot for a habit (higher = better fit)
 * Used when choosing between multiple available slots
 */
export function scoreSlotForHabit(
  habit: HabitDurationConfig,
  slot: TimeSlotInfo
): number {
  const characteristics = getSlotCharacteristics(habit, slot);
  let score = 0;

  // Ideal time match is the best
  if (characteristics.matchesIdealTime) {
    score += 1000;
  }

  // Time preference match is second best
  if (characteristics.matchesPreference) {
    score += 500;
  }

  // Prefer slots that can fit preferred duration
  const { preferred, min } = getEffectiveDurationBounds(habit);
  if (slot.maxAvailable >= preferred) {
    score += 200;
  } else if (slot.maxAvailable >= min) {
    score += 100;
  }

  // Apply time-based scoring
  if (habit.time_preference || habit.ideal_time) {
    // When user has set a preference, slightly prefer earlier slots as tiebreaker
    score -= slot.start.getHours() * 0.1;
  } else {
    // When no preference set, prefer middle-of-day (closer to noon)
    // This prevents habits from always stacking at 7am
    const distanceFromNoon = Math.abs(slot.start.getHours() - 12);
    score -= distanceFromNoon * 0.5;
  }

  return score;
}

/**
 * Find the best slot for a habit from a list of available slots
 */
export function findBestSlotForHabit(
  habit: HabitDurationConfig,
  slots: TimeSlotInfo[]
): TimeSlotInfo | null {
  const { min } = getEffectiveDurationBounds(habit);

  // Filter to slots that can fit at least minimum duration
  const viableSlots = slots.filter((slot) => slot.maxAvailable >= min);

  if (viableSlots.length === 0) {
    return null;
  }

  // Score each slot and return the best one
  let bestSlot = viableSlots[0]!;
  let bestScore = scoreSlotForHabit(habit, bestSlot);

  for (let i = 1; i < viableSlots.length; i++) {
    const slot = viableSlots[i]!;
    const score = scoreSlotForHabit(habit, slot);
    if (score > bestScore) {
      bestScore = score;
      bestSlot = slot;
    }
  }

  return bestSlot;
}
