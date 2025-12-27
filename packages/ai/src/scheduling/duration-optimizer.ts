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
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { SchedulingWeights } from './types';

// ============================================================================
// TIMEZONE HELPERS
// ============================================================================

/**
 * Get the local hour for a Date in a specific timezone
 * Falls back to system local time if timezone is not provided or invalid
 */
export function getLocalHour(
  date: Date,
  timezone: string | null | undefined
): number {
  if (!timezone || timezone === 'auto') {
    return date.getHours(); // Use system local time
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const hourPart = parts.find((p) => p.type === 'hour');
    return parseInt(hourPart?.value || '0', 10);
  } catch {
    return date.getHours(); // Fallback to system local time
  }
}

/**
 * Get the local minute for a Date in a specific timezone
 * Falls back to system local time if timezone is not provided or invalid
 */
export function getLocalMinute(
  date: Date,
  timezone: string | null | undefined
): number {
  if (!timezone || timezone === 'auto') {
    return date.getMinutes(); // Use system local time
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      minute: 'numeric',
    });
    const parts = formatter.formatToParts(date);
    const minutePart = parts.find((p) => p.type === 'minute');
    return parseInt(minutePart?.value || '0', 10);
  } catch {
    return date.getMinutes(); // Fallback to system local time
  }
}

/**
 * Create a Date object from a time string (HH:MM) in a specific timezone
 * on a given day
 */
export function createDateInTimezone(
  baseDate: Date,
  hours: number,
  minutes: number,
  timezone: string | null | undefined
): Date {
  // Get the date components in the target timezone
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const day = baseDate.getDate();

  // Create a date string in ISO format and let the Date constructor parse it
  // This works because we want the resulting Date to represent the moment when
  // it's hours:minutes in the target timezone

  if (!timezone || timezone === 'auto') {
    // Use system local time
    const result = new Date(year, month, day, hours, minutes, 0, 0);
    return result;
  }

  try {
    // Create a date at the specified local time in the target timezone
    // We do this by creating a formatter and working backwards
    const testDate = new Date(year, month, day, 12, 0, 0, 0);

    // Get the UTC offset for the target timezone at this date
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });

    // Format in target timezone and parse
    const targetStr = formatter.format(testDate);
    const [targetHour] = targetStr.split(':').map(Number);
    const systemHour = testDate.getHours();

    // Calculate offset (this is an approximation but works for most cases)
    const offsetHours = (systemHour - (targetHour ?? systemHour)) % 24;

    const result = new Date(
      year,
      month,
      day,
      hours + offsetHours,
      minutes,
      0,
      0
    );
    return result;
  } catch {
    // Fallback to system local time
    return new Date(year, month, day, hours, minutes, 0, 0);
  }
}

// ============================================================================
// TYPES
// ============================================================================

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
 * The idealTime is in the user's timezone (e.g., "18:30" means 6:30 PM local)
 */
export function timeMatchesSlot(
  idealTime: string,
  slot: TimeSlotInfo,
  timezone?: string | null
): boolean {
  const [hours, minutes] = idealTime.split(':').map(Number);
  if (hours === undefined || minutes === undefined) return false;

  // Create the ideal date in the target timezone
  const idealDate = createDateInTimezone(slot.start, hours, minutes, timezone);

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
 * Uses timezone-aware hour extraction
 */
export function slotMatchesPreference(
  preference: TimeOfDayPreference,
  slot: TimeSlotInfo,
  timezone?: string | null
): boolean {
  const range = TIME_PREFERENCE_RANGES[preference];
  if (!range) return false;

  // Use timezone-aware hours
  const slotStartHour = getLocalHour(slot.start, timezone);
  const slotEndHour = getLocalHour(slot.end, timezone);

  // Slot matches if it overlaps with the preference range
  return slotStartHour < range.end && slotEndHour > range.start;
}

/**
 * Get slot characteristics for a habit
 */
export function getSlotCharacteristics(
  habit: HabitDurationConfig,
  slot: TimeSlotInfo,
  timezone?: string | null
): SlotCharacteristics {
  const matchesIdealTime = habit.ideal_time
    ? timeMatchesSlot(habit.ideal_time, slot, timezone)
    : false;

  const matchesPreference = habit.time_preference
    ? slotMatchesPreference(habit.time_preference, slot, timezone)
    : false;

  return { matchesIdealTime, matchesPreference };
}

/**
 * Score a slot for a habit (higher = better fit)
 * Used when choosing between multiple available slots
 */
export function scoreSlotForHabit(
  habit: HabitDurationConfig,
  slot: TimeSlotInfo,
  timezone?: string | null,
  weights?: SchedulingWeights
): number {
  const characteristics = getSlotCharacteristics(habit, slot, timezone);
  let score = 0;

  // Ideal time match is the best
  if (characteristics.matchesIdealTime) {
    score += weights?.habitIdealTimeBonus ?? 1000;
  }

  // Time preference match is second best
  if (characteristics.matchesPreference) {
    score += weights?.habitPreferenceBonus ?? 500;
  }

  // Prefer slots that can fit preferred duration
  const { preferred, min } = getEffectiveDurationBounds(habit);
  if (slot.maxAvailable >= preferred) {
    score += 200;
  } else if (slot.maxAvailable >= min) {
    score += 100;
  }

  // Apply time-based scoring using timezone-aware hours
  const slotHour = getLocalHour(slot.start, timezone);
  if (habit.time_preference || habit.ideal_time) {
    // When user has set a preference, slightly prefer earlier slots as tiebreaker
    score -= slotHour * 0.1;
  } else {
    // When no preference set, prefer middle-of-day (closer to noon)
    // This prevents habits from always stacking at 7am
    const distanceFromNoon = Math.abs(slotHour - 12);
    score -= distanceFromNoon * 0.5;
  }

  return score;
}

/**
 * Find the best slot for a habit from a list of available slots
 */
export function findBestSlotForHabit(
  habit: HabitDurationConfig,
  slots: TimeSlotInfo[],
  timezone?: string | null,
  weights?: SchedulingWeights
): TimeSlotInfo | null {
  const { min } = getEffectiveDurationBounds(habit);

  // Filter to slots that can fit at least minimum duration
  const viableSlots = slots.filter((slot) => slot.maxAvailable >= min);

  if (viableSlots.length === 0) {
    return null;
  }

  // Score each slot and return the best one
  let bestSlot = viableSlots[0]!;
  let bestScore = scoreSlotForHabit(habit, bestSlot, timezone, weights);

  for (let i = 1; i < viableSlots.length; i++) {
    const slot = viableSlots[i]!;
    const score = scoreSlotForHabit(habit, slot, timezone, weights);
    if (score > bestScore) {
      bestScore = score;
      bestSlot = slot;
    }
  }

  return bestSlot;
}

// ============================================================================
// IDEAL START TIME CALCULATION
// ============================================================================

/**
 * Round a time to the next 15-minute boundary
 * e.g., 2:11 -> 2:15, 2:00 -> 2:00, 2:16 -> 2:30
 */
export function roundToNext15Minutes(date: Date): Date {
  const result = new Date(date);
  const minutes = result.getMinutes();
  const remainder = minutes % 15;

  if (remainder === 0) {
    // Already on a 15-minute boundary
    result.setSeconds(0, 0);
    return result;
  }

  // Round up to next 15-minute mark
  result.setMinutes(minutes + (15 - remainder), 0, 0);
  return result;
}

/**
 * Calculate the ideal start time within a slot for a habit
 *
 * When a slot is large (e.g., 7am-6pm), we don't want to always start at slot.start.
 * Instead, we calculate the best start time based on the habit's preferences:
 * - If ideal_time is set and falls within slot, use it
 * - If time_preference is set, find the middle of the preference range within slot
 * - Otherwise, aim for noon (middle of day) to distribute events evenly
 *
 * All times are rounded to 15-minute boundaries.
 * If `now` is provided, ensures start time is not before now.
 *
 * IMPORTANT: The ideal_time and time_preference are in the USER'S timezone.
 * The timezone parameter ensures we correctly interpret these times.
 */
export function calculateIdealStartTimeForHabit(
  habit: HabitDurationConfig,
  slot: TimeSlotInfo,
  duration: number,
  now?: Date,
  timezone?: string | null
): Date {
  // Effective slot start (must be >= now if provided)
  let effectiveSlotStart = new Date(slot.start);
  if (now && now > slot.start) {
    effectiveSlotStart = roundToNext15Minutes(now);
  }

  // Latest possible start time to fit the duration
  const latestStart = new Date(slot.end.getTime() - duration * 60000);

  // If the slot can barely fit the duration, just use effective slot start
  if (latestStart <= effectiveSlotStart) {
    return roundToNext15Minutes(effectiveSlotStart);
  }

  // 1. If habit has ideal_time and it falls within the slot, use it
  // ideal_time is in the user's timezone (e.g., "18:30" means 6:30 PM local)
  if (habit.ideal_time) {
    const [hours, minutes] = habit.ideal_time.split(':').map(Number);
    if (hours !== undefined && minutes !== undefined) {
      // Create the ideal start time in the TARGET timezone
      const idealStart = createDateInTimezone(
        slot.start,
        hours,
        minutes,
        timezone
      );
      const roundedIdeal = roundToNext15Minutes(idealStart);

      // Check if ideal time falls within usable range [effectiveSlotStart, latestStart]
      if (roundedIdeal >= effectiveSlotStart && roundedIdeal <= latestStart) {
        return roundedIdeal;
      }
    }
  }

  // 2. If habit has time_preference, aim for the middle of that preference range
  if (habit.time_preference) {
    const preferenceRanges: Record<
      TimeOfDayPreference,
      { start: number; end: number; ideal: number }
    > = {
      morning: { start: 6, end: 12, ideal: 9 }, // Ideal morning: 9am
      afternoon: { start: 12, end: 17, ideal: 14 }, // Ideal afternoon: 2pm
      evening: { start: 17, end: 21, ideal: 18 }, // Ideal evening: 6pm
      night: { start: 21, end: 24, ideal: 22 }, // Ideal night: 10pm
    };

    const range = preferenceRanges[habit.time_preference];
    if (range) {
      // Try the ideal time for this preference (in target timezone)
      const idealStart = createDateInTimezone(
        slot.start,
        range.ideal,
        0,
        timezone
      );

      if (idealStart >= effectiveSlotStart && idealStart <= latestStart) {
        return idealStart; // Already on hour boundary
      }

      // If ideal is outside slot, try the start of preference range
      const rangeStart = createDateInTimezone(
        slot.start,
        range.start,
        0,
        timezone
      );

      if (rangeStart >= effectiveSlotStart && rangeStart <= latestStart) {
        return rangeStart;
      }
    }
  }

  // 3. Default: aim for noon (12pm local time) to distribute events in middle of day
  const noonTarget = createDateInTimezone(slot.start, 12, 0, timezone);

  // If noon is within the usable range, use it
  if (noonTarget >= effectiveSlotStart && noonTarget <= latestStart) {
    return noonTarget;
  }

  // If noon is before effective slot start, use effective slot start
  if (noonTarget < effectiveSlotStart) {
    return roundToNext15Minutes(effectiveSlotStart);
  }

  // If noon is after latest start, use latest start (closest to noon we can get)
  return roundToNext15Minutes(latestStart);
}

/**
 * Calculate the ideal start time within a slot for a task
 *
 * Tasks should start as soon as possible (ASAP) to maximize productivity.
 * All times are rounded to 15-minute boundaries.
 * Ensures start time is not before `now`.
 */
export function calculateIdealStartTimeForTask(
  _task: TaskSlotConfig,
  slot: TimeSlotInfo,
  duration: number,
  now: Date
): Date {
  // Effective slot start (must be >= now, rounded to next 15-min)
  let effectiveSlotStart = new Date(slot.start);
  if (now > slot.start) {
    effectiveSlotStart = roundToNext15Minutes(now);
  } else {
    effectiveSlotStart = roundToNext15Minutes(slot.start);
  }

  // Latest possible start time to fit the duration
  const latestStart = new Date(slot.end.getTime() - duration * 60000);

  // If the slot can barely fit the duration, use effective slot start
  if (latestStart <= effectiveSlotStart) {
    return effectiveSlotStart;
  }

  // Tasks should start ASAP - use the earliest available time in the slot
  // (already rounded to 15-minute boundary)
  return effectiveSlotStart;
}

// ============================================================================
// TASK SLOT SCORING
// ============================================================================

/**
 * Task slot configuration for scoring
 */
export interface TaskSlotConfig {
  /** Task deadline (null = no deadline) */
  deadline?: Date | null;
  /** Task priority */
  priority: TaskPriority;
  /** Optional preferred time of day */
  preferredTimeOfDay?: TimeOfDayPreference | null;
}

/**
 * Score a slot for a task (higher = better fit)
 *
 * Scoring strategy:
 * Tasks should be scheduled ASAP to maximize time efficiency.
 * Earlier slots always score higher to ensure gaps are filled before
 * moving to later time blocks.
 *
 * 1. Time-based: Prefer EARLIEST slots (+300 at 7am, decreasing by hour)
 * 2. Slot size: Small bonus for adequate size (max 50 points)
 * 3. Time preference: If task has preference, respect it (+500)
 * 4. Priority bonus: Higher priority tasks get bonus
 */
export function scoreSlotForTask(
  task: TaskSlotConfig,
  slot: TimeSlotInfo,
  now: Date,
  timezone?: string | null,
  weights?: SchedulingWeights
): number {
  let score = 0;

  // Use timezone-aware hour for scoring
  const slotHour = getLocalHour(slot.start, timezone);

  // 1. ALWAYS prefer earlier slots - tasks should fill gaps ASAP
  // Earlier hour = higher score (+300 at midnight, -2 per hour)
  // This ensures gaps are filled before moving to later slots
  // Reduced penalty from -10 to -2 to prevent gaps between tasks
  score += (weights?.taskBaseEarlyBonus ?? 300) - slotHour * 2;

  // 2. Small bonus for slots that fit well (max 50 points)
  // This is secondary to time preference - we want earlier slots first
  score += (Math.min(slot.maxAvailable, 120) / 120) * 50;

  // 3. If task has time preference, respect it (+500)
  if (task.preferredTimeOfDay) {
    if (slotMatchesPreference(task.preferredTimeOfDay, slot, timezone)) {
      score += weights?.taskPreferenceBonus ?? 500;
    }
  }

  // 4. Deadline urgency bonus for even earlier scheduling
  if (task.deadline) {
    const hoursUntilDeadline =
      (task.deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilDeadline < 24) {
      // URGENT: Extra bonus for earliest slots
      score += 200 - slotHour * 5;
    } else if (hoursUntilDeadline < 72) {
      // SOON: Smaller bonus for earlier
      score += 100 - slotHour * 2;
    }
    // Not urgent: No extra bonus, rely on base time scoring
  }

  // 5. Priority bonus for better slot placement
  const priorityBonus: Record<TaskPriority, number> = {
    critical: 200,
    high: 100,
    normal: 0,
    low: -50,
  };
  score += priorityBonus[task.priority] ?? 0;

  return score;
}

/**
 * Find the best slot for a task from a list of available slots
 *
 * @param task - Task configuration
 * @param slots - Available time slots
 * @param minDuration - Minimum required duration in minutes
 * @param now - Current time (for deadline calculations)
 * @param timezone - Target timezone for scoring
 * @returns Best slot or null if no viable slots
 */
export function findBestSlotForTask(
  task: TaskSlotConfig,
  slots: TimeSlotInfo[],
  minDuration: number,
  now: Date,
  timezone?: string | null,
  weights?: SchedulingWeights
): TimeSlotInfo | null {
  // Filter to slots that can fit at least minimum duration
  const viableSlots = slots.filter((slot) => slot.maxAvailable >= minDuration);

  if (viableSlots.length === 0) {
    return null;
  }

  // Score each slot and return the best one
  let bestSlot = viableSlots[0]!;
  let bestScore = scoreSlotForTask(task, bestSlot, now, timezone, weights);

  for (let i = 1; i < viableSlots.length; i++) {
    const slot = viableSlots[i]!;
    const score = scoreSlotForTask(task, slot, now, timezone, weights);
    if (score > bestScore) {
      bestScore = score;
      bestSlot = slot;
    }
  }

  return bestSlot;
}
