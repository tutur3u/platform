/**
 * Preview Engine for Smart Scheduling
 *
 * Provides pure functions for generating scheduling previews without
 * persisting to the database. Used for:
 * 1. Instant preview mode - show final result before applying
 * 2. Animated demo mode - step-by-step visualization
 *
 * This module mirrors the logic in unified-scheduler.ts but operates
 * on in-memory data structures instead of database operations.
 */

import type { HabitDurationConfig } from '@tuturuuu/ai/scheduling';
import {
  calculateIdealStartTimeForHabit,
  calculatePriorityScore,
  comparePriority,
  getEffectivePriority,
  getOccurrencesInRange,
} from '@tuturuuu/ai/scheduling';
import {
  findBestSlotForHabit as findBestSlotForHabitAI,
  getEffectiveDurationBounds,
} from '@tuturuuu/ai/scheduling/duration-optimizer';
import type { TaskWithScheduling } from '@tuturuuu/types';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { Habit } from '@tuturuuu/types/primitives/Habit';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';

// ============================================================================
// PREVIEW TYPES
// ============================================================================

export interface PreviewEvent {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  type: 'habit' | 'task' | 'break';
  source_id: string;
  color?: string;
  isPreview: true;
  step: number;
  occurrence_date?: string;
  scheduled_minutes?: number;
}

export interface SlotDebugInfo {
  start: string;
  end: string;
  maxAvailable: number;
  dayOfWeek: string;
}

export interface SchedulingStep {
  step: number;
  type: 'habit' | 'task' | 'bump' | 'reschedule' | 'break' | 'info';
  action: string;
  description: string;
  event?: PreviewEvent;
  relatedId?: string;
  relatedName?: string;
  timestamp: number;
  // Debug context
  debug?: {
    slotsAvailable?: number;
    slotsConsidered?: SlotDebugInfo[];
    slotChosen?: SlotDebugInfo;
    reason?: string;
    remainingMinutes?: number;
    dayOffset?: number;
  };
}

export interface PreviewTaskResult {
  task: TaskWithScheduling;
  events: PreviewEvent[];
  scheduledMinutes: number;
  totalMinutesRequired: number;
  remainingMinutes: number;
  warning?: string;
  warningLevel?: 'info' | 'warning' | 'error';
}

export interface PreviewHabitResult {
  habit: Habit;
  occurrence: Date;
  event: PreviewEvent;
  duration: number;
}

export interface PreviewResult {
  events: PreviewEvent[];
  steps: SchedulingStep[];
  habits: {
    events: PreviewHabitResult[];
    warnings: string[];
  };
  tasks: {
    events: PreviewTaskResult[];
    warnings: string[];
  };
  warnings: string[];
  summary: {
    totalEvents: number;
    habitsScheduled: number;
    tasksScheduled: number;
    bumpedHabits: number;
    breaksScheduled: number;
    partiallyScheduledTasks: number;
    unscheduledTasks: number;
  };
}

export interface HourSettings {
  personalHours: WeekSettings;
  workHours: WeekSettings;
  meetingHours: WeekSettings;
}

type TimeBlock = { startTime: string; endTime: string };
type DaySettings = { enabled: boolean; timeBlocks: TimeBlock[] };
type WeekSettings = Record<string, DaySettings>;

interface OccupiedSlot {
  start: Date;
  end: Date;
  type: 'habit' | 'task' | 'locked';
  id: string;
  priority?: TaskPriority;
}

// ============================================================================
// HELPER CLASSES
// ============================================================================

class PreviewSlotTracker {
  private slots: OccupiedSlot[] = [];

  constructor(
    lockedEvents: Array<{ start_at: string; end_at: string; id?: string }>
  ) {
    for (const event of lockedEvents) {
      this.slots.push({
        start: new Date(event.start_at),
        end: new Date(event.end_at),
        type: 'locked',
        id: event.id || `locked-${this.slots.length}`,
      });
    }
  }

  add(
    start: Date,
    end: Date,
    type: 'habit' | 'task',
    id: string,
    priority?: TaskPriority
  ): void {
    this.slots.push({ start, end, type, id, priority });
  }

  remove(eventId: string): void {
    this.slots = this.slots.filter((s) => s.id !== eventId);
  }

  hasConflict(start: Date, end: Date): boolean {
    return this.slots.some((slot) => start < slot.end && end > slot.start);
  }

  getConflicts(start: Date, end: Date): OccupiedSlot[] {
    return this.slots.filter((slot) => start < slot.end && end > slot.start);
  }

  findBumpableHabitEvents(
    taskPriority: TaskPriority,
    beforeDate: Date,
    now: Date
  ): OccupiedSlot[] {
    return this.slots.filter((slot) => {
      if (slot.type !== 'habit') return false;
      if (slot.start >= beforeDate) return false;
      if (slot.start <= now && now < slot.end) return false;
      const habitPriority = slot.priority || 'normal';
      return comparePriority(taskPriority, habitPriority) < 0;
    });
  }

  getAll(): OccupiedSlot[] {
    return [...this.slots];
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function roundTo15Minutes(date: Date): Date {
  const result = new Date(date);
  const minutes = result.getMinutes();
  const roundedMinutes = Math.round(minutes / 15) * 15;
  result.setMinutes(roundedMinutes);
  result.setSeconds(0);
  result.setMilliseconds(0);
  return result;
}

function getLocalHour(date: Date, timezone: string | null | undefined): number {
  if (!timezone || timezone === 'auto') {
    return date.getHours(); // Use system local time, not UTC
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
    return date.getHours(); // Fallback to system local time, not UTC
  }
}

function generatePreviewId(): string {
  return `preview-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function formatSlotForDebug(slot: {
  start: Date;
  end: Date;
  maxAvailable: number;
}): SlotDebugInfo {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    start: slot.start.toISOString(),
    end: slot.end.toISOString(),
    maxAvailable: Math.round(slot.maxAvailable),
    dayOfWeek: dayNames[slot.start.getDay()] || 'Unknown',
  };
}

function formatTime(date: Date, timezone: string | null | undefined): string {
  try {
    if (timezone && timezone !== 'auto') {
      return date.toLocaleTimeString('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return date.toISOString().substring(11, 16);
  }
}

/**
 * Get the local date string (YYYY-MM-DD) for a Date in a specific timezone
 * This fixes the issue where UTC date differs from local date
 */
function getLocalDateString(
  date: Date,
  timezone: string | null | undefined
): string {
  try {
    if (timezone && timezone !== 'auto') {
      return date.toLocaleDateString('en-CA', {
        // en-CA gives YYYY-MM-DD format
        timeZone: timezone,
      });
    }
    return date.toLocaleDateString('en-CA');
  } catch {
    return date.toISOString().split('T')[0] || '';
  }
}

/**
 * Calculate deviation between actual scheduled time and ideal time
 * Returns deviation in minutes
 */
function calculateDeviationMinutes(
  actualStartTime: Date,
  idealTime: string | null | undefined,
  timePreference: string | null | undefined,
  timezone: string | null | undefined
): number {
  if (!idealTime && !timePreference) {
    return 0;
  }

  const actualHour = getLocalHour(actualStartTime, timezone);
  const actualMin = actualStartTime.getMinutes();
  const actualTimeInMinutes = actualHour * 60 + actualMin;

  if (idealTime) {
    const idealHour = parseInt(idealTime.split(':')[0] || '0', 10);
    const idealMin = parseInt(idealTime.split(':')[1] || '0', 10);
    const idealTimeInMinutes = idealHour * 60 + idealMin;
    const diff = Math.abs(actualTimeInMinutes - idealTimeInMinutes);
    return Math.min(diff, 24 * 60 - diff);
  }

  if (timePreference) {
    const preferenceRanges: Record<string, { start: number; end: number }> = {
      morning: { start: 5, end: 12 },
      afternoon: { start: 12, end: 17 },
      evening: { start: 17, end: 21 },
      night: { start: 21, end: 24 },
    };
    const range = preferenceRanges[timePreference.toLowerCase()];
    if (range) {
      const centerMinutes = ((range.start + range.end) / 2) * 60;
      return Math.abs(actualTimeInMinutes - centerMinutes);
    }
  }

  return 0;
}

/**
 * Check if a habit instance should be skipped due to excessive deviation from preferred time
 * Skip if deviation > 4x max_duration (or duration_minutes if no max set)
 */
function shouldSkipHabitInstance(
  deviationMinutes: number,
  habit: Habit
): { skip: boolean; reason?: string } {
  const referenceDuration =
    habit.max_duration_minutes || habit.duration_minutes || 30;
  const maxAllowedDeviation = referenceDuration * 4;

  if (deviationMinutes > maxAllowedDeviation) {
    const deviationHours = Math.round((deviationMinutes / 60) * 10) / 10;
    return {
      skip: true,
      reason: `Deviation ${deviationHours}h exceeds ${Math.round((maxAllowedDeviation / 60) * 10) / 10}h limit (4x ${referenceDuration}min)`,
    };
  }

  return { skip: false };
}

function getColorForHourType(hourType?: string | null): string {
  if (hourType === 'work_hours') return 'BLUE';
  if (hourType === 'meeting_hours') return 'CYAN';
  return 'GREEN';
}

function getDayTimeBlocks(
  hourSettings: HourSettings,
  calendarHours: 'personal_hours' | 'work_hours' | 'meeting_hours' | null,
  dayOfWeek: number
): TimeBlock[] {
  const dayNames = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  const dayName = dayNames[dayOfWeek] || 'monday';

  let settings: WeekSettings;
  if (calendarHours === 'work_hours') {
    settings = hourSettings.workHours;
  } else if (calendarHours === 'meeting_hours') {
    settings = hourSettings.meetingHours;
  } else {
    settings = hourSettings.personalHours;
  }

  const daySettings = settings[dayName];
  if (!daySettings?.enabled) {
    return [];
  }

  return daySettings.timeBlocks || [];
}

function findAvailableSlotsInDay(
  date: Date,
  hourSettings: HourSettings,
  calendarHours: 'personal_hours' | 'work_hours' | 'meeting_hours' | null,
  occupiedSlots: PreviewSlotTracker,
  minDuration: number
): Array<{ start: Date; end: Date; maxAvailable: number }> {
  const dayOfWeek = date.getDay();
  const timeBlocks = getDayTimeBlocks(hourSettings, calendarHours, dayOfWeek);
  const slots: Array<{ start: Date; end: Date; maxAvailable: number }> = [];

  for (const block of timeBlocks) {
    if (!block.startTime || !block.endTime) continue;

    const [startHour, startMin] = block.startTime.split(':').map(Number);
    const [endHour, endMin] = block.endTime.split(':').map(Number);

    const blockStart = new Date(date);
    blockStart.setHours(startHour || 0, startMin || 0, 0, 0);

    const blockEnd = new Date(date);
    blockEnd.setHours(endHour || 23, endMin || 59, 0, 0);

    const conflicts = occupiedSlots.getConflicts(blockStart, blockEnd);

    if (conflicts.length === 0) {
      const maxAvailable = (blockEnd.getTime() - blockStart.getTime()) / 60000;
      if (maxAvailable >= minDuration) {
        slots.push({ start: blockStart, end: blockEnd, maxAvailable });
      }
    } else {
      conflicts.sort((a, b) => a.start.getTime() - b.start.getTime());

      const firstConflict = conflicts[0];
      if (firstConflict && firstConflict.start > blockStart) {
        const gapEnd = firstConflict.start;
        const maxAvailable = (gapEnd.getTime() - blockStart.getTime()) / 60000;
        if (maxAvailable >= minDuration) {
          slots.push({
            start: new Date(blockStart),
            end: gapEnd,
            maxAvailable,
          });
        }
      }

      for (let i = 0; i < conflicts.length - 1; i++) {
        const current = conflicts[i];
        const next = conflicts[i + 1];
        if (current && next && current.end < next.start) {
          const gapStart = current.end;
          const gapEnd = next.start;
          const maxAvailable = (gapEnd.getTime() - gapStart.getTime()) / 60000;
          if (maxAvailable >= minDuration) {
            slots.push({ start: gapStart, end: gapEnd, maxAvailable });
          }
        }
      }

      const lastConflict = conflicts[conflicts.length - 1];
      if (lastConflict && lastConflict.end < blockEnd) {
        const gapStart = lastConflict.end;
        const maxAvailable = (blockEnd.getTime() - gapStart.getTime()) / 60000;
        if (maxAvailable >= minDuration) {
          slots.push({
            start: gapStart,
            end: new Date(blockEnd),
            maxAvailable,
          });
        }
      }
    }
  }

  return slots;
}

function filterFutureSlots(
  slots: Array<{ start: Date; end: Date; maxAvailable: number }>,
  now: Date
): Array<{ start: Date; end: Date; maxAvailable: number }> {
  const roundedNow = roundTo15Minutes(new Date(now.getTime() + 14 * 60 * 1000));

  const result = slots
    .filter((slot) => slot.end > roundedNow)
    .map((slot) => {
      if (slot.start < roundedNow) {
        const adjustedStart = new Date(roundedNow);
        const newMaxAvailable =
          (slot.end.getTime() - adjustedStart.getTime()) / 60000;
        return {
          start: adjustedStart,
          end: slot.end,
          maxAvailable: newMaxAvailable,
        };
      }
      return slot;
    })
    .filter((slot) => slot.maxAvailable > 0);

  result.sort((a, b) => a.start.getTime() - b.start.getTime());
  return result;
}

function filterSlotsByTimePreference(
  slots: Array<{ start: Date; end: Date; maxAvailable: number }>,
  idealTime: string | null | undefined,
  timePreference: string | null | undefined,
  _duration: number,
  timezone: string | null | undefined
): Array<{ start: Date; end: Date; maxAvailable: number }> {
  if (!idealTime && !timePreference) {
    return slots;
  }

  const idealHour = idealTime
    ? parseInt(idealTime.split(':')[0] || '0', 10)
    : null;
  const idealMin = idealTime
    ? parseInt(idealTime.split(':')[1] || '0', 10)
    : null;

  const getDistanceFromIdealTime = (slot: { start: Date; end: Date }) => {
    const slotHour = getLocalHour(slot.start, timezone);
    const slotMin = slot.start.getMinutes();
    const slotTimeInMinutes = slotHour * 60 + slotMin;

    if (idealHour !== null) {
      const idealTimeInMinutes = idealHour * 60 + (idealMin ?? 0);
      const diff = Math.abs(slotTimeInMinutes - idealTimeInMinutes);
      return Math.min(diff, 24 * 60 - diff);
    }

    if (timePreference) {
      const preferenceRanges: Record<string, { start: number; end: number }> = {
        morning: { start: 5, end: 12 },
        afternoon: { start: 12, end: 17 },
        evening: { start: 17, end: 21 },
        night: { start: 21, end: 24 },
      };
      const range = preferenceRanges[timePreference.toLowerCase()];
      if (range) {
        const centerMinutes = ((range.start + range.end) / 2) * 60;
        return Math.abs(slotTimeInMinutes - centerMinutes);
      }
    }

    return 0;
  };

  // First, try to find slots within the preferred time range
  if (timePreference) {
    const preferenceRanges: Record<string, { start: number; end: number }> = {
      morning: { start: 5, end: 12 },
      afternoon: { start: 12, end: 17 },
      evening: { start: 17, end: 21 },
      night: { start: 21, end: 24 },
    };

    const range = preferenceRanges[timePreference.toLowerCase()];
    if (range) {
      const filteredSlots = slots.filter((slot) => {
        const slotHour = getLocalHour(slot.start, timezone);
        return slotHour >= range.start && slotHour < range.end;
      });

      if (filteredSlots.length > 0) {
        return filteredSlots.sort(
          (a, b) => getDistanceFromIdealTime(a) - getDistanceFromIdealTime(b)
        );
      }
    }
  }

  // Sort all slots by distance from ideal time
  return [...slots].sort(
    (a, b) => getDistanceFromIdealTime(a) - getDistanceFromIdealTime(b)
  );
}

function convertHabitToConfig(habit: Habit): HabitDurationConfig {
  return {
    duration_minutes: habit.duration_minutes,
    min_duration_minutes: habit.min_duration_minutes,
    max_duration_minutes: habit.max_duration_minutes,
    ideal_time: habit.ideal_time,
    time_preference: habit.time_preference,
  };
}

// ============================================================================
// MAIN PREVIEW GENERATOR
// ============================================================================

export interface GeneratePreviewOptions {
  windowDays?: number;
  timezone?: string | null;
}

/**
 * Generate a scheduling preview without persisting to database
 */
export function generatePreview(
  habits: Habit[],
  tasks: TaskWithScheduling[],
  existingEvents: CalendarEvent[],
  hourSettings: HourSettings,
  options: GeneratePreviewOptions = {}
): PreviewResult {
  const { windowDays = 30, timezone = null } = options;

  const steps: SchedulingStep[] = [];
  const allPreviewEvents: PreviewEvent[] = [];
  const habitResults: PreviewHabitResult[] = [];
  const taskResults: PreviewTaskResult[] = [];
  const habitWarnings: string[] = [];
  const taskWarnings: string[] = [];

  let stepCounter = 0;
  let bumpedHabitsCount = 0;
  let breaksCount = 0;
  let partiallyScheduledTasks = 0;
  let unscheduledTasks = 0;

  const now = new Date();
  const rangeEnd = new Date(now);
  rangeEnd.setDate(rangeEnd.getDate() + windowDays);

  // Convert existing events to blocked slots
  // Only block:
  // 1. Locked events (user-protected, can't be moved)
  // 2. Events that have already started (start_at < now) - in-progress or past
  // Future unlocked events are NOT blocked - they could be rescheduled
  const blockedEvents = existingEvents
    .filter((e) => {
      if (e._isPreview) return false; // Never block preview events
      if (e.locked) return true; // Always block locked events
      // Block events that have already started (in-progress or past)
      const eventStart = new Date(e.start_at);
      return eventStart < now;
    })
    .map((e) => ({
      id: e.id,
      start_at: e.start_at,
      end_at: e.end_at,
    }));

  const occupiedSlots = new PreviewSlotTracker(blockedEvents);

  // Track habit events for potential bumping
  const habitEventMap = new Map<
    string,
    { habit: Habit; occurrence: Date; event: PreviewEvent }
  >();

  const blockedEventsCount = blockedEvents.length;
  const lockedEventsCount = existingEvents.filter((e) => e.locked).length;

  steps.push({
    step: stepCounter++,
    type: 'info',
    action: 'start',
    description: `Starting preview: ${habits.length} habits, ${tasks.length} tasks, ${blockedEventsCount} blocked events (${lockedEventsCount} locked)`,
    timestamp: Date.now(),
    debug: {
      slotsAvailable: blockedEventsCount,
      reason: `Window: ${windowDays} days from ${now.toISOString().split('T')[0]} to ${rangeEnd.toISOString().split('T')[0]}`,
    },
  });

  // ============================================================================
  // PHASE 1: Schedule Habits
  // ============================================================================

  const sortedHabits = [...habits].sort((a, b) => {
    const aHasIdealTime = !!a.ideal_time;
    const bHasIdealTime = !!b.ideal_time;
    if (aHasIdealTime && !bHasIdealTime) return -1;
    if (bHasIdealTime && !aHasIdealTime) return 1;

    const aHasTimePref = !!a.time_preference;
    const bHasTimePref = !!b.time_preference;
    if (aHasTimePref && !bHasTimePref) return -1;
    if (bHasTimePref && !aHasTimePref) return 1;

    const aScore = calculatePriorityScore({ priority: a.priority });
    const bScore = calculatePriorityScore({ priority: b.priority });
    return bScore - aScore;
  });

  for (const habit of sortedHabits) {
    const occurrences = getOccurrencesInRange(habit, now, rangeEnd);

    for (const occurrence of occurrences) {
      // Use local date string to avoid UTC/local date mismatch
      const occurrenceDate = getLocalDateString(occurrence, timezone);

      const { min: minDuration } = getEffectiveDurationBounds({
        duration_minutes: habit.duration_minutes,
        min_duration_minutes: habit.min_duration_minutes,
        max_duration_minutes: habit.max_duration_minutes,
      });

      const slots = findAvailableSlotsInDay(
        occurrence,
        hourSettings,
        habit.calendar_hours,
        occupiedSlots,
        minDuration || 15
      );

      if (slots.length === 0) {
        habitWarnings.push(
          `No available slot for habit "${habit.name}" on ${occurrenceDate}`
        );
        continue;
      }

      const futureSlots = filterFutureSlots(slots, now);

      // Skip occurrences if the available slots are in the past (day has already passed)
      if (futureSlots.length === 0) {
        // This is normal for today if we're past all available time blocks
        // Don't add a warning, just skip silently to the next occurrence
        continue;
      }

      const preferredSlots = filterSlotsByTimePreference(
        futureSlots,
        habit.ideal_time,
        habit.time_preference,
        habit.duration_minutes || minDuration || 30,
        timezone
      );
      const habitConfig = convertHabitToConfig(habit);
      let bestSlot;
      if (habit.ideal_time || habit.time_preference) {
        bestSlot = preferredSlots.find(
          (slot) => slot.maxAvailable >= (minDuration || 15)
        );
      } else {
        bestSlot = findBestSlotForHabitAI(
          habitConfig,
          preferredSlots,
          timezone
        );
      }

      if (!bestSlot) {
        habitWarnings.push(
          `No suitable slot for habit "${habit.name}" on ${occurrenceDate}`
        );
        continue;
      }

      // Use preferred duration directly instead of calculateOptimalDuration to avoid expansion
      // The habit's duration_minutes is what the user wants, not an "optimal" expanded duration
      const preferredDuration = habit.duration_minutes || minDuration || 30;
      const maxDuration = habit.max_duration_minutes || preferredDuration;
      const duration = Math.min(
        Math.max(preferredDuration, minDuration || 15),
        Math.min(maxDuration, bestSlot.maxAvailable)
      );

      if (duration < (minDuration || 15)) {
        habitWarnings.push(
          `Cannot fit habit "${habit.name}" on ${occurrenceDate}`
        );
        continue;
      }

      const rawIdealStartTime = calculateIdealStartTimeForHabit(
        convertHabitToConfig(habit),
        bestSlot,
        duration,
        now,
        timezone
      );

      const idealStartTime = roundTo15Minutes(rawIdealStartTime);
      const eventEnd = roundTo15Minutes(
        new Date(idealStartTime.getTime() + duration * 60 * 1000)
      );

      // Check deviation from preferred time AFTER calculating actual scheduled time
      // If deviation is too large (> 4x duration), skip this instance
      const actualDeviationMinutes = calculateDeviationMinutes(
        idealStartTime, // Use the ACTUAL scheduled time, not slot start
        habit.ideal_time,
        habit.time_preference,
        timezone
      );
      const skipCheck = shouldSkipHabitInstance(actualDeviationMinutes, habit);
      if (skipCheck.skip) {
        habitWarnings.push(
          `Skipping "${habit.name}" on ${occurrenceDate}: ${skipCheck.reason}`
        );
        continue;
      }

      if (occupiedSlots.hasConflict(idealStartTime, eventEnd)) {
        habitWarnings.push(
          `Conflict for habit "${habit.name}" on ${occurrenceDate}`
        );
        continue;
      }

      // Use the actual scheduled time's date for occurrence_date (in local timezone)
      const actualOccurrenceDate = getLocalDateString(idealStartTime, timezone);

      const previewEvent: PreviewEvent = {
        id: generatePreviewId(),
        title: habit.name,
        start_at: idealStartTime.toISOString(),
        end_at: eventEnd.toISOString(),
        type: 'habit',
        source_id: habit.id,
        color: habit.color || getColorForHourType(habit.calendar_hours),
        isPreview: true,
        step: stepCounter,
        occurrence_date: actualOccurrenceDate,
      };

      const slotChosenDebug = formatSlotForDebug(bestSlot);
      const startTimeFormatted = formatTime(idealStartTime, timezone);
      const endTimeFormatted = formatTime(eventEnd, timezone);

      steps.push({
        step: stepCounter++,
        type: 'habit',
        action: 'schedule',
        description: `Scheduling habit "${habit.name}" on ${actualOccurrenceDate} at ${startTimeFormatted}-${endTimeFormatted} (${duration}min)`,
        event: previewEvent,
        relatedId: habit.id,
        relatedName: habit.name,
        timestamp: Date.now(),
        debug: {
          slotsAvailable: futureSlots.length,
          slotsConsidered: preferredSlots.slice(0, 3).map(formatSlotForDebug),
          slotChosen: slotChosenDebug,
          reason: habit.ideal_time
            ? `Preferred slot closest to ideal time ${habit.ideal_time}`
            : habit.time_preference
              ? `Preferred slot in ${habit.time_preference} period`
              : 'First available slot with optimal duration',
        },
      });

      occupiedSlots.add(
        idealStartTime,
        eventEnd,
        'habit',
        previewEvent.id,
        habit.priority || 'normal'
      );
      habitEventMap.set(previewEvent.id, {
        habit,
        occurrence,
        event: previewEvent,
      });
      allPreviewEvents.push(previewEvent);
      habitResults.push({ habit, occurrence, event: previewEvent, duration });

      // Only warn if deviation is significant but not enough to skip (> 1 hour)
      // (actualDeviationMinutes was calculated earlier for skip check)
      if (actualDeviationMinutes > 60) {
        const deviationHours =
          Math.round((actualDeviationMinutes / 60) * 10) / 10;
        const targetDesc = habit.ideal_time
          ? `ideal time ${habit.ideal_time.substring(0, 5)}`
          : `${habit.time_preference} preference`;
        habitWarnings.push(
          `"${habit.name}" on ${actualOccurrenceDate}: ${deviationHours}h from ${targetDesc}`
        );
      }
    }
  }

  // ============================================================================
  // PHASE 2: Schedule Tasks
  // ============================================================================

  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.end_date && b.end_date) {
      const deadlineDiff =
        new Date(a.end_date).getTime() - new Date(b.end_date).getTime();
      if (deadlineDiff !== 0) return deadlineDiff;
    } else if (a.end_date) return -1;
    else if (b.end_date) return 1;

    const aPriority = getEffectivePriority({
      priority: a.priority,
      end_date: a.end_date,
    });
    const bPriority = getEffectivePriority({
      priority: b.priority,
      end_date: b.end_date,
    });
    const priorityDiff = comparePriority(aPriority, bPriority);
    if (priorityDiff !== 0) return priorityDiff;

    if (a.created_at && b.created_at) {
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }
    return 0;
  });

  for (const task of sortedTasks) {
    const totalMinutes = (task.total_duration ?? 0) * 60;
    const scheduledMinutes = task.scheduled_minutes ?? 0;
    let remainingMinutes = totalMinutes - scheduledMinutes;

    if (remainingMinutes <= 0) {
      taskResults.push({
        task,
        events: [],
        scheduledMinutes: totalMinutes,
        totalMinutesRequired: totalMinutes,
        remainingMinutes: 0,
      });
      continue;
    }

    const taskPriority = getEffectivePriority({
      priority: task.priority,
      end_date: task.end_date,
    });
    const taskEvents: PreviewEvent[] = [];
    let scheduledSoFar = 0;
    let scheduledAfterDeadline = false;

    const minDuration = task.min_split_duration_minutes ?? 30;
    const maxDuration = task.max_split_duration_minutes ?? 120;

    for (
      let dayOffset = 0;
      dayOffset < windowDays && remainingMinutes > 0;
      dayOffset++
    ) {
      const searchDate = new Date(now);
      searchDate.setDate(searchDate.getDate() + dayOffset);
      searchDate.setHours(0, 0, 0, 0);

      if (task.start_date && searchDate < new Date(task.start_date)) {
        continue;
      }

      const slots = findAvailableSlotsInDay(
        searchDate,
        hourSettings,
        task.calendar_hours,
        occupiedSlots,
        minDuration
      );

      let futureSlots = filterFutureSlots(slots, now);

      // Sort slots by start time to enable back-to-back scheduling
      futureSlots.sort((a, b) => a.start.getTime() - b.start.getTime());

      while (futureSlots.length > 0 && remainingMinutes > 0) {
        // For back-to-back scheduling, always use the earliest available slot
        const bestSlot = futureSlots.find(
          (slot) => slot.maxAvailable >= minDuration
        );
        if (!bestSlot) break;

        // Calculate event duration:
        // - Don't exceed remaining minutes needed
        // - Don't exceed max split duration
        // - Don't exceed slot availability
        // - Enforce minimum duration ONLY if we have more than minDuration remaining
        const desiredDuration = Math.min(remainingMinutes, maxDuration);
        const eventDuration = Math.min(
          remainingMinutes <= minDuration
            ? remainingMinutes
            : Math.max(minDuration, desiredDuration),
          bestSlot.maxAvailable
        );

        // Skip if slot is too small for a meaningful chunk (unless it's the final piece)
        if (eventDuration < minDuration && eventDuration < remainingMinutes) {
          const slotIndex = futureSlots.indexOf(bestSlot);
          if (slotIndex > -1) futureSlots.splice(slotIndex, 1);
          continue; // Try next slot instead of breaking
        }

        // Start at the beginning of the slot for back-to-back scheduling
        const startTime = roundTo15Minutes(bestSlot.start);
        const eventEnd = roundTo15Minutes(
          new Date(startTime.getTime() + eventDuration * 60 * 1000)
        );

        if (occupiedSlots.hasConflict(startTime, eventEnd)) {
          const slotIndex = futureSlots.indexOf(bestSlot);
          if (slotIndex > -1) futureSlots.splice(slotIndex, 1);
          continue;
        }

        if (task.end_date && eventEnd > new Date(task.end_date)) {
          scheduledAfterDeadline = true;
        }

        const previewEvent: PreviewEvent = {
          id: generatePreviewId(),
          title: task.name ?? 'Task',
          start_at: startTime.toISOString(),
          end_at: eventEnd.toISOString(),
          type: 'task',
          source_id: task.id,
          color: getColorForHourType(task.calendar_hours),
          isPreview: true,
          step: stepCounter,
          scheduled_minutes: eventDuration,
        };

        const taskStartFormatted = formatTime(startTime, timezone);
        const taskEndFormatted = formatTime(eventEnd, timezone);
        // Use the actual event start time for the date (in local timezone)
        const taskDateStr = getLocalDateString(startTime, timezone);

        steps.push({
          step: stepCounter++,
          type: 'task',
          action: 'schedule',
          description: `Scheduling ${eventDuration}min of "${task.name}" on ${taskDateStr} at ${taskStartFormatted}-${taskEndFormatted}`,
          event: previewEvent,
          relatedId: task.id,
          relatedName: task.name ?? 'Task',
          timestamp: Date.now(),
          debug: {
            slotsAvailable: futureSlots.length,
            slotsConsidered: futureSlots.slice(0, 5).map(formatSlotForDebug),
            slotChosen: formatSlotForDebug(bestSlot),
            reason: `Earliest slot with ${Math.round(bestSlot.maxAvailable)}min available (back-to-back scheduling)`,
            remainingMinutes: remainingMinutes - eventDuration,
            dayOffset,
          },
        });

        occupiedSlots.add(
          startTime,
          eventEnd,
          'task',
          previewEvent.id,
          taskPriority
        );
        allPreviewEvents.push(previewEvent);
        taskEvents.push(previewEvent);
        scheduledSoFar += eventDuration;
        remainingMinutes -= eventDuration;

        const slotIndex = futureSlots.indexOf(bestSlot);
        if (slotIndex > -1) {
          futureSlots.splice(slotIndex, 1);
          const remainingSlotDuration =
            (bestSlot.end.getTime() - eventEnd.getTime()) / 60000;
          if (remainingSlotDuration >= minDuration) {
            futureSlots.push({
              start: new Date(eventEnd),
              end: bestSlot.end,
              maxAvailable: remainingSlotDuration,
            });
            // Re-sort to maintain chronological order for back-to-back scheduling
            futureSlots.sort((a, b) => a.start.getTime() - b.start.getTime());
          }
        }
      }
    }

    const finalScheduledMinutes = scheduledMinutes + scheduledSoFar;
    const finalRemainingMinutes = totalMinutes - finalScheduledMinutes;

    let warning: string | undefined;
    let warningLevel: 'info' | 'warning' | 'error' | undefined;

    if (scheduledSoFar === 0 && totalMinutes > scheduledMinutes) {
      warning = `Could not schedule any time for task - no available slots found`;
      warningLevel = 'error';
      unscheduledTasks++;
    } else if (finalRemainingMinutes > 0) {
      warning = `Partially scheduled: ${finalRemainingMinutes} minutes remaining (${Math.round((finalScheduledMinutes / totalMinutes) * 100)}% complete)`;
      warningLevel = 'warning';
      partiallyScheduledTasks++;
    } else if (scheduledAfterDeadline) {
      warning = 'Some events scheduled after deadline';
      warningLevel = 'info';
    }

    taskResults.push({
      task,
      events: taskEvents,
      scheduledMinutes: finalScheduledMinutes,
      totalMinutesRequired: totalMinutes,
      remainingMinutes: finalRemainingMinutes,
      warning,
      warningLevel,
    });

    if (warning && warningLevel !== 'info') {
      taskWarnings.push(`Task "${task.name}": ${warning}`);
    }
  }

  // ============================================================================
  // FINAL SUMMARY
  // ============================================================================

  steps.push({
    step: stepCounter++,
    type: 'info',
    action: 'complete',
    description: `Preview complete: ${habitResults.length} habits, ${taskResults.filter((t) => t.events.length > 0).length} tasks scheduled`,
    timestamp: Date.now(),
  });

  return {
    events: allPreviewEvents,
    steps,
    habits: {
      events: habitResults,
      warnings: habitWarnings,
    },
    tasks: {
      events: taskResults,
      warnings: taskWarnings,
    },
    warnings: [...habitWarnings, ...taskWarnings],
    summary: {
      totalEvents: allPreviewEvents.length,
      habitsScheduled: habitResults.length,
      tasksScheduled: taskResults.filter((t) => t.events.length > 0).length,
      bumpedHabits: bumpedHabitsCount,
      breaksScheduled: breaksCount,
      partiallyScheduledTasks,
      unscheduledTasks,
    },
  };
}

/**
 * Get steps for animated playback
 * Returns only the scheduling steps (not info steps) for visual animation
 */
export function getAnimationSteps(result: PreviewResult): SchedulingStep[] {
  return result.steps.filter(
    (s) => s.type === 'habit' || s.type === 'task' || s.type === 'bump'
  );
}

/**
 * Get preview events up to a specific step (for animated playback)
 */
export function getEventsAtStep(
  result: PreviewResult,
  step: number
): PreviewEvent[] {
  return result.events.filter((e) => e.step <= step);
}
