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

import type {
  HabitDurationConfig,
  SchedulingWeights,
} from '@tuturuuu/ai/scheduling';
import {
  calculateIdealStartTimeForHabit,
  comparePriority,
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
import {
  buildHabitPrerequisiteMap,
  topologicallySortHabits,
} from '../habit-dependencies';
import {
  compareEffectivePriorityScores,
  getHabitEffectivePriority,
  getTaskEffectivePriority,
} from '../scheduling-priority';
import {
  addZonedDaysUtc,
  getZonedDateParts,
  getZonedWeekday,
  isValidTimeZone,
  startOfZonedDayUtc,
  zonedDateTimeToUtc,
} from './timezone-utils';

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
  // If true, this event exactly matches an existing event (same position) and won't be moved
  is_reused?: boolean;
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

function parseTimeParts(time: string): { hour: number; minute: number } {
  const [rawHour, rawMinute] = time.split(':');
  const hour = Number.parseInt(rawHour ?? '0', 10);
  const minute = Number.parseInt(rawMinute ?? '0', 10);

  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
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

function getLocalMinute(
  date: Date,
  timezone: string | null | undefined
): number {
  if (!timezone || timezone === 'auto') {
    return date.getMinutes(); // Use system local time, not UTC
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
    return date.getMinutes(); // Fallback to system local time, not UTC
  }
}

function generatePreviewId(): string {
  return `preview-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function formatSlotForDebug(
  slot: {
    start: Date;
    end: Date;
    maxAvailable: number;
  },
  timezone: string | null | undefined
): SlotDebugInfo {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayIdx =
    timezone && timezone !== 'auto'
      ? getZonedWeekday(slot.start, timezone)
      : slot.start.getDay();
  return {
    start: slot.start.toISOString(),
    end: slot.end.toISOString(),
    maxAvailable: Math.round(slot.maxAvailable),
    dayOfWeek: dayNames[dayIdx] || 'Unknown',
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
  const actualMin = getLocalMinute(actualStartTime, timezone);
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

function clampSlotEnd(
  slot: { start: Date; end: Date; maxAvailable: number },
  hardEnd: Date | null
): { start: Date; end: Date; maxAvailable: number } | null {
  if (!hardEnd) return slot;
  if (slot.start >= hardEnd) return null;

  const end = slot.end > hardEnd ? hardEnd : slot.end;
  const maxAvailable = (end.getTime() - slot.start.getTime()) / 60000;
  if (maxAvailable <= 0) return null;

  return {
    start: slot.start,
    end,
    maxAvailable,
  };
}

function isSameLocalDay(
  left: Date,
  right: Date,
  timezone: string | null | undefined
): boolean {
  return (
    getLocalDateString(left, timezone) === getLocalDateString(right, timezone)
  );
}

function pickTaskSlot(
  slots: Array<{ start: Date; end: Date; maxAvailable: number }>,
  desiredDuration: number,
  minDuration: number
): { start: Date; end: Date; maxAvailable: number } | undefined {
  return (
    slots.find((slot) => slot.maxAvailable >= desiredDuration) ??
    slots.find((slot) => slot.maxAvailable >= minDuration)
  );
}

function clampPreviewEventStart(
  proposedStart: Date,
  slot: { start: Date; end: Date },
  durationMinutes: number
): Date {
  const latestStart = new Date(
    slot.end.getTime() - durationMinutes * 60 * 1000
  );

  if (proposedStart < slot.start) {
    return new Date(slot.start);
  }

  if (proposedStart > latestStart) {
    return latestStart;
  }

  return proposedStart;
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
  minDuration: number,
  timezone: string | null | undefined
): Array<{ start: Date; end: Date; maxAvailable: number }> {
  const dayOfWeek =
    timezone && timezone !== 'auto'
      ? getZonedWeekday(date, timezone)
      : date.getDay();
  const timeBlocks = getDayTimeBlocks(hourSettings, calendarHours, dayOfWeek);
  const slots: Array<{ start: Date; end: Date; maxAvailable: number }> = [];

  const ymd =
    timezone && timezone !== 'auto' ? getZonedDateParts(date, timezone) : null;

  for (const block of timeBlocks) {
    if (!block.startTime || !block.endTime) continue;

    const { hour: startHour, minute: startMin } = parseTimeParts(
      block.startTime
    );
    const { hour: endHour, minute: endMin } = parseTimeParts(block.endTime);

    const blockStart =
      timezone && timezone !== 'auto' && ymd
        ? zonedDateTimeToUtc(
            {
              ...ymd,
              hour: startHour,
              minute: startMin,
              second: 0,
            },
            timezone
          )
        : (() => {
            const d = new Date(date);
            d.setHours(startHour, startMin, 0, 0);
            return d;
          })();

    const blockEnd =
      timezone && timezone !== 'auto' && ymd
        ? zonedDateTimeToUtc(
            {
              ...ymd,
              hour: endHour,
              minute: endMin,
              second: 0,
            },
            timezone
          )
        : (() => {
            const d = new Date(date);
            d.setHours(endHour, endMin, 0, 0);
            return d;
          })();

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
  duration: number,
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

  const getFeasibleStartWindow = (slot: { start: Date; end: Date }) => {
    const latestStart = new Date(slot.end.getTime() - duration * 60 * 1000);
    const windowEnd = latestStart > slot.start ? latestStart : slot.start;
    const slotStartHour = getLocalHour(slot.start, timezone);
    const slotStartMin = getLocalMinute(slot.start, timezone);
    const windowEndHour = getLocalHour(windowEnd, timezone);
    const windowEndMin = getLocalMinute(windowEnd, timezone);

    return {
      windowStartMinutes: slotStartHour * 60 + slotStartMin,
      windowEndMinutes: windowEndHour * 60 + windowEndMin,
    };
  };

  const getDistanceFromIdealTime = (slot: { start: Date; end: Date }) => {
    const { windowStartMinutes, windowEndMinutes } =
      getFeasibleStartWindow(slot);

    if (idealHour !== null) {
      const idealTimeInMinutes = idealHour * 60 + (idealMin ?? 0);

      // If the habit can START at the ideal time inside the feasible start window,
      // distance is 0. This avoids treating a long slot as ideal when the ideal
      // time is too close to the slot end to fit the full duration.
      if (
        idealTimeInMinutes >= windowStartMinutes &&
        idealTimeInMinutes <= windowEndMinutes
      ) {
        return 0;
      }

      const distToStart = Math.abs(idealTimeInMinutes - windowStartMinutes);
      const distToEnd = Math.abs(idealTimeInMinutes - windowEndMinutes);
      return Math.min(distToStart, distToEnd);
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
        const { windowStartMinutes, windowEndMinutes } =
          getFeasibleStartWindow(slot);
        if (
          centerMinutes >= windowStartMinutes &&
          centerMinutes <= windowEndMinutes
        ) {
          return 0;
        }
        const distToStart = Math.abs(centerMinutes - windowStartMinutes);
        const distToEnd = Math.abs(centerMinutes - windowEndMinutes);
        return Math.min(distToStart, distToEnd);
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
        const { windowStartMinutes, windowEndMinutes } =
          getFeasibleStartWindow(slot);
        const preferenceStartMinutes = range.start * 60;
        const preferenceEndMinutes = range.end * 60;

        return (
          windowEndMinutes >= preferenceStartMinutes &&
          windowStartMinutes < preferenceEndMinutes
        );
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

function choosePreviewHabitStartTime(
  habit: Habit,
  slot: { start: Date; end: Date; maxAvailable: number },
  duration: number,
  now: Date,
  timezone: string | null | undefined
): Date {
  const calculated = calculateIdealStartTimeForHabit(
    convertHabitToConfig(habit),
    slot,
    duration,
    now,
    timezone
  );

  if (!habit.ideal_time) {
    return calculated;
  }

  const { hour: idealHour, minute: idealMinute } = parseTimeParts(
    habit.ideal_time
  );
  const slotStartMinutes =
    getLocalHour(slot.start, timezone) * 60 +
    getLocalMinute(slot.start, timezone);
  const idealMinutes = idealHour * 60 + idealMinute;

  if (slotStartMinutes <= idealMinutes) {
    return calculated;
  }

  // When the chosen slot begins after the ideal time, keep the habit as late
  // as possible inside that slot so long sessions stay anchored to the same
  // preferred part of the day instead of snapping to the slot boundary.
  return roundTo15Minutes(new Date(slot.end.getTime() - duration * 60 * 1000));
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
  now?: Date;
  /** Set of 'habitId:YYYY-MM-DD' strings for skipped habit occurrences. */
  existingHabitDays?: Set<string>;
  /** Count of already scheduled habit instances keyed by 'habitId:YYYY-MM-DD'. */
  existingHabitInstanceCounts?: Map<string, number>;
  /** Minutes already scheduled for habit instances keyed by 'habitId:YYYY-MM-DD'. */
  existingHabitScheduledMinutes?: Map<string, number>;
  /** Set of event IDs that are habit events and should remain blocked (not replaced) */
  habitEventIds?: Set<string>;
  /** Existing dependency anchor events keyed by 'habitId:YYYY-MM-DD'. */
  existingHabitDependencyAnchors?: Map<
    string,
    Array<{ start_at: string; end_at: string }>
  >;
  /** Optional weights for scoring */
  weights?: SchedulingWeights;
}

function getTargetHabitInstances(habit: Habit): {
  min: number;
  ideal: number;
  max: number;
} {
  if (!habit.is_splittable) {
    return { min: 1, ideal: 1, max: 1 };
  }

  const min = Math.max(1, habit.min_instances_per_day ?? 1);
  const max = Math.max(min, habit.max_instances_per_day ?? min);
  const ideal = Math.min(
    max,
    Math.max(min, habit.ideal_instances_per_day ?? min)
  );

  return { min, ideal, max };
}

function roundDurationTo15(minutes: number): number {
  return Math.max(15, Math.round(minutes / 15) * 15);
}

function clampMinutes(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildHabitOccurrenceKey(
  habitId: string,
  occurrenceDate: string
): string {
  return `${habitId}:${occurrenceDate}`;
}

function getHabitDependencyEarliestStart(
  habitId: string,
  occurrenceDate: string,
  prerequisiteMap: Map<string, Set<string>>,
  dependencyAnchors: Map<string, Array<{ start_at: string; end_at: string }>>
): Date | null {
  const prerequisites = prerequisiteMap.get(habitId);
  if (!prerequisites || prerequisites.size === 0) {
    return null;
  }

  let earliestStart: Date | null = null;

  for (const prerequisiteHabitId of prerequisites) {
    const anchors =
      dependencyAnchors.get(
        buildHabitOccurrenceKey(prerequisiteHabitId, occurrenceDate)
      ) ?? [];

    for (const anchor of anchors) {
      const anchorEnd = new Date(anchor.end_at);
      if (!earliestStart || anchorEnd > earliestStart) {
        earliestStart = anchorEnd;
      }
    }
  }

  return earliestStart;
}

function relabelSplitHabitPreviewEvents(
  habitResults: PreviewHabitResult[],
  existingHabitInstanceCounts: Map<string, number>
): void {
  const groupedResults = new Map<string, PreviewHabitResult[]>();

  for (const result of habitResults) {
    const occurrenceDate = result.event.occurrence_date;
    if (!occurrenceDate || !result.habit.is_splittable) {
      continue;
    }

    const key = buildHabitOccurrenceKey(result.habit.id, occurrenceDate);
    const group = groupedResults.get(key) ?? [];
    group.push(result);
    groupedResults.set(key, group);
  }

  for (const [key, group] of groupedResults) {
    group.sort(
      (left, right) =>
        new Date(left.event.start_at).getTime() -
        new Date(right.event.start_at).getTime()
    );

    const existingCount = existingHabitInstanceCounts.get(key) ?? 0;
    const totalInstances = existingCount + group.length;

    group.forEach((result, index) => {
      result.event.title = `${result.habit.name} (${existingCount + index + 1}/${totalInstances})`;
    });
  }
}

function getHabitDurationTargets(
  habit: Habit,
  instanceTargets: { min: number; ideal: number; max: number }
): {
  totalPerDay: number;
  minInstance: number;
  preferredInstance: number;
  maxInstance: number;
} {
  const totalPerDay = roundDurationTo15(Math.max(15, habit.duration_minutes));

  if (!habit.is_splittable) {
    const {
      min: minDuration,
      preferred,
      max,
    } = getEffectiveDurationBounds({
      duration_minutes: totalPerDay,
      min_duration_minutes: habit.min_duration_minutes,
      max_duration_minutes: habit.max_duration_minutes,
    });

    return {
      totalPerDay,
      minInstance: minDuration || 15,
      preferredInstance: preferred || totalPerDay,
      maxInstance: max || totalPerDay,
    };
  }

  const minInstance = roundDurationTo15(
    Math.min(totalPerDay, Math.max(15, habit.min_duration_minutes ?? 15))
  );
  const maxInstance = roundDurationTo15(
    Math.min(
      totalPerDay,
      Math.max(minInstance, habit.max_duration_minutes ?? totalPerDay)
    )
  );

  return {
    totalPerDay,
    minInstance,
    preferredInstance: clampMinutes(
      roundDurationTo15(totalPerDay / instanceTargets.ideal),
      minInstance,
      maxInstance
    ),
    maxInstance,
  };
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
  const {
    windowDays = 30,
    timezone = null,
    now: nowOption,
    existingHabitDays = new Set<string>(),
    existingHabitInstanceCounts = new Map<string, number>(),
    existingHabitScheduledMinutes = new Map<string, number>(),
    habitEventIds = new Set<string>(),
    existingHabitDependencyAnchors = new Map<
      string,
      Array<{ start_at: string; end_at: string }>
    >(),
    weights,
  } = options;
  const resolvedTimezone =
    timezone && timezone !== 'auto' && isValidTimeZone(timezone)
      ? timezone
      : Intl.DateTimeFormat().resolvedOptions().timeZone;

  const steps: SchedulingStep[] = [];
  const allPreviewEvents: PreviewEvent[] = [];
  const habitResults: PreviewHabitResult[] = [];
  const taskResults: PreviewTaskResult[] = [];
  const habitWarnings: string[] = [];
  const taskWarnings: string[] = [];

  let stepCounter = 0;
  let bumpedHabitsCount = 0;
  const breaksCount = 0;
  let partiallyScheduledTasks = 0;
  let unscheduledTasks = 0;

  const now = nowOption ? new Date(nowOption) : new Date();
  const rangeEnd =
    resolvedTimezone && resolvedTimezone !== 'auto'
      ? addZonedDaysUtc(now, resolvedTimezone, windowDays)
      : (() => {
          const d = new Date(now);
          d.setDate(d.getDate() + windowDays);
          return d;
        })();
  // Convert existing events to blocked slots
  // Block events that SHOULD NOT be overlapped:
  // - Locked events: User-protected, can't be moved
  // - Past/in-progress events: Already started, can't be moved
  // - Habit events: Must respect existing habit time slots (via habitEventIds)
  // Task events CAN be replaced, so don't block them (unless they're habits)
  const blockedEvents = existingEvents
    .filter((e) => {
      if (e._isPreview) return false; // Never block preview events
      if (e.locked) return true; // Always block locked events
      // Block events that have already started (in-progress or past)
      const eventStart = new Date(e.start_at);
      if (eventStart < now) return true;
      // Block existing habit events (tasks must respect habit time slots)
      if (habitEventIds.has(e.id)) return true;
      // Don't block future task events - they will be replaced
      return false;
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
  const habitDependencyAnchors = new Map(existingHabitDependencyAnchors);
  const habitPrerequisiteMap = buildHabitPrerequisiteMap(habits);

  const blockedEventsCount = blockedEvents.length;
  const lockedEventsCount = existingEvents.filter((e) => e.locked).length;

  const bumpHabitEventsForTaskDay = (
    task: TaskWithScheduling,
    taskPriority: TaskPriority,
    searchDate: Date,
    deadline: Date | null
  ): Array<{ habit: Habit; occurrence: Date }> => {
    const bumpable = occupiedSlots
      .findBumpableHabitEvents(
        taskPriority,
        deadline && deadline > now ? deadline : rangeEnd,
        now
      )
      .filter((slot) =>
        isSameLocalDay(slot.start, searchDate, resolvedTimezone)
      );

    if (bumpable.length === 0) return [];

    bumpable.sort((a, b) => {
      const aHabitInfo = habitEventMap.get(a.id);
      const bHabitInfo = habitEventMap.get(b.id);
      const aHasPreference =
        aHabitInfo?.habit.ideal_time || aHabitInfo?.habit.time_preference;
      const bHasPreference =
        bHabitInfo?.habit.ideal_time || bHabitInfo?.habit.time_preference;

      if (!aHasPreference && bHasPreference) return -1;
      if (aHasPreference && !bHasPreference) return 1;

      return a.start.getTime() - b.start.getTime();
    });

    const bumpedOccurrences = new Map<
      string,
      { habit: Habit; occurrence: Date }
    >();

    for (const bumpableSlot of bumpable) {
      const habitInfo = habitEventMap.get(bumpableSlot.id);
      if (!habitInfo) continue;

      occupiedSlots.remove(bumpableSlot.id);
      habitEventMap.delete(bumpableSlot.id);

      const previewEventIndex = allPreviewEvents.findIndex(
        (event) => event.id === bumpableSlot.id
      );
      if (previewEventIndex >= 0) {
        allPreviewEvents.splice(previewEventIndex, 1);
      }

      const habitResultIndex = habitResults.findIndex(
        (entry) => entry.event.id === bumpableSlot.id
      );
      if (habitResultIndex >= 0) {
        habitResults.splice(habitResultIndex, 1);
      }

      steps.push({
        step: stepCounter++,
        type: 'bump',
        action: 'bump-habit',
        description: `Bumping habit "${habitInfo.habit.name}" on ${getLocalDateString(
          bumpableSlot.start,
          resolvedTimezone
        )} to make room for task "${task.name}"`,
        relatedId: task.id,
        relatedName: task.name ?? 'Task',
        timestamp: Date.now(),
        debug: {
          reason: `Task effective priority ${taskPriority} displaced lower-priority habit`,
        },
      });

      bumpedHabitsCount++;
      bumpedOccurrences.set(
        buildHabitOccurrenceKey(
          habitInfo.habit.id,
          getLocalDateString(habitInfo.occurrence, resolvedTimezone)
        ),
        {
          habit: habitInfo.habit,
          occurrence: habitInfo.occurrence,
        }
      );
    }

    return [...bumpedOccurrences.values()];
  };

  steps.push({
    step: stepCounter++,
    type: 'info',
    action: 'start',
    description: `Starting preview: ${habits.length} habits, ${tasks.length} tasks, ${blockedEventsCount} blocked events (${lockedEventsCount} locked)`,
    timestamp: Date.now(),
    debug: {
      slotsAvailable: blockedEventsCount,
      reason: `Window: ${windowDays} days from ${now.toISOString().split('T')[0]} to ${rangeEnd.toISOString().split('T')[0]} (tz=${resolvedTimezone})`,
    },
  });

  // ============================================================================
  // PHASE 1: Schedule Habits
  // ============================================================================

  const compareHabits = (a: Habit, b: Habit) => {
    const aHasIdealTime = !!a.ideal_time;
    const bHasIdealTime = !!b.ideal_time;
    if (aHasIdealTime && !bHasIdealTime) return -1;
    if (bHasIdealTime && !aHasIdealTime) return 1;

    const aHasTimePref = !!a.time_preference;
    const bHasTimePref = !!b.time_preference;
    if (aHasTimePref && !bHasTimePref) return -1;
    if (bHasTimePref && !aHasTimePref) return 1;

    return compareEffectivePriorityScores(
      getHabitEffectivePriority(a),
      getHabitEffectivePriority(b)
    );
  };

  const { sorted: sortedHabits } = topologicallySortHabits(
    habits,
    compareHabits
  );

  const getCurrentHabitDayProgress = (
    habitId: string,
    occurrenceDate: string
  ) => {
    const key = buildHabitOccurrenceKey(habitId, occurrenceDate);
    const previewResultsForDay = habitResults.filter(
      (result) =>
        result.habit.id === habitId &&
        result.event.occurrence_date === occurrenceDate
    );

    return {
      key,
      scheduledInstances:
        (existingHabitInstanceCounts.get(key) ?? 0) +
        previewResultsForDay.length,
      scheduledMinutes:
        (existingHabitScheduledMinutes.get(key) ?? 0) +
        previewResultsForDay.reduce((sum, result) => sum + result.duration, 0),
    };
  };

  const scheduleHabitOccurrence = (
    habit: Habit,
    occurrence: Date,
    mode: 'initial' | 'rebuild' = 'initial'
  ) => {
    const occurrenceDate = getLocalDateString(occurrence, resolvedTimezone);
    const { key: habitDayKey } = getCurrentHabitDayProgress(
      habit.id,
      occurrenceDate
    );
    const instanceTargets = getTargetHabitInstances(habit);
    const durationTargets = getHabitDurationTargets(habit, instanceTargets);

    if (existingHabitDays.has(habitDayKey)) {
      return 0;
    }

    let { scheduledInstances, scheduledMinutes } = getCurrentHabitDayProgress(
      habit.id,
      occurrenceDate
    );
    const earliestDependencyStart = getHabitDependencyEarliestStart(
      habit.id,
      occurrenceDate,
      habitPrerequisiteMap,
      habitDependencyAnchors
    );

    if (scheduledMinutes >= durationTargets.totalPerDay) {
      return 0;
    }

    let createdInstances = 0;

    while (
      scheduledInstances < instanceTargets.max &&
      scheduledMinutes < durationTargets.totalPerDay
    ) {
      const remainingMinutes = durationTargets.totalPerDay - scheduledMinutes;
      const targetInstancesLeft =
        scheduledInstances < instanceTargets.ideal
          ? instanceTargets.ideal - scheduledInstances
          : 1;
      const minMinutesReservedForRest =
        durationTargets.minInstance * Math.max(0, targetInstancesLeft - 1);
      let maxAllowedThisInstance = Math.min(
        durationTargets.maxInstance,
        remainingMinutes - minMinutesReservedForRest
      );

      if (maxAllowedThisInstance < durationTargets.minInstance) {
        maxAllowedThisInstance = Math.min(
          durationTargets.maxInstance,
          remainingMinutes
        );
      }

      if (maxAllowedThisInstance < durationTargets.minInstance) {
        break;
      }

      const targetDuration = clampMinutes(
        roundDurationTo15(
          scheduledInstances < instanceTargets.ideal
            ? remainingMinutes / targetInstancesLeft
            : Math.min(durationTargets.preferredInstance, remainingMinutes)
        ),
        durationTargets.minInstance,
        maxAllowedThisInstance
      );

      const slots = findAvailableSlotsInDay(
        occurrence,
        hourSettings,
        habit.calendar_hours,
        occupiedSlots,
        durationTargets.minInstance,
        resolvedTimezone
      );

      if (slots.length === 0) {
        break;
      }

      const futureSlots = filterFutureSlots(slots, now).filter((slot) => {
        if (!earliestDependencyStart) {
          return true;
        }

        return slot.end > earliestDependencyStart;
      });
      if (futureSlots.length === 0) {
        break;
      }

      const preferredSlots = filterSlotsByTimePreference(
        futureSlots,
        habit.ideal_time,
        habit.time_preference,
        targetDuration,
        resolvedTimezone
      );
      const habitConfig = convertHabitToConfig({
        ...habit,
        duration_minutes: targetDuration,
        min_duration_minutes: durationTargets.minInstance,
        max_duration_minutes: maxAllowedThisInstance,
      });
      let bestSlot:
        | { start: Date; end: Date; maxAvailable: number }
        | undefined;
      if (habit.ideal_time || habit.time_preference) {
        bestSlot = preferredSlots.find(
          (slot) => slot.maxAvailable >= durationTargets.minInstance
        );
      } else {
        bestSlot =
          findBestSlotForHabitAI(
            habitConfig,
            preferredSlots,
            resolvedTimezone,
            weights
          ) ?? undefined;
      }

      if (!bestSlot) {
        break;
      }

      const duration = Math.min(
        Math.max(targetDuration, durationTargets.minInstance),
        Math.min(maxAllowedThisInstance, bestSlot.maxAvailable)
      );

      if (duration < durationTargets.minInstance) {
        break;
      }

      const rawIdealStartTime = choosePreviewHabitStartTime(
        habit,
        bestSlot,
        duration,
        now,
        resolvedTimezone
      );

      let idealStartTime = roundTo15Minutes(rawIdealStartTime);
      if (earliestDependencyStart && idealStartTime < earliestDependencyStart) {
        idealStartTime = roundTo15Minutes(earliestDependencyStart);
      }
      idealStartTime = roundTo15Minutes(
        clampPreviewEventStart(idealStartTime, bestSlot, duration)
      );
      const eventEnd = roundTo15Minutes(
        new Date(idealStartTime.getTime() + duration * 60 * 1000)
      );

      if (eventEnd > bestSlot.end) {
        break;
      }

      const actualDeviationMinutes = calculateDeviationMinutes(
        idealStartTime,
        habit.ideal_time,
        habit.time_preference,
        resolvedTimezone
      );
      const skipCheck = shouldSkipHabitInstance(actualDeviationMinutes, habit);
      if (skipCheck.skip) {
        if (createdInstances === 0) {
          habitWarnings.push(
            `Skipping "${habit.name}" on ${occurrenceDate}: ${skipCheck.reason}`
          );
        }
        break;
      }

      if (occupiedSlots.hasConflict(idealStartTime, eventEnd)) {
        break;
      }

      const actualOccurrenceDate = getLocalDateString(
        idealStartTime,
        resolvedTimezone
      );

      const previewEvent: PreviewEvent = {
        id: generatePreviewId(),
        title:
          instanceTargets.ideal > 1
            ? `${habit.name} (${scheduledInstances + 1}/${instanceTargets.ideal})`
            : habit.name,
        start_at: idealStartTime.toISOString(),
        end_at: eventEnd.toISOString(),
        type: 'habit',
        source_id: habit.id,
        color: habit.color || getColorForHourType(habit.calendar_hours),
        isPreview: true,
        step: stepCounter,
        occurrence_date: actualOccurrenceDate,
      };

      const slotChosenDebug = formatSlotForDebug(bestSlot, resolvedTimezone);
      const startTimeFormatted = formatTime(idealStartTime, resolvedTimezone);
      const endTimeFormatted = formatTime(eventEnd, resolvedTimezone);

      steps.push({
        step: stepCounter++,
        type: mode === 'rebuild' ? 'reschedule' : 'habit',
        action: mode === 'rebuild' ? 'rebuild-habit' : 'schedule',
        description:
          mode === 'rebuild'
            ? `Rebuilding habit "${habit.name}" on ${actualOccurrenceDate} at ${startTimeFormatted}-${endTimeFormatted} (${duration}min)`
            : `Scheduling habit "${habit.name}" on ${actualOccurrenceDate} at ${startTimeFormatted}-${endTimeFormatted} (${duration}min)`,
        event: previewEvent,
        relatedId: habit.id,
        relatedName: habit.name,
        timestamp: Date.now(),
        debug: {
          slotsAvailable: futureSlots.length,
          slotsConsidered: preferredSlots
            .slice(0, 3)
            .map((s) => formatSlotForDebug(s, resolvedTimezone)),
          slotChosen: slotChosenDebug,
          reason:
            mode === 'rebuild'
              ? 'Rescheduled after a higher-priority task displaced this day'
              : habit.ideal_time
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
      const dependencyAnchors = habitDependencyAnchors.get(habitDayKey) ?? [];
      dependencyAnchors.push({
        start_at: previewEvent.start_at,
        end_at: previewEvent.end_at,
      });
      habitDependencyAnchors.set(habitDayKey, dependencyAnchors);
      scheduledInstances++;
      scheduledMinutes += duration;
      createdInstances++;

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

    if (mode === 'initial') {
      if (scheduledInstances < instanceTargets.min) {
        habitWarnings.push(
          `Habit "${habit.name}" on ${occurrenceDate} only reached ${scheduledInstances}/${instanceTargets.min} required instances`
        );
      }

      if (scheduledMinutes < durationTargets.totalPerDay) {
        habitWarnings.push(
          `Habit "${habit.name}" on ${occurrenceDate} is ${durationTargets.totalPerDay - scheduledMinutes} minutes short of its daily target`
        );
      }
    }

    return createdInstances;
  };

  for (const habit of sortedHabits) {
    const occurrences = getOccurrencesInRange(
      habit,
      now,
      new Date(rangeEnd.getTime() - 1),
      resolvedTimezone
    );

    for (const occurrence of occurrences) {
      scheduleHabitOccurrence(habit, occurrence, 'initial');
    }
  }

  relabelSplitHabitPreviewEvents(habitResults, existingHabitInstanceCounts);
  allPreviewEvents.sort(
    (left, right) =>
      new Date(left.start_at).getTime() - new Date(right.start_at).getTime()
  );

  // ============================================================================
  // PHASE 2: Schedule Tasks
  // ============================================================================

  const sortedTasks = [...tasks].sort((a, b) => {
    const aPriority = getTaskEffectivePriority(a, now);
    const bPriority = getTaskEffectivePriority(b, now);
    const priorityDiff = compareEffectivePriorityScores(aPriority, bPriority);
    if (priorityDiff !== 0) return priorityDiff;

    if (a.end_date && b.end_date) {
      const deadlineDiff =
        new Date(a.end_date).getTime() - new Date(b.end_date).getTime();
      if (deadlineDiff !== 0) return deadlineDiff;
    } else if (a.end_date) return -1;
    else if (b.end_date) return 1;

    if (a.created_at && b.created_at) {
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }
    return 0;
  });

  const zonedWindowStart =
    resolvedTimezone && resolvedTimezone !== 'auto'
      ? startOfZonedDayUtc(now, resolvedTimezone)
      : (() => {
          const d = new Date(now);
          d.setHours(0, 0, 0, 0);
          return d;
        })();

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

    const taskPriorityMeta = getTaskEffectivePriority(task, now);
    const taskPriority = taskPriorityMeta.effectivePriority;
    const taskEvents: PreviewEvent[] = [];
    let scheduledSoFar = 0;
    let scheduledAfterDeadline = false;

    const isSplittable = task.is_splittable ?? false;
    const minDuration = isSplittable
      ? (task.min_split_duration_minutes ?? 30)
      : remainingMinutes;
    const maxDuration = isSplittable
      ? (task.max_split_duration_minutes ?? 120)
      : remainingMinutes;
    const deadline = task.end_date ? new Date(task.end_date) : null;
    const hardDeadline = deadline && deadline > now ? deadline : null;
    const canBumpHabits =
      taskPriority === 'critical' ||
      (taskPriorityMeta.deadlineUrgencyScore ?? 0) > 0;

    for (
      let dayOffset = 0;
      dayOffset < windowDays && remainingMinutes > 0;
      dayOffset++
    ) {
      const bumpedHabitsToRebuild = new Map<
        string,
        { habit: Habit; occurrence: Date }
      >();
      const searchDate =
        resolvedTimezone && resolvedTimezone !== 'auto'
          ? addZonedDaysUtc(zonedWindowStart, resolvedTimezone, dayOffset)
          : (() => {
              const d = new Date(now);
              d.setDate(d.getDate() + dayOffset);
              d.setHours(0, 0, 0, 0);
              return d;
            })();

      if (hardDeadline && searchDate >= hardDeadline) {
        break;
      }

      if (task.start_date && searchDate < new Date(task.start_date)) {
        continue;
      }

      let slots = findAvailableSlotsInDay(
        searchDate,
        hourSettings,
        task.calendar_hours ?? null,
        occupiedSlots,
        minDuration,
        resolvedTimezone
      );

      let futureSlots = filterFutureSlots(slots, now);
      let boundedSlots = futureSlots
        .map((slot) => clampSlotEnd(slot, hardDeadline))
        .filter(
          (slot): slot is { start: Date; end: Date; maxAvailable: number } =>
            slot !== null
        );

      const shouldPreemptHabitsForUrgentTask =
        canBumpHabits &&
        ((taskPriorityMeta.deadlineUrgencyScore ?? 0) >= 2 ||
          taskPriority === 'critical');

      if (shouldPreemptHabitsForUrgentTask) {
        const bumped = bumpHabitEventsForTaskDay(
          task,
          taskPriority,
          searchDate,
          deadline
        );

        for (const bumpedHabit of bumped) {
          bumpedHabitsToRebuild.set(
            buildHabitOccurrenceKey(
              bumpedHabit.habit.id,
              getLocalDateString(bumpedHabit.occurrence, resolvedTimezone)
            ),
            bumpedHabit
          );
        }

        if (bumped.length > 0) {
          slots = findAvailableSlotsInDay(
            searchDate,
            hourSettings,
            task.calendar_hours ?? null,
            occupiedSlots,
            minDuration,
            resolvedTimezone
          );
          futureSlots = filterFutureSlots(slots, now);
          boundedSlots = futureSlots
            .map((slot) => clampSlotEnd(slot, hardDeadline))
            .filter(
              (
                slot
              ): slot is { start: Date; end: Date; maxAvailable: number } =>
                slot !== null
            );
        }
      } else if (boundedSlots.length === 0 && canBumpHabits) {
        const bumped = bumpHabitEventsForTaskDay(
          task,
          taskPriority,
          searchDate,
          deadline
        );

        for (const bumpedHabit of bumped) {
          bumpedHabitsToRebuild.set(
            buildHabitOccurrenceKey(
              bumpedHabit.habit.id,
              getLocalDateString(bumpedHabit.occurrence, resolvedTimezone)
            ),
            bumpedHabit
          );
        }

        if (bumped.length > 0) {
          slots = findAvailableSlotsInDay(
            searchDate,
            hourSettings,
            task.calendar_hours ?? null,
            occupiedSlots,
            minDuration,
            resolvedTimezone
          );
          futureSlots = filterFutureSlots(slots, now);
          boundedSlots = futureSlots
            .map((slot) => clampSlotEnd(slot, hardDeadline))
            .filter(
              (
                slot
              ): slot is { start: Date; end: Date; maxAvailable: number } =>
                slot !== null
            );
        }
      }

      // Sort slots by start time to enable back-to-back scheduling
      boundedSlots.sort((a, b) => a.start.getTime() - b.start.getTime());
      let dayCursor: Date | null = null;

      while (boundedSlots.length > 0 && remainingMinutes > 0) {
        const cursor = dayCursor;
        const candidateSlots = cursor
          ? boundedSlots.filter((slot) => slot.start >= cursor)
          : boundedSlots;
        if (candidateSlots.length === 0) break;

        const desiredDuration = Math.min(remainingMinutes, maxDuration);
        const bestSlot = pickTaskSlot(
          candidateSlots,
          desiredDuration,
          minDuration
        );
        if (!bestSlot) break;

        // Calculate event duration:
        // - Don't exceed remaining minutes needed
        // - Don't exceed max split duration
        // - Don't exceed slot availability
        // - Enforce minimum duration ONLY if we have more than minDuration remaining
        const eventDuration = Math.min(
          remainingMinutes <= minDuration
            ? remainingMinutes
            : Math.max(minDuration, desiredDuration),
          bestSlot.maxAvailable
        );

        // Skip if slot is too small for a meaningful chunk (unless it's the final piece)
        if (eventDuration < minDuration && eventDuration < remainingMinutes) {
          const slotIndex = boundedSlots.indexOf(bestSlot);
          if (slotIndex > -1) boundedSlots.splice(slotIndex, 1);
          continue; // Try next slot instead of breaking
        }

        // Start at the beginning of the slot for back-to-back scheduling
        const startTime = roundTo15Minutes(bestSlot.start);
        const eventEnd = roundTo15Minutes(
          new Date(startTime.getTime() + eventDuration * 60 * 1000)
        );

        if (occupiedSlots.hasConflict(startTime, eventEnd)) {
          const slotIndex = boundedSlots.indexOf(bestSlot);
          if (slotIndex > -1) boundedSlots.splice(slotIndex, 1);
          continue;
        }

        if (hardDeadline && eventEnd > hardDeadline) {
          scheduledAfterDeadline = true;
          const slotIndex = boundedSlots.indexOf(bestSlot);
          if (slotIndex > -1) boundedSlots.splice(slotIndex, 1);
          continue;
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

        const taskStartFormatted = formatTime(startTime, resolvedTimezone);
        const taskEndFormatted = formatTime(eventEnd, resolvedTimezone);
        // Use the actual event start time for the date (in local timezone)
        const taskDateStr = getLocalDateString(startTime, resolvedTimezone);

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
            slotsAvailable: candidateSlots.length,
            slotsConsidered: candidateSlots
              .slice(0, 5)
              .map((s) => formatSlotForDebug(s, resolvedTimezone)),
            slotChosen: formatSlotForDebug(bestSlot, resolvedTimezone),
            reason:
              bestSlot.maxAvailable >= desiredDuration
                ? `Earliest slot that fits the preferred ${desiredDuration}min chunk`
                : `Earliest slot with ${Math.round(bestSlot.maxAvailable)}min available`,
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

        const slotIndex = boundedSlots.indexOf(bestSlot);
        if (slotIndex > -1) {
          boundedSlots.splice(slotIndex, 1);
          const remainingSlotDuration =
            (bestSlot.end.getTime() - eventEnd.getTime()) / 60000;
          if (remainingSlotDuration >= minDuration) {
            boundedSlots.push({
              start: new Date(eventEnd),
              end: bestSlot.end,
              maxAvailable: remainingSlotDuration,
            });
            // Re-sort to maintain chronological order for back-to-back scheduling
            boundedSlots.sort((a, b) => a.start.getTime() - b.start.getTime());
          }
        }
        dayCursor = eventEnd;
      }

      if (bumpedHabitsToRebuild.size > 0) {
        const searchDayKey = getLocalDateString(searchDate, resolvedTimezone);
        for (const habit of sortedHabits) {
          const bumpedHabit = bumpedHabitsToRebuild.get(
            buildHabitOccurrenceKey(habit.id, searchDayKey)
          );
          if (!bumpedHabit) continue;

          scheduleHabitOccurrence(
            bumpedHabit.habit,
            bumpedHabit.occurrence,
            'rebuild'
          );
        }
      }
    }

    if (deadline && deadline <= now && scheduledSoFar > 0) {
      scheduledAfterDeadline = true;
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

  relabelSplitHabitPreviewEvents(habitResults, existingHabitInstanceCounts);
  allPreviewEvents.sort(
    (left, right) =>
      new Date(left.start_at).getTime() - new Date(right.start_at).getTime()
  );

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
