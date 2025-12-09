/**
 * Unified Scheduler
 *
 * Orchestrates scheduling for both habits and tasks in a coordinated manner.
 *
 * Key Principles:
 * 1. Habits are scheduled FIRST (by priority)
 * 2. Tasks are scheduled SECOND (by deadline + priority)
 * 3. Urgent tasks (deadline < 24h) can bump lower-priority habit events
 * 4. Bumped habits are rescheduled to next available slot
 *
 * This ensures habits get priority for building consistency, while
 * urgent tasks still get handled appropriately.
 */

import type {
  HabitDurationConfig,
  TaskSlotConfig,
} from '@tuturuuu/ai/scheduling';
import {
  calculateIdealStartTimeForHabit,
  calculateIdealStartTimeForTask,
  calculateOptimalDuration,
  calculatePriorityScore,
  comparePriority,
  getEffectivePriority,
  getOccurrencesInRange,
  isUrgent,
} from '@tuturuuu/ai/scheduling';
import {
  findBestSlotForHabit as findBestSlotForHabitAI,
  findBestSlotForTask,
  getEffectiveDurationBounds,
  getSlotCharacteristics,
  scoreSlotForHabit,
  scoreSlotForTask,
} from '@tuturuuu/ai/scheduling/duration-optimizer';
import type { SupabaseClient } from '@tuturuuu/supabase';
import type { TaskWithScheduling } from '@tuturuuu/types';
import type { Habit } from '@tuturuuu/types/primitives/Habit';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';

import { fetchHourSettings } from './task-scheduler';

// ============================================================================
// WORKSPACE BREAK SETTINGS
// ============================================================================

export interface WorkspaceBreakSettings {
  break_enabled: boolean;
  break_duration_minutes: number;
  break_interval_minutes: number;
}

/**
 * Fetch workspace-level break settings from workspace_settings table
 */
async function fetchWorkspaceBreakSettings(
  supabase: SupabaseClient,
  wsId: string
): Promise<WorkspaceBreakSettings> {
  const { data, error } = await supabase
    .from('workspace_settings')
    .select('break_enabled, break_duration_minutes, break_interval_minutes')
    .eq('ws_id', wsId)
    .single();

  if (error || !data) {
    // Return defaults if no settings exist
    return {
      break_enabled: false,
      break_duration_minutes: 15,
      break_interval_minutes: 90,
    };
  }

  return {
    break_enabled: data.break_enabled ?? false,
    break_duration_minutes: data.break_duration_minutes ?? 15,
    break_interval_minutes: data.break_interval_minutes ?? 90,
  };
}

// ============================================================================
// TYPES
// ============================================================================

export interface ScheduledEvent {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  type: 'habit' | 'task';
  source_id: string; // habit_id or task_id
  occurrence_date?: string; // For habits
  scheduled_minutes?: number; // For tasks
}

export interface HabitScheduleResult {
  habit: Habit;
  occurrence: Date;
  event: ScheduledEvent;
  duration: number;
}

export interface TaskScheduleResult {
  task: TaskWithScheduling;
  events: ScheduledEvent[];
  scheduledMinutes: number;
  totalMinutesRequired: number;
  remainingMinutes: number;
  warning?: string;
  warningLevel?: 'info' | 'warning' | 'error';
}

export interface BumpedHabitEvent {
  habit: Habit;
  occurrence: Date;
  originalEvent: ScheduledEvent;
}

export type ScheduleResult = {
  habits: {
    events: HabitScheduleResult[];
    warnings: string[];
  };
  tasks: {
    events: TaskScheduleResult[];
    bumpedHabits: BumpedHabitEvent[];
    warnings: string[];
  };
  summary: {
    totalEvents: number;
    habitsScheduled: number;
    tasksScheduled: number;
    bumpedHabits: number;
    breaksScheduled?: number;
  };
  rescheduledHabits: HabitScheduleResult[];
  warnings: string[];
  debugLogs: SchedulingLogEntry[];
};

export interface SchedulingLogEntry {
  type: 'habit' | 'task' | 'info' | 'warning' | 'error';
  message: string;
  details?: any;
  timestamp: number;
  relatedId?: string;
  relatedName?: string;
}

class SchedulingLogger {
  private logs: SchedulingLogEntry[] = [];

  log(
    type: SchedulingLogEntry['type'],
    message: string,
    details?: any,
    relatedId?: string,
    relatedName?: string
  ) {
    this.logs.push({
      type,
      message,
      details,
      timestamp: Date.now(),
      relatedId,
      relatedName,
    });

    // Also log to console for server-side debugging
    if (type === 'error') console.error(`[SmartSchedule] ${message}`, details);
    else if (type === 'warning')
      console.warn(`[SmartSchedule] ${message}`, details);
    else console.log(`[SmartSchedule] ${message}`, details ? details : '');
  }

  warn(
    message: string,
    details?: any,
    relatedId?: string,
    relatedName?: string
  ) {
    this.log('warning', message, details, relatedId, relatedName);
  }

  error(
    message: string,
    details?: any,
    relatedId?: string,
    relatedName?: string
  ) {
    this.log('error', message, details, relatedId, relatedName);
  }

  getLogs() {
    return this.logs;
  }
}

interface OccupiedSlot {
  start: Date;
  end: Date;
  type: 'habit' | 'task' | 'locked';
  id: string;
  priority?: TaskPriority;
}

// ============================================================================
// OCCUPIED SLOT TRACKER
// ============================================================================

/**
 * Tracks occupied time slots for conflict detection
 */
class OccupiedSlotTracker {
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

  add(event: ScheduledEvent, priority?: TaskPriority): void {
    this.slots.push({
      start: new Date(event.start_at),
      end: new Date(event.end_at),
      type: event.type,
      id: event.id,
      priority,
    });
  }

  remove(eventId: string): void {
    this.slots = this.slots.filter((s) => s.id !== eventId);
  }

  /**
   * Check if a time range conflicts with any occupied slot
   */
  hasConflict(start: Date, end: Date): boolean {
    return this.slots.some((slot) => start < slot.end && end > slot.start);
  }

  /**
   * Get all slots that conflict with a time range
   */
  getConflicts(start: Date, end: Date): OccupiedSlot[] {
    return this.slots.filter((slot) => start < slot.end && end > slot.start);
  }

  /**
   * Find habit events that can be bumped by a higher-priority task
   * NEVER bumps ongoing events (start <= now < end)
   */
  findBumpableHabitEvents(
    taskPriority: TaskPriority,
    beforeDate: Date,
    now: Date
  ): OccupiedSlot[] {
    return this.slots.filter((slot) => {
      // Only bump habit events
      if (slot.type !== 'habit') return false;

      // Only bump events before the deadline
      if (slot.start >= beforeDate) return false;

      // NEVER bump ongoing events (user is currently doing this)
      if (isSlotOngoing(slot.start, slot.end, now)) return false;

      // Only bump lower-priority habits
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

/**
 * Check if a time slot is currently ongoing
 * A slot is ongoing if: start <= now < end
 */
function isSlotOngoing(start: Date, end: Date, now: Date): boolean {
  return start <= now && now < end;
}

/**
 * Round a date to the nearest 15-minute boundary
 * This ensures all scheduled events align to 15-minute multiples
 */
function roundTo15Minutes(date: Date): Date {
  const result = new Date(date);
  const minutes = result.getMinutes();
  const roundedMinutes = Math.round(minutes / 15) * 15;
  result.setMinutes(roundedMinutes);
  result.setSeconds(0);
  result.setMilliseconds(0);
  return result;
}

/**
 * Get the local hour for a Date in a specific timezone
 * Falls back to UTC if timezone is not provided or invalid
 */
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

/**
 * Get the local minute for a Date in a specific timezone
 * Falls back to system local time if timezone is not provided or invalid
 */
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
/**
 * Fetch all active habits with auto_schedule enabled
 */
async function fetchSchedulableHabits(
  supabase: SupabaseClient,
  wsId: string
): Promise<Habit[]> {
  const { data, error } = await supabase
    .from('workspace_habits')
    .select('*')
    .eq('ws_id', wsId)
    .eq('is_active', true)
    .eq('auto_schedule', true)
    .eq('is_visible_in_calendar', true)
    .is('deleted_at', null);

  if (error) {
    console.error('Error fetching habits:', error);
    return [];
  }

  return (data as Habit[]) || [];
}

/**
 * Fetch workspace timezone setting
 * Returns null if no timezone is set (auto-detect)
 */
async function fetchWorkspaceTimezone(
  supabase: SupabaseClient,
  wsId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('workspaces')
    .select('timezone')
    .eq('id', wsId)
    .single();

  if (error || !data) {
    return null;
  }

  const tz = data.timezone;
  if (!tz || tz === 'auto') {
    return null;
  }

  return tz;
}

/**
 * Fetch all tasks with auto_schedule enabled and duration set
 */
async function fetchSchedulableTasks(
  supabase: SupabaseClient,
  wsId: string
): Promise<TaskWithScheduling[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      task_lists!inner(
        workspace_boards!inner(ws_id)
      )
    `)
    .eq('task_lists.workspace_boards.ws_id', wsId)
    .eq('auto_schedule', true)
    .gt('total_duration', 0);

  if (error) {
    console.error('Error fetching tasks:', error);
    return [];
  }

  return (data as TaskWithScheduling[]) || [];
}

/**
 * Fetch ALL calendar events in the scheduling window as blocked time
 * These are time slots that shouldn't be double-booked
 */
async function fetchAllBlockedEvents(
  supabase: SupabaseClient,
  wsId: string,
  windowDays: number
): Promise<Array<{ id: string; start_at: string; end_at: string }>> {
  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + windowDays);

  // Fetch ALL existing calendar events in the window
  // These are blocked time slots that shouldn't be double-booked
  const { data, error } = await supabase
    .from('workspace_calendar_events')
    .select('id, start_at, end_at')
    .eq('ws_id', wsId)
    .gt('end_at', now.toISOString())
    .lt('start_at', endDate.toISOString());

  if (error) {
    console.error('Error fetching blocked events:', error);
    return [];
  }

  return data || [];
}

/**
 * Get hour settings with fallback to defaults
 */
type TimeBlock = { startTime: string; endTime: string };
type DaySettings = { enabled: boolean; timeBlocks: TimeBlock[] };
type WeekSettings = Record<string, DaySettings>;

interface HourSettings {
  personalHours: WeekSettings;
  workHours: WeekSettings;
  meetingHours: WeekSettings;
}

/**
 * Get time blocks for a specific day based on calendar_hours type
 */
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
    console.log(
      `[SmartSchedule] getDayTimeBlocks: ${dayName} is disabled for ${calendarHours ?? 'personal_hours'}`
    );
    return [];
  }

  const timeBlocks = daySettings.timeBlocks || [];
  console.log(
    `[SmartSchedule] getDayTimeBlocks for ${dayName} (${calendarHours ?? 'personal_hours'}):`,
    JSON.stringify(timeBlocks)
  );

  return timeBlocks;
}

/**
 * Find available slots in a day for a given duration
 */
function findAvailableSlotsInDay(
  date: Date,
  hourSettings: HourSettings,
  calendarHours: 'personal_hours' | 'work_hours' | 'meeting_hours' | null,
  occupiedSlots: OccupiedSlotTracker,
  minDuration: number
): Array<{ start: Date; end: Date; maxAvailable: number }> {
  const dayOfWeek = date.getDay();
  const timeBlocks = getDayTimeBlocks(hourSettings, calendarHours, dayOfWeek);
  const slots: Array<{ start: Date; end: Date; maxAvailable: number }> = [];

  for (const block of timeBlocks) {
    // Skip blocks with empty start/end times (prevents midnight scheduling bug)
    if (!block.startTime || !block.endTime) continue;

    const [startHour, startMin] = block.startTime.split(':').map(Number);
    const [endHour, endMin] = block.endTime.split(':').map(Number);

    const blockStart = new Date(date);
    blockStart.setHours(startHour || 0, startMin || 0, 0, 0);

    const blockEnd = new Date(date);
    blockEnd.setHours(endHour || 23, endMin || 59, 0, 0);

    // Find gaps in this block not occupied by other events
    const conflicts = occupiedSlots.getConflicts(blockStart, blockEnd);

    if (conflicts.length === 0) {
      // Entire block is available
      const maxAvailable = (blockEnd.getTime() - blockStart.getTime()) / 60000;
      if (maxAvailable >= minDuration) {
        slots.push({ start: blockStart, end: blockEnd, maxAvailable });
      }
    } else {
      // Find gaps between conflicts
      conflicts.sort((a, b) => a.start.getTime() - b.start.getTime());

      // Gap before first conflict
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

      // Gaps between conflicts
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

      // Gap after last conflict
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

  // Debug: log summary of found slots
  if (slots.length > 0) {
    console.log(
      `[SmartSchedule] findAvailableSlotsInDay found ${slots.length} slot(s) for ${date.toISOString().split('T')[0]}:`,
      slots.map(
        (s) =>
          `${s.start.toTimeString().slice(0, 5)}-${s.end.toTimeString().slice(0, 5)} (${s.maxAvailable}m)`
      )
    );
  }

  return slots;
}

/**
 * Convert Habit to HabitDurationConfig for the AI scheduling package
 */
function convertHabitToConfig(habit: Habit): HabitDurationConfig {
  return {
    duration_minutes: habit.duration_minutes,
    min_duration_minutes: habit.min_duration_minutes,
    max_duration_minutes: habit.max_duration_minutes,
    ideal_time: habit.ideal_time,
    time_preference: habit.time_preference,
  };
}

/**
 * Filter out slots that are in the past and adjust partially-past slots
 * Also sorts slots by start time to ensure earliest slots are selected first
 */
function filterFutureSlots(
  slots: Array<{ start: Date; end: Date; maxAvailable: number }>,
  now: Date
): Array<{ start: Date; end: Date; maxAvailable: number }> {
  // Round 'now' up to next 15-minute boundary for scheduling purposes
  const roundedNow = roundTo15Minutes(new Date(now.getTime() + 14 * 60 * 1000));

  const result = slots
    .filter((slot) => slot.end > roundedNow)
    .map((slot) => {
      // If slot has already started but not ended, adjust start to roundedNow
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
    .filter((slot) => slot.maxAvailable > 0); // Remove slots that became too small

  // Sort by start time to ensure earliest slots are selected first
  result.sort((a, b) => a.start.getTime() - b.start.getTime());

  return result;
}

/**
 * Filter and sort slots by habit time preference
 * This ensures habits with specific time preferences only get scheduled in appropriate slots
 * Returns slots sorted by proximity to ideal time (closest first)
 */
function filterSlotsByTimePreference(
  slots: Array<{ start: Date; end: Date; maxAvailable: number }>,
  idealTime: string | null | undefined,
  timePreference: string | null | undefined,
  duration: number,
  timezone: string | null | undefined
): Array<{ start: Date; end: Date; maxAvailable: number }> {
  if (!idealTime && !timePreference) {
    return slots; // No preference, return all slots
  }

  const idealHour = idealTime
    ? parseInt(idealTime.split(':')[0] || '0', 10)
    : null;
  const idealMin = idealTime
    ? parseInt(idealTime.split(':')[1] || '0', 10)
    : null;

  // Helper to calculate how far a slot's start hour is from ideal time
  const getDistanceFromIdealTime = (slot: { start: Date; end: Date }) => {
    const slotHour = getLocalHour(slot.start, timezone);
    const slotMin = getLocalMinute(slot.start, timezone);
    const slotTimeInMinutes = slotHour * 60 + slotMin;

    if (idealHour !== null) {
      const idealTimeInMinutes = idealHour * 60 + (idealMin ?? 0);
      // Calculate circular distance (handles midnight wraparound)
      const diff = Math.abs(slotTimeInMinutes - idealTimeInMinutes);
      return Math.min(diff, 24 * 60 - diff);
    }

    // For time_preference, calculate distance from preference range center
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

  // If habit has an ideal_time, filter to slots that can accommodate it
  if (idealTime && idealHour !== null) {
    // First try: find slots where the ideal time actually falls within the slot
    const slotsContainingIdealTime = slots.filter((slot) => {
      const slotStartHour = getLocalHour(slot.start, timezone);
      const slotEndHour = getLocalHour(slot.end, timezone);
      const slotStartMin = getLocalMinute(slot.start, timezone);
      const slotEndMin = getLocalMinute(slot.end, timezone);

      const slotStartInMinutes = slotStartHour * 60 + slotStartMin;
      const slotEndInMinutes = slotEndHour * 60 + slotEndMin;
      const idealInMinutes = idealHour * 60 + (idealMin ?? 0);

      // Handle slots that don't cross midnight
      if (slotEndInMinutes > slotStartInMinutes) {
        return (
          idealInMinutes >= slotStartInMinutes &&
          idealInMinutes + duration <= slotEndInMinutes
        );
      }
      // Handle slots that cross midnight (e.g., 10pm - 2am)
      return (
        idealInMinutes >= slotStartInMinutes ||
        idealInMinutes + duration <= slotEndInMinutes
      );
    });

    if (slotsContainingIdealTime.length > 0) {
      // Sort by distance from ideal time
      return slotsContainingIdealTime.sort(
        (a, b) => getDistanceFromIdealTime(a) - getDistanceFromIdealTime(b)
      );
    }

    // Second try: find slots in a similar time range (within 3 hours)
    const slotsNearIdealTime = slots.filter((slot) => {
      const slotHour = getLocalHour(slot.start, timezone);
      // Check if slot is within 3 hours of ideal time (handles midnight wraparound)
      const hourDiff = Math.abs(slotHour - idealHour);
      const wrappedDiff = 24 - hourDiff;
      return Math.min(hourDiff, wrappedDiff) <= 3;
    });

    if (slotsNearIdealTime.length > 0) {
      return slotsNearIdealTime.sort(
        (a, b) => getDistanceFromIdealTime(a) - getDistanceFromIdealTime(b)
      );
    }
  }

  // If habit has a time_preference (morning/afternoon/evening/night)
  if (timePreference) {
    const preferenceRanges: Record<string, { start: number; end: number }> = {
      morning: { start: 5, end: 12 }, // 5am - 12pm
      afternoon: { start: 12, end: 17 }, // 12pm - 5pm
      evening: { start: 17, end: 21 }, // 5pm - 9pm
      night: { start: 21, end: 24 }, // 9pm - midnight
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

  // Fallback: return all slots sorted by distance from ideal time
  if (idealHour !== null || timePreference) {
    return [...slots].sort(
      (a, b) => getDistanceFromIdealTime(a) - getDistanceFromIdealTime(b)
    );
  }

  return slots;
}

/**
 * Get color for calendar event based on hour type
 */
function getColorForHourType(hourType?: string | null): string {
  if (hourType === 'work_hours') return 'BLUE';
  if (hourType === 'meeting_hours') return 'CYAN';
  return 'GREEN';
}

// ============================================================================
// HABIT SCHEDULING
// ============================================================================

/**
 * Schedule habits phase (Phase 1)
 * Schedules habits in priority order
 */
async function scheduleHabitsPhase(
  supabase: SupabaseClient,
  wsId: string,
  habits: Habit[],
  hourSettings: HourSettings,
  occupiedSlots: OccupiedSlotTracker,
  windowDays: number,
  logger: SchedulingLogger,
  timezone: string | null
): Promise<{
  events: HabitScheduleResult[];
  habitEventMap: Map<
    string,
    { habit: Habit; occurrence: Date; event: ScheduledEvent }
  >;
  warnings: string[];
}> {
  const results: HabitScheduleResult[] = [];
  const habitEventMap = new Map<
    string,
    { habit: Habit; occurrence: Date; event: ScheduledEvent }
  >();
  const warnings: string[] = [];

  // Sort habits by: has_ideal_time DESC, has_time_preference DESC, priority DESC
  // This ensures habits with specific time preferences get scheduled first
  const sortedHabits = [...habits].sort((a, b) => {
    // First prioritize habits with ideal_time
    const aHasIdealTime = !!a.ideal_time;
    const bHasIdealTime = !!b.ideal_time;
    if (aHasIdealTime && !bHasIdealTime) return -1;
    if (bHasIdealTime && !aHasIdealTime) return 1;

    // Then prioritize habits with time_preference
    const aHasTimePref = !!a.time_preference;
    const bHasTimePref = !!b.time_preference;
    if (aHasTimePref && !bHasTimePref) return -1;
    if (bHasTimePref && !aHasTimePref) return 1;

    // Finally sort by priority score (highest first)
    const aScore = calculatePriorityScore({ priority: a.priority });
    const bScore = calculatePriorityScore({ priority: b.priority });
    return bScore - aScore;
  });

  const now = new Date();
  const rangeEnd = new Date(now);
  rangeEnd.setDate(rangeEnd.getDate() + windowDays);

  for (const habit of sortedHabits) {
    logger.log(
      'habit',
      `Scheduling habit: ${habit.name}`,
      { habit },
      habit.id,
      habit.name
    );
    // Get occurrences in the scheduling window
    const occurrences = getOccurrencesInRange(habit, now, rangeEnd);

    // Get existing scheduled events for this habit
    const { data: existingLinks } = await supabase
      .from('habit_calendar_events')
      .select('occurrence_date, event_id')
      .eq('habit_id', habit.id);

    const scheduledDates = new Set(
      existingLinks?.map((l) => l.occurrence_date) || []
    );

    for (const occurrence of occurrences) {
      const occurrenceDate = occurrence.toISOString().split('T')[0];

      // Skip already scheduled occurrences
      if (scheduledDates.has(occurrenceDate)) {
        logger.log(
          'info',
          `Habit "${habit.name}" on ${occurrenceDate} already scheduled, skipping.`,
          null,
          habit.id,
          habit.name
        );
        continue;
      }

      // Get duration bounds
      const { min: minDuration } = getEffectiveDurationBounds({
        duration_minutes: habit.duration_minutes,
        min_duration_minutes: habit.min_duration_minutes,
        max_duration_minutes: habit.max_duration_minutes,
      });

      // Find available slots
      const slots = findAvailableSlotsInDay(
        occurrence,
        hourSettings,
        habit.calendar_hours,
        occupiedSlots,
        minDuration || 15
      );

      if (slots.length === 0) {
        logger.log(
          'warning',
          `No slots found for ${habit.name} on ${occurrenceDate}`,
          {
            calendar_hours: habit.calendar_hours,
            minDuration,
            dayOfWeek: occurrence.getDay(),
          },
          habit.id,
          habit.name
        );
        warnings.push(
          `No available slot for habit "${habit.name}" on ${occurrenceDate}`
        );
        continue;
      }

      // Filter out past slots
      const futureSlots = filterFutureSlots(slots, now);

      // Filter slots by habit's time preference (ideal_time or time_preference)
      // This ensures habits get scheduled at appropriate times, not just any available slot
      const preferredSlots = filterSlotsByTimePreference(
        futureSlots,
        habit.ideal_time,
        habit.time_preference,
        habit.duration_minutes || minDuration || 30,
        timezone
      );

      logger.log(
        'info',
        `Habit "${habit.name}" slot filtering: ${futureSlots.length} future slots -> ${preferredSlots.length} preferred slots`,
        {
          ideal_time: habit.ideal_time,
          time_preference: habit.time_preference,
          futureSlots: futureSlots.map((s) => ({
            start: s.start.toISOString(),
            hour: getLocalHour(s.start, timezone),
          })),
          preferredSlots: preferredSlots.map((s) => ({
            start: s.start.toISOString(),
            hour: getLocalHour(s.start, timezone),
          })),
        },
        habit.id,
        habit.name
      );

      const habitConfig = convertHabitToConfig(habit);

      // For habits with time preferences, use the first slot from preferredSlots
      // (already sorted by proximity to ideal time)
      // For habits without preferences, use AI scoring
      let bestSlot;
      if (habit.ideal_time || habit.time_preference) {
        // preferredSlots is already sorted by proximity to ideal time
        // Find the first slot that meets minimum duration
        bestSlot = preferredSlots.find(
          (slot) => slot.maxAvailable >= (minDuration || 15)
        );
      } else {
        bestSlot = findBestSlotForHabitAI(habitConfig, preferredSlots);
      }

      if (!bestSlot) {
        logger.log(
          'warning',
          `No suitable slot found for ${habit.name} on ${occurrenceDate} (min duration not met)`,
          { slotsCount: preferredSlots.length },
          habit.id,
          habit.name
        );
        warnings.push(
          `No available slot for habit "${habit.name}" on ${occurrenceDate}`
        );
        continue;
      }

      // Check if ideal time was possible but missed
      if (habit.ideal_time) {
        const idealTimePossible = preferredSlots.some((s) => {
          // Simple check if ideal time string is within slot range
          // This is a rough check for logging purposes
          const [idealHour, idealMin] = habit
            .ideal_time!.split(':')
            .map(Number);
          const idealTime = new Date(s.start);
          idealTime.setHours(idealHour ?? 0, idealMin ?? 0, 0, 0);
          return idealTime >= s.start && idealTime <= s.end;
        });
        if (!idealTimePossible) {
          logger.log(
            'warning',
            `Ideal time ${habit.ideal_time} not possible in available slots for ${habit.name} on ${occurrenceDate}`,
            { slots: preferredSlots },
            habit.id,
            habit.name
          );
        }
      }

      // Debug logging for workout timing issue
      if (habit.name.toLowerCase().includes('workout')) {
        logger.log(
          'info',
          `Scheduling workout on ${occurrenceDate}`,
          null,
          habit.id,
          habit.name
        );
        logger.log(
          'info',
          `Best slot: ${bestSlot.start.toISOString()} - ${bestSlot.end.toISOString()} (${bestSlot.maxAvailable}m)`,
          null,
          habit.id,
          habit.name
        );
        logger.log(
          'info',
          `Habit preferences:`,
          convertHabitToConfig(habit),
          habit.id,
          habit.name
        );
        logger.log(
          'info',
          `Ideal time: ${habit.ideal_time}, Preference: ${habit.time_preference}`,
          null,
          habit.id,
          habit.name
        );
      }

      // Calculate optimal duration
      const characteristics = getSlotCharacteristics(habitConfig, {
        start: bestSlot.start,
        end: bestSlot.end,
        maxAvailable: bestSlot.maxAvailable,
      });

      const duration = calculateOptimalDuration(
        habit,
        {
          start: bestSlot.start,
          end: bestSlot.end,
          maxAvailable: bestSlot.maxAvailable,
        },
        characteristics
      );

      if (duration === 0) {
        logger.log(
          'warning',
          `Cannot fit habit "${habit.name}" on ${occurrenceDate} (duration 0)`,
          null,
          habit.id,
          habit.name
        );
        warnings.push(`Cannot fit habit "${habit.name}" on ${occurrenceDate}`);
        continue;
      }

      logger.log(
        'habit',
        `Selected slot for ${habit.name}`,
        {
          slot: bestSlot,
          characteristics,
          score: scoreSlotForHabit(habitConfig, bestSlot),
        },
        habit.id,
        habit.name
      );

      // Calculate ideal start time within the slot based on habit preferences
      // This ensures habits don't all stack at the beginning of available blocks
      // Pass `now` to ensure we don't schedule before current time
      const rawIdealStartTime = calculateIdealStartTimeForHabit(
        convertHabitToConfig(habit),
        bestSlot,
        duration,
        now
      );

      // Round to 15-minute boundaries for clean scheduling
      const idealStartTime = roundTo15Minutes(rawIdealStartTime);

      // Calculate event end time and round it too
      const eventEnd = roundTo15Minutes(
        new Date(idealStartTime.getTime() + duration * 60 * 1000)
      );

      // Safety check: Verify no conflict before scheduling
      if (occupiedSlots.hasConflict(idealStartTime, eventEnd)) {
        logger.warn(
          `Conflict detected for habit "${habit.name}" at ${idealStartTime.toISOString()}-${eventEnd.toISOString()}, skipping`,
          null,
          habit.id,
          habit.name
        );
        warnings.push(
          `Could not schedule habit "${habit.name}" on ${occurrenceDate} due to conflict`
        );
        continue;
      }

      // Create calendar event
      const { data: event, error: eventError } = await supabase
        .from('workspace_calendar_events')
        .insert({
          ws_id: wsId,
          title: habit.name,
          description: habit.description || '',
          start_at: idealStartTime.toISOString(),
          end_at: eventEnd.toISOString(),
          color: habit.color || getColorForHourType(habit.calendar_hours),
        })
        .select()
        .single();

      if (eventError || !event) {
        logger.error(
          'Error creating habit event:',
          eventError,
          habit.id,
          habit.name
        );
        continue;
      }

      // Create junction table entry
      const { error: linkError } = await supabase
        .from('habit_calendar_events')
        .insert({
          habit_id: habit.id,
          event_id: event.id,
          occurrence_date: occurrenceDate,
          completed: false,
        });

      if (linkError) {
        logger.error(
          'Error linking habit to event:',
          linkError,
          habit.id,
          habit.name
        );
        await supabase
          .from('workspace_calendar_events')
          .delete()
          .eq('id', event.id);
        continue;
      }

      const scheduledEvent: ScheduledEvent = {
        id: event.id,
        title: habit.name,
        start_at: idealStartTime.toISOString(),
        end_at: eventEnd.toISOString(),
        type: 'habit',
        source_id: habit.id,
        occurrence_date: occurrenceDate || '',
      };

      logger.log(
        'habit',
        `Successfully scheduled habit "${habit.name}" from ${idealStartTime.toISOString()} to ${eventEnd.toISOString()}`,
        { event: scheduledEvent },
        habit.id,
        habit.name
      );

      // Track the occupied slot
      occupiedSlots.add(scheduledEvent, habit.priority || 'normal');

      // Store for potential bumping later
      habitEventMap.set(event.id, { habit, occurrence, event: scheduledEvent });

      results.push({
        habit,
        occurrence,
        event: scheduledEvent,
        duration,
      });
    }
  }

  return { events: results, habitEventMap, warnings };
}

// ============================================================================
// TASK SCHEDULING
// ============================================================================

/**
 * Schedule tasks phase (Phase 2)
 * Schedules tasks by deadline + priority
 * May bump lower-priority habit events for urgent tasks
 */
async function scheduleTasksPhase(
  supabase: SupabaseClient,
  wsId: string,
  tasks: TaskWithScheduling[],
  hourSettings: HourSettings,
  occupiedSlots: OccupiedSlotTracker,
  habitEventMap: Map<
    string,
    { habit: Habit; occurrence: Date; event: ScheduledEvent }
  >,
  windowDays: number,
  logger: SchedulingLogger
): Promise<{
  events: TaskScheduleResult[];
  bumpedHabitEvents: BumpedHabitEvent[];
  warnings: string[];
}> {
  const results: TaskScheduleResult[] = [];
  const bumpedHabitEvents: BumpedHabitEvent[] = [];
  const warnings: string[] = [];

  // Sort tasks: earliest deadline first, then by priority, then by created date
  const sortedTasks = [...tasks].sort((a, b) => {
    // Deadline comparison (nulls last)
    if (a.end_date && b.end_date) {
      const deadlineDiff =
        new Date(a.end_date).getTime() - new Date(b.end_date).getTime();
      if (deadlineDiff !== 0) return deadlineDiff;
    } else if (a.end_date) return -1;
    else if (b.end_date) return 1;

    // Priority comparison
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

    // Creation date (older first)
    if (a.created_at && b.created_at) {
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }

    return 0;
  });

  const now = new Date();

  for (const task of sortedTasks) {
    logger.log(
      'task',
      `Scheduling task: ${task.name}`,
      { task },
      task.id,
      task.name
    );
    const totalMinutes = (task.total_duration ?? 0) * 60;
    const scheduledMinutes = task.scheduled_minutes ?? 0;
    let remainingMinutes = totalMinutes - scheduledMinutes;

    if (remainingMinutes <= 0) {
      logger.log(
        'info',
        `Task "${task.name}" already fully scheduled or has no duration.`,
        null,
        task.id,
        task.name
      );
      results.push({
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
    const taskIsUrgent = isUrgent({
      priority: task.priority,
      end_date: task.end_date,
    });
    const taskEvents: ScheduledEvent[] = [];
    let scheduledSoFar = 0;
    let scheduledAfterDeadline = false;

    const minDuration = task.min_split_duration_minutes ?? 30;
    const maxDuration = task.max_split_duration_minutes ?? 120;

    // Search for slots across multiple days
    for (
      let dayOffset = 0;
      dayOffset < windowDays && remainingMinutes > 0;
      dayOffset++
    ) {
      const searchDate = new Date(now);
      searchDate.setDate(searchDate.getDate() + dayOffset);
      searchDate.setHours(0, 0, 0, 0);

      // Respect task start date
      if (task.start_date && searchDate < new Date(task.start_date)) {
        logger.log(
          'info',
          `Skipping ${searchDate.toISOString().split('T')[0]} for task "${task.name}" due to start_date constraint.`,
          null,
          task.id,
          task.name
        );
        continue;
      }

      // Find available slots for this day
      let slots = findAvailableSlotsInDay(
        searchDate,
        hourSettings,
        task.calendar_hours,
        occupiedSlots,
        minDuration
      );

      // If urgent and no slots, try to bump lower-priority habits
      if (taskIsUrgent && slots.length === 0 && task.end_date) {
        logger.log(
          'info',
          `No slots for urgent task ${task.name} on ${searchDate.toISOString().split('T')[0]}, attempting to bump habits`,
          null,
          task.id,
          task.name
        );
        const deadline = new Date(task.end_date);
        const bumpable = occupiedSlots.findBumpableHabitEvents(
          taskPriority,
          deadline,
          now
        );

        // Sort bumpable habits: prefer bumping habits WITHOUT time preferences
        // This protects habits that have specific timing requirements
        bumpable.sort((a, b) => {
          const aHabitInfo = habitEventMap.get(a.id);
          const bHabitInfo = habitEventMap.get(b.id);
          const aHasPreference =
            aHabitInfo?.habit.ideal_time || aHabitInfo?.habit.time_preference;
          const bHasPreference =
            bHabitInfo?.habit.ideal_time || bHabitInfo?.habit.time_preference;
          // Bump habits WITHOUT preference first
          if (!aHasPreference && bHasPreference) return -1;
          if (aHasPreference && !bHasPreference) return 1;
          return 0;
        });

        for (const bumpableSlot of bumpable) {
          const habitInfo = habitEventMap.get(bumpableSlot.id);
          if (habitInfo) {
            logger.log(
              'info',
              `Bumping habit "${habitInfo.habit.name}" for urgent task "${task.name}"`,
              { bumpedSlot: bumpableSlot },
              task.id,
              task.name
            );
            // Remove the bumped event
            occupiedSlots.remove(bumpableSlot.id);

            // Also delete from DB to prevent ghosts
            // Delete link first to avoid FK constraints
            const { error: linkDeleteError } = await supabase
              .from('habit_calendar_events')
              .delete()
              .eq('event_id', bumpableSlot.id);

            if (linkDeleteError) {
              logger.error(
                'Error deleting bumped habit link:',
                linkDeleteError,
                task.id,
                task.name
              );
            }

            const { error: eventDeleteError } = await supabase
              .from('workspace_calendar_events')
              .delete()
              .eq('id', bumpableSlot.id);

            if (eventDeleteError) {
              logger.error(
                'Error deleting bumped habit event:',
                eventDeleteError,
                task.id,
                task.name
              );
            } else {
              logger.log(
                'info',
                `Successfully deleted bumped habit event ${bumpableSlot.id}`,
                null,
                task.id,
                task.name
              );
            }

            // Track bumped habit for rescheduling
            bumpedHabitEvents.push({
              habit: habitInfo.habit,
              occurrence: habitInfo.occurrence,
              originalEvent: habitInfo.event,
            });

            warnings.push(
              `Bumped habit "${habitInfo.habit.name}" for urgent task "${task.name}"`
            );
          }
        }

        // Retry finding slots after bumping
        slots = findAvailableSlotsInDay(
          searchDate,
          hourSettings,
          task.calendar_hours,
          occupiedSlots,
          minDuration
        );
      }

      // Filter to future slots only (can't schedule in the past)
      const futureSlots = filterFutureSlots(slots, now);

      if (futureSlots.length === 0) {
        logger.log(
          'warning',
          `No future slots found for ${task.name} on ${searchDate.toISOString().split('T')[0]}`,
          null,
          task.id,
          task.name
        );
        continue;
      }

      // Sort slots by start time (earliest first) to reduce gaps
      // This ensures tasks are scheduled contiguously
      futureSlots.sort((a, b) => a.start.getTime() - b.start.getTime());

      // Create task config for smart slot selection
      const taskConfig: TaskSlotConfig = {
        deadline: task.end_date ? new Date(task.end_date) : null,
        priority: taskPriority,
        preferredTimeOfDay: null, // Can add to task model later
      };

      // Use smart slot selection instead of sequential iteration
      // This ensures tasks don't all stack at 7am
      while (remainingMinutes > 0 && futureSlots.length > 0) {
        // For tasks without tight deadlines, prefer the earliest available slot to reduce gaps
        // For urgent tasks, let the scoring function decide based on deadline proximity
        let bestSlot;
        if (!taskIsUrgent && futureSlots.length > 0) {
          // Prefer earliest slot for non-urgent tasks to fill gaps
          bestSlot = futureSlots.find(
            (slot) => slot.maxAvailable >= minDuration
          );
        }

        // Fall back to smart slot selection if no suitable early slot found
        if (!bestSlot) {
          bestSlot = findBestSlotForTask(
            taskConfig,
            futureSlots,
            minDuration,
            now
          );
        }

        if (!bestSlot) {
          logger.log(
            'warning',
            `No suitable slot found for ${task.name} (min duration not met) on ${searchDate.toISOString().split('T')[0]}`,
            { slotsCount: futureSlots.length },
            task.id,
            task.name
          );
          break;
        }

        logger.log(
          'task',
          `Selected slot for ${task.name}`,
          {
            slot: bestSlot,
            score: scoreSlotForTask(taskConfig, bestSlot, now),
          },
          task.id,
          task.name
        );

        // Calculate duration for this event
        let eventDuration = Math.min(
          remainingMinutes,
          maxDuration,
          bestSlot.maxAvailable
        );
        eventDuration = Math.max(
          eventDuration,
          Math.min(minDuration, remainingMinutes)
        );

        if (eventDuration < minDuration && remainingMinutes >= minDuration) {
          logger.log(
            'info',
            `Best slot for ${task.name} is too small (${eventDuration}m) for min duration (${minDuration}m), removing slot.`,
            { bestSlot },
            task.id,
            task.name
          );
          // Remove this slot as it's too small
          const slotIndex = futureSlots.indexOf(bestSlot);
          if (slotIndex > -1) futureSlots.splice(slotIndex, 1);
          continue;
        }

        // Calculate ideal start time within the slot
        // For non-urgent tasks, prefer the start of the slot to reduce gaps
        // For urgent tasks, use smart placement based on deadline proximity
        let rawIdealStartTime: Date;
        if (!taskIsUrgent) {
          // Non-urgent: start at beginning of slot to fill gaps
          rawIdealStartTime = new Date(
            Math.max(bestSlot.start.getTime(), now.getTime())
          );
        } else {
          // Urgent: use smart placement based on deadline
          rawIdealStartTime = calculateIdealStartTimeForTask(
            taskConfig,
            bestSlot,
            eventDuration,
            now
          );
        }

        // Round to 15-minute boundaries for clean scheduling
        const idealStartTime = roundTo15Minutes(rawIdealStartTime);

        // Calculate event end time and round it too
        const eventEnd = roundTo15Minutes(
          new Date(idealStartTime.getTime() + eventDuration * 60 * 1000)
        );

        // Check if scheduled after deadline
        if (task.end_date && eventEnd > new Date(task.end_date)) {
          scheduledAfterDeadline = true;
          logger.log(
            'warning',
            `Task "${task.name}" event scheduled after deadline.`,
            {
              eventStart: idealStartTime,
              eventEnd: eventEnd,
              deadline: task.end_date,
            },
            task.id,
            task.name
          );
        }

        // Safety check: Verify no conflict before scheduling
        if (occupiedSlots.hasConflict(idealStartTime, eventEnd)) {
          logger.warn(
            `Conflict detected for task "${task.name}" at ${idealStartTime.toISOString()}-${eventEnd.toISOString()}, skipping slot`,
            null,
            task.id,
            task.name
          );
          const slotIndex = futureSlots.indexOf(bestSlot);
          if (slotIndex > -1) futureSlots.splice(slotIndex, 1);
          continue;
        }

        // Determine event title
        const totalParts = Math.ceil(totalMinutes / maxDuration);
        const partNumber = taskEvents.length + 1;

        logger.log(
          'info',
          `Task "${task.name}": Part ${partNumber}/${totalParts} (Total: ${totalMinutes}m, Max: ${maxDuration}m)`,
          null,
          task.id,
          task.name
        );

        const eventTitle =
          totalParts > 1
            ? `${task.name || 'Task'} (${partNumber}/${totalParts})`
            : task.name || 'Task';

        // Create calendar event
        const { data: event, error: eventError } = await supabase
          .from('workspace_calendar_events')
          .insert({
            ws_id: wsId,
            title: eventTitle,
            description: task.description || '',
            start_at: idealStartTime.toISOString(),
            end_at: eventEnd.toISOString(),
            color: getColorForHourType(task.calendar_hours),
          })
          .select()
          .single();

        if (eventError || !event) {
          logger.error(
            'Error creating task event:',
            eventError,
            task.id,
            task.name
          );
          // Remove this slot to avoid infinite loop
          const slotIndex = futureSlots.indexOf(bestSlot);
          if (slotIndex > -1) futureSlots.splice(slotIndex, 1);
          continue;
        }

        // Create junction table entry
        try {
          await supabase.from('task_calendar_events').insert({
            task_id: task.id,
            event_id: event.id,
            scheduled_minutes: eventDuration,
            completed: false,
          });
        } catch (e) {
          logger.error('Error linking task to event:', e, task.id, task.name);
        }

        const scheduledEvent: ScheduledEvent = {
          id: event.id,
          title: eventTitle,
          start_at: idealStartTime.toISOString(),
          end_at: eventEnd.toISOString(),
          type: 'task',
          source_id: task.id,
          scheduled_minutes: eventDuration,
        };

        logger.log(
          'task',
          `Successfully scheduled task "${task.name}" part ${partNumber} from ${idealStartTime.toISOString()} to ${eventEnd.toISOString()}`,
          { event: scheduledEvent },
          task.id,
          task.name
        );

        occupiedSlots.add(scheduledEvent, taskPriority);
        taskEvents.push(scheduledEvent);
        scheduledSoFar += eventDuration;
        remainingMinutes -= eventDuration;

        // Update futureSlots to reflect the used portion
        // Remove the used slot and add back any remaining time after the scheduled event
        const slotIndex = futureSlots.indexOf(bestSlot);
        if (slotIndex > -1) {
          futureSlots.splice(slotIndex, 1);

          // If there's remaining time in the slot after this event, add it back
          const remainingSlotStart = eventEnd;
          const remainingSlotDuration =
            (bestSlot.end.getTime() - remainingSlotStart.getTime()) / 60000;

          if (remainingSlotDuration >= minDuration) {
            futureSlots.push({
              start: new Date(remainingSlotStart),
              end: bestSlot.end,
              maxAvailable: remainingSlotDuration,
            });
          }
        }
      }
    }

    const finalScheduledMinutes = scheduledMinutes + scheduledSoFar;
    const finalRemainingMinutes = totalMinutes - finalScheduledMinutes;

    // Determine warning level based on scheduling outcome
    let warning: string | undefined;
    let warningLevel: 'info' | 'warning' | 'error' | undefined;

    if (scheduledSoFar === 0 && totalMinutes > scheduledMinutes) {
      // Could not schedule any new time
      warning = `Could not schedule any time for task - no available slots found`;
      warningLevel = 'error';
    } else if (finalRemainingMinutes > 0) {
      // Partially scheduled
      warning = `Partially scheduled: ${finalRemainingMinutes} minutes remaining (${Math.round((finalScheduledMinutes / totalMinutes) * 100)}% complete)`;
      warningLevel = 'warning';
    } else if (scheduledAfterDeadline) {
      // Fully scheduled but some after deadline
      warning = 'Some events scheduled after deadline';
      warningLevel = 'info';
    }

    results.push({
      task,
      events: taskEvents,
      scheduledMinutes: finalScheduledMinutes,
      totalMinutesRequired: totalMinutes,
      remainingMinutes: finalRemainingMinutes,
      warning,
      warningLevel,
    });

    if (warningLevel === 'error' || warningLevel === 'warning') {
      warnings.push(`Task "${task.name}": ${warning}`);
    } else if (scheduledAfterDeadline) {
      warnings.push(
        `Task "${task.name}" has events scheduled after its deadline`
      );
    }
  }

  return { events: results, bumpedHabitEvents, warnings };
}

// ============================================================================
// RESCHEDULE BUMPED HABITS
// ============================================================================

/**
 * Reschedule habits that were bumped by urgent tasks
 */
async function rescheduleBumpedHabits(
  supabase: SupabaseClient,
  wsId: string,
  bumpedEvents: BumpedHabitEvent[],
  hourSettings: HourSettings,
  occupiedSlots: OccupiedSlotTracker,
  logger: SchedulingLogger,
  timezone: string | null
): Promise<HabitScheduleResult[]> {
  const results: HabitScheduleResult[] = [];
  const now = new Date();

  if (bumpedEvents.length > 0) {
    logger.log(
      'info',
      `Attempting to reschedule ${bumpedEvents.length} bumped habits.`,
      { bumpedEventsCount: bumpedEvents.length }
    );
  }

  for (const bumped of bumpedEvents) {
    const { habit, occurrence, originalEvent } = bumped;
    logger.log(
      'habit',
      `Rescheduling bumped habit: ${habit.name} (original event: ${originalEvent.id})`,
      { habit, originalEvent },
      habit.id,
      habit.name
    );

    const { min: minDuration } = getEffectiveDurationBounds({
      duration_minutes: habit.duration_minutes,
      min_duration_minutes: habit.min_duration_minutes,
      max_duration_minutes: habit.max_duration_minutes,
    });

    // Collect slots from occurrence day and nearby days to find best preference match
    const allSlots: Array<{ start: Date; end: Date; maxAvailable: number }> =
      [];

    for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
      const searchDay = new Date(occurrence);
      searchDay.setDate(searchDay.getDate() + dayOffset);

      const daySlots = findAvailableSlotsInDay(
        searchDay,
        hourSettings,
        habit.calendar_hours,
        occupiedSlots,
        minDuration
      );

      allSlots.push(...daySlots);
    }

    // Filter out past slots
    const futureSlots = filterFutureSlots(allSlots, now);

    // Filter slots by habit's time preference for rescheduling
    const preferredSlots = filterSlotsByTimePreference(
      futureSlots,
      habit.ideal_time,
      habit.time_preference,
      habit.duration_minutes || minDuration || 30,
      timezone
    );

    const habitConfig = convertHabitToConfig(habit);

    // For habits with time preferences, use the first slot from preferredSlots
    // (already sorted by proximity to ideal time)
    let bestSlot;
    if (habit.ideal_time || habit.time_preference) {
      bestSlot = preferredSlots.find(
        (slot) => slot.maxAvailable >= (minDuration || 15)
      );
    } else {
      bestSlot = findBestSlotForHabitAI(habitConfig, preferredSlots);
    }

    if (!bestSlot) {
      logger.warn(
        `Could not reschedule bumped habit "${habit.name}" - no suitable slot found.`,
        { preferredSlotsCount: preferredSlots.length },
        habit.id,
        habit.name
      );
      continue;
    }

    const characteristics = getSlotCharacteristics(habitConfig, {
      start: bestSlot.start,
      end: bestSlot.end,
      maxAvailable: bestSlot.maxAvailable,
    });

    const duration = calculateOptimalDuration(
      habit,
      {
        start: bestSlot.start,
        end: bestSlot.end,
        maxAvailable: bestSlot.maxAvailable,
      },
      characteristics
    );

    if (duration === 0) {
      logger.warn(
        `Could not reschedule bumped habit "${habit.name}" - duration calculated as 0.`,
        null,
        habit.id,
        habit.name
      );
      continue;
    }

    // Calculate ideal start time within the slot based on habit preferences
    // Pass `now` to ensure we don't schedule before current time
    const rawIdealStartTime = calculateIdealStartTimeForHabit(
      convertHabitToConfig(habit),
      bestSlot,
      duration,
      now
    );

    // Round to 15-minute boundaries for clean scheduling
    const idealStartTime = roundTo15Minutes(rawIdealStartTime);

    // Calculate event end time and round it too
    const eventEnd = roundTo15Minutes(
      new Date(idealStartTime.getTime() + duration * 60 * 1000)
    );

    // Safety check: Verify no conflict before scheduling
    if (occupiedSlots.hasConflict(idealStartTime, eventEnd)) {
      logger.warn(
        `Conflict detected for rescheduled habit "${habit.name}" at ${idealStartTime.toISOString()}-${eventEnd.toISOString()}, skipping`,
        null,
        habit.id,
        habit.name
      );
      continue;
    }

    const occurrenceDate = occurrence.toISOString().split('T')[0];

    // Create new calendar event
    const { data: event, error: eventError } = await supabase
      .from('workspace_calendar_events')
      .insert({
        ws_id: wsId,
        title: habit.name,
        description: habit.description || '',
        start_at: idealStartTime.toISOString(),
        end_at: eventEnd.toISOString(),
        color: habit.color || getColorForHourType(habit.calendar_hours),
      })
      .select()
      .single();

    if (eventError || !event) {
      logger.error(
        'Error creating rescheduled habit event:',
        eventError,
        habit.id,
        habit.name
      );
      continue;
    }

    // Create junction table entry
    await supabase.from('habit_calendar_events').insert({
      habit_id: habit.id,
      event_id: event.id,
      occurrence_date: occurrenceDate,
      completed: false,
    });

    const scheduledEvent: ScheduledEvent = {
      id: event.id,
      title: habit.name,
      start_at: idealStartTime.toISOString(),
      end_at: eventEnd.toISOString(),
      type: 'habit',
      source_id: habit.id,
      occurrence_date: occurrenceDate || '',
    };

    logger.log(
      'habit',
      `Successfully rescheduled bumped habit "${habit.name}" from ${idealStartTime.toISOString()} to ${eventEnd.toISOString()}`,
      { event: scheduledEvent },
      habit.id,
      habit.name
    );

    occupiedSlots.add(scheduledEvent, habit.priority || 'normal');

    results.push({
      habit,
      occurrence,
      event: scheduledEvent,
      duration,
    });
  }

  return results;
}

// ============================================================================
// UNIVERSAL BREAKS SCHEDULING
// ============================================================================

/**
 * Schedule universal breaks based on workspace settings
 *
 * This function analyzes the scheduled events and inserts break events
 * after periods of continuous work that exceed the configured interval.
 *
 * @returns Number of break events created
 */
async function scheduleUniversalBreaks(
  supabase: SupabaseClient,
  wsId: string,
  breakSettings: WorkspaceBreakSettings,
  occupiedSlots: OccupiedSlotTracker,
  windowDays: number,
  logger: SchedulingLogger
): Promise<number> {
  const { break_duration_minutes, break_interval_minutes } = breakSettings;

  // Get all scheduled events (habits and tasks) sorted by start time
  const allSlots = occupiedSlots
    .getAll()
    .filter((slot) => slot.type === 'habit' || slot.type === 'task')
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  if (allSlots.length === 0) {
    logger.log('info', 'No scheduled events found, skipping break scheduling');
    return 0;
  }

  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + windowDays);

  let breaksCreated = 0;
  let cumulativeWorkMinutes = 0;
  let lastEventEnd: Date | null = null;

  for (const slot of allSlots) {
    // Skip past events
    if (slot.end <= now) continue;

    // If there's a gap of more than 30 minutes, reset cumulative work time
    // (user likely took an organic break)
    if (lastEventEnd) {
      const gapMinutes =
        (slot.start.getTime() - lastEventEnd.getTime()) / (1000 * 60);
      if (gapMinutes >= 30) {
        cumulativeWorkMinutes = 0;
      }
    }

    // Calculate work duration for this event
    const eventDuration =
      (slot.end.getTime() - slot.start.getTime()) / (1000 * 60);
    cumulativeWorkMinutes += eventDuration;

    // Check if we've exceeded the break interval
    if (cumulativeWorkMinutes >= break_interval_minutes) {
      // Schedule a break after this event
      const breakStart = new Date(slot.end);
      const breakEnd = new Date(breakStart);
      breakEnd.setMinutes(breakEnd.getMinutes() + break_duration_minutes);

      // Only schedule if the break doesn't conflict with existing events
      if (!occupiedSlots.hasConflict(breakStart, breakEnd)) {
        const { data: breakEvent, error: breakEventError } = await supabase
          .from('workspace_calendar_events')
          .insert({
            ws_id: wsId,
            title: 'Break',
            description: `Scheduled break after ${Math.round(cumulativeWorkMinutes)} minutes of work`,
            start_at: breakStart.toISOString(),
            end_at: breakEnd.toISOString(),
            color: 'GRAY',
          })
          .select()
          .single();

        if (!breakEventError && breakEvent) {
          logger.log('info', `Scheduled universal break`, {
            start: breakStart.toISOString(),
            end: breakEnd.toISOString(),
            afterWorkMinutes: cumulativeWorkMinutes,
          });

          // Add break to occupied slots
          occupiedSlots.add(
            {
              id: breakEvent.id,
              title: 'Break',
              start_at: breakStart.toISOString(),
              end_at: breakEnd.toISOString(),
              type: 'habit', // Using 'habit' type for breaks to avoid conflicts
              source_id: 'universal-break',
            },
            'normal'
          );

          breaksCreated++;
          cumulativeWorkMinutes = 0; // Reset after scheduling a break
        } else {
          logger.warn('Failed to create break event', {
            error: breakEventError,
          });
        }
      } else {
        logger.log(
          'info',
          'Skipped break due to conflict with existing event',
          {
            breakStart: breakStart.toISOString(),
            breakEnd: breakEnd.toISOString(),
          }
        );
        // Reset anyway since user has something else scheduled (implicit break)
        cumulativeWorkMinutes = 0;
      }
    }

    lastEventEnd = slot.end;
  }

  return breaksCreated;
}

// ============================================================================
// MAIN SCHEDULING FUNCTION
// ============================================================================

/**
 * Schedule all habits and tasks for a workspace
 *
 * @param supabase - Supabase client
 * @param wsId - Workspace ID
 * @param options - Scheduling options
 * @returns Unified schedule result
 */
export async function scheduleWorkspace(
  supabase: SupabaseClient,
  wsId: string,
  options: {
    windowDays?: number;
    forceReschedule?: boolean;
  } = {}
): Promise<ScheduleResult> {
  const { windowDays = 30, forceReschedule = false } = options;

  const logger = new SchedulingLogger();
  logger.log('info', 'Starting Smart Schedule', {
    windowDays,
    forceReschedule,
  });

  // 1. Fetch all scheduling context in parallel
  const [hourSettings, blockedEvents, habits, tasks, breakSettings, timezone] =
    await Promise.all([
      fetchHourSettings(supabase, wsId),
      fetchAllBlockedEvents(supabase, wsId, windowDays),
      fetchSchedulableHabits(supabase, wsId),
      fetchSchedulableTasks(supabase, wsId),
      fetchWorkspaceBreakSettings(supabase, wsId),
      fetchWorkspaceTimezone(supabase, wsId),
    ]);
  logger.log('info', 'Fetched initial data', {
    habitsCount: habits.length,
    tasksCount: tasks.length,
    blockedEventsCount: blockedEvents.length,
    breakSettings,
  });

  // 2. Build occupied slots from ALL existing calendar events
  // This ensures no double-booking of any time slots
  const occupiedSlots = new OccupiedSlotTracker(blockedEvents);
  logger.log(
    'info',
    `OccupiedSlotTracker initialized with ${blockedEvents.length} blocked events.`
  );

  // 3. If force reschedule, delete auto-scheduled events that haven't started yet
  // IMPORTANT: We preserve ongoing events (start_at <= now < end_at) since user may be in the middle of them
  if (forceReschedule) {
    logger.log(
      'info',
      'Force reschedule enabled, deleting future auto-scheduled events.'
    );
    const now = new Date();
    let deletedHabitEventsCount = 0;
    let deletedTaskEventsCount = 0;

    // Delete habit events that haven't started yet (NOT ongoing ones)
    // Only delete where start_at > now (future events that haven't begun)
    // IMPORTANT: Never delete locked events - they are manually positioned
    for (const habit of habits) {
      const { data: futureLinks } = await supabase
        .from('habit_calendar_events')
        .select('event_id, workspace_calendar_events!inner(start_at, locked)')
        .eq('habit_id', habit.id)
        .gt('workspace_calendar_events.start_at', now.toISOString())
        .eq('workspace_calendar_events.locked', false);

      if (futureLinks && futureLinks.length > 0) {
        const eventIds = futureLinks.map((l) => l.event_id);
        await supabase
          .from('workspace_calendar_events')
          .delete()
          .in('id', eventIds);
        deletedHabitEventsCount += eventIds.length;
        logger.log(
          'info',
          `Deleted ${eventIds.length} future habit events for habit "${habit.name}".`,
          null,
          habit.id,
          habit.name
        );
      }
    }

    // Delete task events that haven't started yet (NOT ongoing ones)
    // Only delete where start_at > now (future events that haven't begun)
    // IMPORTANT: Never delete locked events - they are manually positioned
    for (const task of tasks) {
      const { data: futureLinks } = await supabase
        .from('task_calendar_events')
        .select('event_id, workspace_calendar_events!inner(start_at, locked)')
        .eq('task_id', task.id)
        .gt('workspace_calendar_events.start_at', now.toISOString())
        .eq('workspace_calendar_events.locked', false);

      if (futureLinks && futureLinks.length > 0) {
        const eventIds = futureLinks.map((l) => l.event_id);
        logger.log(
          'info',
          `Deleting ${eventIds.length} future events for task ${task.name}`,
          null,
          task.id,
          task.name
        );
        await supabase
          .from('workspace_calendar_events')
          .delete()
          .in('id', eventIds);
        deletedTaskEventsCount += eventIds.length;
      } else {
        logger.log(
          'info',
          `No future events found for task ${task.name} (start > ${now.toISOString()})`,
          null,
          task.id,
          task.name
        );
      }
    }
    logger.log(
      'info',
      `Force reschedule complete. Deleted ${deletedHabitEventsCount} habit events and ${deletedTaskEventsCount} task events.`
    );
  }

  // 4. PHASE 1: Schedule habits (priority order)
  logger.log('info', `Scheduling ${habits.length} habits`);
  const habitResults = await scheduleHabitsPhase(
    supabase,
    wsId,
    habits,
    hourSettings,
    occupiedSlots,
    windowDays,
    logger,
    timezone
  );
  logger.log(
    'info',
    `Habit scheduling phase complete. Scheduled ${habitResults.events.length} events.`
  );

  // 5. PHASE 2: Schedule tasks (deadline-priority order)
  logger.log('info', `Scheduling ${tasks.length} tasks`);
  const taskResults = await scheduleTasksPhase(
    supabase,
    wsId,
    tasks,
    hourSettings,
    occupiedSlots,
    habitResults.habitEventMap,
    windowDays,
    logger
  );
  logger.log(
    'info',
    `Task scheduling phase complete. Scheduled ${taskResults.events.length} events, bumped ${taskResults.bumpedHabitEvents.length} habits.`
  );

  // 6. Reschedule bumped habits
  const rescheduledHabits = await rescheduleBumpedHabits(
    supabase,
    wsId,
    taskResults.bumpedHabitEvents,
    hourSettings,
    occupiedSlots,
    logger,
    timezone
  );

  // 7. PHASE 3: Schedule universal breaks based on workspace settings
  let breaksScheduled = 0;
  if (breakSettings.break_enabled) {
    logger.log('info', 'Scheduling universal breaks', { breakSettings });
    breaksScheduled = await scheduleUniversalBreaks(
      supabase,
      wsId,
      breakSettings,
      occupiedSlots,
      windowDays,
      logger
    );
    logger.log('info', `Scheduled ${breaksScheduled} break events`);
  }

  return {
    habits: {
      events: habitResults.events,
      warnings: habitResults.warnings,
    },
    tasks: {
      events: taskResults.events,
      bumpedHabits: taskResults.bumpedHabitEvents,
      warnings: taskResults.warnings,
    },
    summary: {
      totalEvents:
        habitResults.events.length +
        taskResults.events.length +
        breaksScheduled,
      habitsScheduled: habitResults.events.length,
      tasksScheduled: taskResults.events.length,
      bumpedHabits: taskResults.bumpedHabitEvents.length,
      breaksScheduled,
    },
    rescheduledHabits,
    warnings: [...habitResults.warnings, ...taskResults.warnings],
    debugLogs: logger.getLogs(),
  };
}
