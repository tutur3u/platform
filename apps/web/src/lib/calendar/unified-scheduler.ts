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

import {
  calculateOptimalDuration,
  calculatePriorityScore,
  comparePriority,
  getEffectiveDurationBounds,
  getEffectivePriority,
  getOccurrencesInRange,
  getSlotCharacteristics,
  isUrgent,
} from '@tuturuuu/ai/scheduling';
import type { SupabaseClient } from '@tuturuuu/supabase';
import type { TaskWithScheduling } from '@tuturuuu/types';
import type { Habit } from '@tuturuuu/types/primitives/Habit';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';

import { fetchHourSettings } from './task-scheduler';

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
  warning?: string;
}

export interface BumpedHabitEvent {
  habit: Habit;
  occurrence: Date;
  originalEvent: ScheduledEvent;
}

export interface UnifiedScheduleResult {
  habits: {
    events: HabitScheduleResult[];
    warnings: string[];
  };
  tasks: {
    events: TaskScheduleResult[];
    bumpedHabitEvents: BumpedHabitEvent[];
    warnings: string[];
  };
  rescheduledHabits: HabitScheduleResult[];
  warnings: string[];
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
   */
  findBumpableHabitEvents(
    taskPriority: TaskPriority,
    beforeDate: Date
  ): OccupiedSlot[] {
    return this.slots.filter((slot) => {
      // Only bump habit events
      if (slot.type !== 'habit') return false;

      // Only bump events before the deadline
      if (slot.start >= beforeDate) return false;

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
    .is('deleted_at', null);

  if (error) {
    console.error('Error fetching habits:', error);
    return [];
  }

  return (data as Habit[]) || [];
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
 * Fetch locked events (user-created, Google Calendar synced)
 */
async function fetchLockedEvents(
  supabase: SupabaseClient,
  wsId: string,
  windowDays: number
): Promise<Array<{ id: string; start_at: string; end_at: string }>> {
  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + windowDays);

  const { data, error } = await supabase
    .from('workspace_calendar_events')
    .select('id, start_at, end_at')
    .eq('ws_id', wsId)
    .eq('locked', true)
    .gt('end_at', now.toISOString())
    .lt('start_at', endDate.toISOString());

  if (error) {
    console.error('Error fetching locked events:', error);
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
  if (!daySettings?.enabled) return [];
  return daySettings.timeBlocks || [];
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
  windowDays: number
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

  // Sort habits by priority (highest first)
  const sortedHabits = [...habits].sort((a, b) => {
    const aScore = calculatePriorityScore({ priority: a.priority });
    const bScore = calculatePriorityScore({ priority: b.priority });
    return bScore - aScore;
  });

  const now = new Date();
  const rangeEnd = new Date(now);
  rangeEnd.setDate(rangeEnd.getDate() + windowDays);

  for (const habit of sortedHabits) {
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
      if (scheduledDates.has(occurrenceDate)) continue;

      // Get duration bounds
      const { min: minDuration } = getEffectiveDurationBounds({
        duration_minutes: habit.duration_minutes,
        min_duration_minutes: habit.min_duration_minutes,
        max_duration_minutes: habit.max_duration_minutes,
      });

      // Find available slots for this occurrence date
      const slots = findAvailableSlotsInDay(
        occurrence,
        hourSettings,
        habit.calendar_hours,
        occupiedSlots,
        minDuration
      );

      if (slots.length === 0) {
        warnings.push(
          `No available slot for habit "${habit.name}" on ${occurrenceDate}`
        );
        continue;
      }

      // Find best slot based on ideal_time and time_preference
      let bestSlot = slots[0]!;
      let bestScore = -Infinity;

      for (const slot of slots) {
        const characteristics = getSlotCharacteristics(habit, {
          start: slot.start,
          end: slot.end,
          maxAvailable: slot.maxAvailable,
        });

        let score = 0;
        if (characteristics.matchesIdealTime) score += 1000;
        if (characteristics.matchesPreference) score += 500;
        score -= slot.start.getHours(); // Prefer earlier slots

        if (score > bestScore) {
          bestScore = score;
          bestSlot = slot;
        }
      }

      // Calculate optimal duration
      const characteristics = getSlotCharacteristics(habit, {
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
        warnings.push(`Cannot fit habit "${habit.name}" on ${occurrenceDate}`);
        continue;
      }

      // Calculate event end time
      const eventEnd = new Date(bestSlot.start);
      eventEnd.setMinutes(eventEnd.getMinutes() + duration);

      // Create calendar event
      const { data: event, error: eventError } = await supabase
        .from('workspace_calendar_events')
        .insert({
          ws_id: wsId,
          title: habit.name,
          description: habit.description || '',
          start_at: bestSlot.start.toISOString(),
          end_at: eventEnd.toISOString(),
          color: habit.color || getColorForHourType(habit.calendar_hours),
        })
        .select()
        .single();

      if (eventError || !event) {
        console.error('Error creating habit event:', eventError);
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
        console.error('Error linking habit to event:', linkError);
        await supabase
          .from('workspace_calendar_events')
          .delete()
          .eq('id', event.id);
        continue;
      }

      const scheduledEvent: ScheduledEvent = {
        id: event.id,
        title: habit.name,
        start_at: bestSlot.start.toISOString(),
        end_at: eventEnd.toISOString(),
        type: 'habit',
        source_id: habit.id,
        occurrence_date: occurrenceDate || '',
      };

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
  windowDays: number
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
    const totalMinutes = (task.total_duration ?? 0) * 60;
    const scheduledMinutes = task.scheduled_minutes ?? 0;
    let remainingMinutes = totalMinutes - scheduledMinutes;

    if (remainingMinutes <= 0) {
      results.push({
        task,
        events: [],
        scheduledMinutes: totalMinutes,
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
        const deadline = new Date(task.end_date);
        const bumpable = occupiedSlots.findBumpableHabitEvents(
          taskPriority,
          deadline
        );

        for (const bumpableSlot of bumpable) {
          const habitInfo = habitEventMap.get(bumpableSlot.id);
          if (habitInfo) {
            // Remove the bumped event
            occupiedSlots.remove(bumpableSlot.id);

            // Delete from database
            await supabase
              .from('workspace_calendar_events')
              .delete()
              .eq('id', bumpableSlot.id);

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

        // Retry finding slots
        slots = findAvailableSlotsInDay(
          searchDate,
          hourSettings,
          task.calendar_hours,
          occupiedSlots,
          minDuration
        );
      }

      for (const slot of slots) {
        if (remainingMinutes <= 0) break;

        // Calculate duration for this event
        let eventDuration = Math.min(
          remainingMinutes,
          maxDuration,
          slot.maxAvailable
        );
        eventDuration = Math.max(
          eventDuration,
          Math.min(minDuration, remainingMinutes)
        );

        if (eventDuration < minDuration && remainingMinutes >= minDuration) {
          continue; // Slot too small
        }

        const eventEnd = new Date(slot.start);
        eventEnd.setMinutes(eventEnd.getMinutes() + eventDuration);

        // Check if scheduled after deadline
        if (task.end_date && eventEnd > new Date(task.end_date)) {
          scheduledAfterDeadline = true;
        }

        // Determine event title
        const totalParts = Math.ceil(totalMinutes / maxDuration);
        const partNumber = taskEvents.length + 1;
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
            start_at: slot.start.toISOString(),
            end_at: eventEnd.toISOString(),
            color: getColorForHourType(task.calendar_hours),
          })
          .select()
          .single();

        if (eventError || !event) {
          console.error('Error creating task event:', eventError);
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
          console.error('Error linking task to event:', e);
        }

        const scheduledEvent: ScheduledEvent = {
          id: event.id,
          title: eventTitle,
          start_at: slot.start.toISOString(),
          end_at: eventEnd.toISOString(),
          type: 'task',
          source_id: task.id,
          scheduled_minutes: eventDuration,
        };

        occupiedSlots.add(scheduledEvent, taskPriority);
        taskEvents.push(scheduledEvent);
        scheduledSoFar += eventDuration;
        remainingMinutes -= eventDuration;
      }
    }

    results.push({
      task,
      events: taskEvents,
      scheduledMinutes: scheduledMinutes + scheduledSoFar,
      warning: scheduledAfterDeadline
        ? 'Some events scheduled after deadline'
        : undefined,
    });

    if (scheduledAfterDeadline) {
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
  occupiedSlots: OccupiedSlotTracker
): Promise<HabitScheduleResult[]> {
  const results: HabitScheduleResult[] = [];

  for (const bumped of bumpedEvents) {
    const { habit, occurrence } = bumped;

    const { min: minDuration } = getEffectiveDurationBounds({
      duration_minutes: habit.duration_minutes,
      min_duration_minutes: habit.min_duration_minutes,
      max_duration_minutes: habit.max_duration_minutes,
    });

    // Try to find a slot on the same day first
    let slots = findAvailableSlotsInDay(
      occurrence,
      hourSettings,
      habit.calendar_hours,
      occupiedSlots,
      minDuration
    );

    // If no slot on same day, try next few days
    if (slots.length === 0) {
      for (let dayOffset = 1; dayOffset <= 3; dayOffset++) {
        const nextDay = new Date(occurrence);
        nextDay.setDate(nextDay.getDate() + dayOffset);

        slots = findAvailableSlotsInDay(
          nextDay,
          hourSettings,
          habit.calendar_hours,
          occupiedSlots,
          minDuration
        );

        if (slots.length > 0) break;
      }
    }

    if (slots.length === 0) {
      console.warn(`Could not reschedule bumped habit "${habit.name}"`);
      continue;
    }

    const bestSlot = slots[0]!;
    const characteristics = getSlotCharacteristics(habit, {
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

    if (duration === 0) continue;

    const eventEnd = new Date(bestSlot.start);
    eventEnd.setMinutes(eventEnd.getMinutes() + duration);

    const occurrenceDate = occurrence.toISOString().split('T')[0];

    // Create new calendar event
    const { data: event, error: eventError } = await supabase
      .from('workspace_calendar_events')
      .insert({
        ws_id: wsId,
        title: habit.name,
        description: habit.description || '',
        start_at: bestSlot.start.toISOString(),
        end_at: eventEnd.toISOString(),
        color: habit.color || getColorForHourType(habit.calendar_hours),
      })
      .select()
      .single();

    if (eventError || !event) {
      console.error('Error creating rescheduled habit event:', eventError);
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
      start_at: bestSlot.start.toISOString(),
      end_at: eventEnd.toISOString(),
      type: 'habit',
      source_id: habit.id,
      occurrence_date: occurrenceDate || '',
    };

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
): Promise<UnifiedScheduleResult> {
  const { windowDays = 30, forceReschedule = false } = options;

  // 1. Fetch all scheduling context in parallel
  const [hourSettings, lockedEvents, habits, tasks] = await Promise.all([
    fetchHourSettings(supabase, wsId),
    fetchLockedEvents(supabase, wsId, windowDays),
    fetchSchedulableHabits(supabase, wsId),
    fetchSchedulableTasks(supabase, wsId),
  ]);

  // 2. Build occupied slots from locked events
  const occupiedSlots = new OccupiedSlotTracker(lockedEvents);

  // 3. If force reschedule, delete all future auto-scheduled events first
  if (forceReschedule) {
    const now = new Date();

    // Delete future habit events
    for (const habit of habits) {
      const { data: futureLinks } = await supabase
        .from('habit_calendar_events')
        .select('event_id, workspace_calendar_events!inner(start_at)')
        .eq('habit_id', habit.id)
        .gt('workspace_calendar_events.start_at', now.toISOString());

      if (futureLinks && futureLinks.length > 0) {
        const eventIds = futureLinks.map((l) => l.event_id);
        await supabase
          .from('workspace_calendar_events')
          .delete()
          .in('id', eventIds);
      }
    }

    // Delete future task events
    for (const task of tasks) {
      const { data: futureLinks } = await supabase
        .from('task_calendar_events')
        .select('event_id, workspace_calendar_events!inner(start_at)')
        .eq('task_id', task.id)
        .gt('workspace_calendar_events.start_at', now.toISOString());

      if (futureLinks && futureLinks.length > 0) {
        const eventIds = futureLinks.map((l) => l.event_id);
        await supabase
          .from('workspace_calendar_events')
          .delete()
          .in('id', eventIds);
      }
    }
  }

  // 4. PHASE 1: Schedule habits (priority order)
  const habitResults = await scheduleHabitsPhase(
    supabase,
    wsId,
    habits,
    hourSettings,
    occupiedSlots,
    windowDays
  );

  // 5. PHASE 2: Schedule tasks (deadline-priority order)
  const taskResults = await scheduleTasksPhase(
    supabase,
    wsId,
    tasks,
    hourSettings,
    occupiedSlots,
    habitResults.habitEventMap,
    windowDays
  );

  // 6. Reschedule bumped habits
  const rescheduledHabits = await rescheduleBumpedHabits(
    supabase,
    wsId,
    taskResults.bumpedHabitEvents,
    hourSettings,
    occupiedSlots
  );

  return {
    habits: {
      events: habitResults.events,
      warnings: habitResults.warnings,
    },
    tasks: {
      events: taskResults.events,
      bumpedHabitEvents: taskResults.bumpedHabitEvents,
      warnings: taskResults.warnings,
    },
    rescheduledHabits,
    warnings: [...habitResults.warnings, ...taskResults.warnings],
  };
}
