/**
 * Habit Scheduler
 *
 * Schedules habit occurrences on the calendar by creating events.
 * Integrates with the task scheduling system and respects workspace hour settings.
 *
 * This module has been updated to use:
 * - Smart duration optimization (min/max duration with slot-aware sizing)
 * - Priority-based scheduling via the unified scheduler
 * - Integration with the unified scheduling system for coordinated habit/task scheduling
 */

import {
  calculateOptimalDuration,
  getEffectiveDurationBounds,
  getOccurrencesInRange,
  getSlotCharacteristics,
} from '@tuturuuu/ai/scheduling';
import type { SupabaseClient } from '@tuturuuu/supabase';
import type {
  Habit,
  HabitCompletion,
  HabitStreak,
  TimeOfDayPreference,
} from '@tuturuuu/types/primitives/Habit';
import { getTimeRangeForPreference } from '@tuturuuu/types/primitives/Habit';
import { fetchHourSettings } from './task-scheduler';
import { scheduleWorkspace } from './unified-scheduler';

// ============================================================================
// TYPES
// ============================================================================

export type HabitScheduleResult = {
  success: boolean;
  eventsCreated: number;
  occurrencesScheduled: number;
  totalOccurrences: number;
  message: string;
  events: Array<{
    id: string;
    title: string;
    start_at: string;
    end_at: string;
    occurrence_date: string;
  }>;
};

type TimeSlot = {
  start: Date;
  end: Date;
};

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Schedule a habit's occurrences within a time window (default 30 days)
 * Creates calendar events for each occurrence that doesn't already have one
 */
export async function scheduleHabit(
  supabase: SupabaseClient,
  wsId: string,
  habit: Habit,
  windowDays: number = 30
): Promise<HabitScheduleResult> {
  const now = new Date();
  const rangeStart = new Date(now);
  const rangeEnd = new Date(now);
  rangeEnd.setDate(rangeEnd.getDate() + windowDays);

  // Get all occurrences in the scheduling window
  const occurrences = getOccurrencesInRange(habit, rangeStart, rangeEnd);

  if (occurrences.length === 0) {
    return {
      success: true,
      eventsCreated: 0,
      occurrencesScheduled: 0,
      totalOccurrences: 0,
      message: 'No occurrences to schedule in the time window',
      events: [],
    };
  }

  // Get existing scheduled events for this habit to avoid duplicates
  const { data: existingLinks } = await supabase
    .from('habit_calendar_events')
    .select('occurrence_date')
    .eq('habit_id', habit.id);

  const scheduledDates = new Set(
    existingLinks?.map((l) => l.occurrence_date) || []
  );

  // Filter to only unscheduled occurrences
  const unscheduledOccurrences = occurrences.filter((occ) => {
    const dateStr = occ.toISOString().split('T')[0];
    return !scheduledDates.has(dateStr);
  });

  if (unscheduledOccurrences.length === 0) {
    return {
      success: true,
      eventsCreated: 0,
      occurrencesScheduled: occurrences.length,
      totalOccurrences: occurrences.length,
      message: 'All occurrences are already scheduled',
      events: [],
    };
  }

  // Fetch hour settings for the workspace
  const hourSettings = await fetchHourSettings(supabase, wsId);

  // Fetch existing calendar events to find available slots
  const { data: existingEvents } = await supabase
    .from('workspace_calendar_events')
    .select('start_at, end_at')
    .eq('ws_id', wsId)
    .gte('end_at', rangeStart.toISOString())
    .lte('start_at', rangeEnd.toISOString());

  const createdEvents: HabitScheduleResult['events'] = [];
  let eventsCreated = 0;

  // Schedule each unscheduled occurrence
  for (const occurrence of unscheduledOccurrences) {
    const occurrenceDate = occurrence.toISOString().split('T')[0];

    // Find a time slot for this occurrence
    const slot = findSlotForOccurrence(
      habit,
      occurrence,
      hourSettings,
      existingEvents || []
    );

    if (!slot) {
      // Could not find a slot for this occurrence, skip
      continue;
    }

    // Create calendar event
    const eventTitle = habit.name;
    const { data: event, error: eventError } = await supabase
      .from('workspace_calendar_events')
      .insert({
        ws_id: wsId,
        title: eventTitle,
        description: habit.description || '',
        start_at: slot.start.toISOString(),
        end_at: slot.end.toISOString(),
        color: habit.color,
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
      // Clean up the event we just created
      await supabase
        .from('workspace_calendar_events')
        .delete()
        .eq('id', event.id);
      continue;
    }

    createdEvents.push({
      id: event.id,
      title: eventTitle,
      start_at: slot.start.toISOString(),
      end_at: slot.end.toISOString(),
      occurrence_date: occurrenceDate || '',
    });

    eventsCreated++;

    // Add to existing events to prevent overlapping when scheduling subsequent occurrences
    existingEvents?.push({
      start_at: slot.start.toISOString(),
      end_at: slot.end.toISOString(),
    });
  }

  return {
    success: eventsCreated > 0,
    eventsCreated,
    occurrencesScheduled:
      occurrences.length - unscheduledOccurrences.length + eventsCreated,
    totalOccurrences: occurrences.length,
    message:
      eventsCreated > 0
        ? `Scheduled ${eventsCreated} occurrence(s)`
        : 'No events could be scheduled',
    events: createdEvents,
  };
}

/**
 * Reschedule all active habits in a workspace
 * Useful when hour settings change or for periodic maintenance
 */
export async function rescheduleAllHabits(
  supabase: SupabaseClient,
  wsId: string,
  windowDays: number = 30
): Promise<{
  scheduledCount: number;
  totalHabits: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let scheduledCount = 0;

  // Fetch all active habits with auto_schedule enabled
  const { data: habits, error } = await supabase
    .from('workspace_habits')
    .select('*')
    .eq('ws_id', wsId)
    .eq('is_active', true)
    .eq('auto_schedule', true)
    .is('deleted_at', null);

  if (error) {
    return {
      scheduledCount: 0,
      totalHabits: 0,
      errors: [error.message],
    };
  }

  if (!habits || habits.length === 0) {
    return {
      scheduledCount: 0,
      totalHabits: 0,
      errors: [],
    };
  }

  // Schedule each habit
  for (const habitData of habits) {
    try {
      const result = await scheduleHabit(
        supabase,
        wsId,
        habitData as Habit,
        windowDays
      );
      if (result.eventsCreated > 0) {
        scheduledCount++;
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`${habitData.name}: ${errorMessage}`);
    }
  }

  return {
    scheduledCount,
    totalHabits: habits.length,
    errors,
  };
}

/**
 * Delete future scheduled events for a habit
 * Used when a habit is deactivated or deleted
 */
export async function deleteFutureHabitEvents(
  supabase: SupabaseClient,
  habitId: string
): Promise<{ deleted: number; error?: string }> {
  const now = new Date();

  // Get future event IDs
  const { data: futureLinks, error: fetchError } = await supabase
    .from('habit_calendar_events')
    .select('event_id, workspace_calendar_events!inner(start_at)')
    .eq('habit_id', habitId)
    .gt('workspace_calendar_events.start_at', now.toISOString());

  if (fetchError) {
    return { deleted: 0, error: fetchError.message };
  }

  if (!futureLinks || futureLinks.length === 0) {
    return { deleted: 0 };
  }

  const eventIds = futureLinks.map((l) => l.event_id);

  // Delete the calendar events (cascade will handle junction table)
  const { error: deleteError } = await supabase
    .from('workspace_calendar_events')
    .delete()
    .in('id', eventIds);

  if (deleteError) {
    return { deleted: 0, error: deleteError.message };
  }

  return { deleted: eventIds.length };
}

// ============================================================================
// STREAK CALCULATION
// ============================================================================

/**
 * Calculate streak statistics for a habit
 */
export function calculateHabitStreak(
  habit: Habit,
  completions: HabitCompletion[]
): HabitStreak {
  if (completions.length === 0) {
    return {
      current_streak: 0,
      best_streak: 0,
      total_completions: 0,
      completion_rate: 0,
      last_completed_at: null,
    };
  }

  // Sort completions by date (newest first)
  const sortedCompletions = [...completions].sort(
    (a, b) =>
      new Date(b.occurrence_date).getTime() -
      new Date(a.occurrence_date).getTime()
  );

  const completedDates = new Set(
    sortedCompletions.map((c) => c.occurrence_date)
  );

  // Calculate current streak
  let currentStreak = 0;
  let bestStreak = 0;
  let tempStreak = 0;

  // Get all expected occurrences from start to today
  const today = new Date();
  const startDate = new Date(habit.start_date);
  const occurrences = getOccurrencesInRange(habit, startDate, today);

  // Check streak from most recent occurrence backward
  for (let i = occurrences.length - 1; i >= 0; i--) {
    const occ = occurrences[i];
    const dateStr = occ?.toISOString().split('T')[0];

    if (dateStr && completedDates.has(dateStr)) {
      tempStreak++;
      if (i === occurrences.length - 1) {
        // This is the most recent occurrence, start counting current streak
        currentStreak = tempStreak;
      }
    } else {
      // Streak broken
      if (tempStreak > bestStreak) {
        bestStreak = tempStreak;
      }
      tempStreak = 0;

      // If we haven't set current streak yet and hit a gap, current streak is 0
      if (currentStreak === 0 && i === occurrences.length - 1) {
        currentStreak = 0;
      }
    }
  }

  // Check final streak
  if (tempStreak > bestStreak) {
    bestStreak = tempStreak;
  }

  // Update current streak if it's still building
  if (currentStreak < tempStreak) {
    currentStreak = tempStreak;
  }

  // Calculate completion rate
  const totalOccurrences = occurrences.length;
  const completionRate =
    totalOccurrences > 0
      ? Math.round((completions.length / totalOccurrences) * 100)
      : 0;

  return {
    current_streak: currentStreak,
    best_streak: Math.max(bestStreak, currentStreak),
    total_completions: completions.length,
    completion_rate: completionRate,
    last_completed_at: sortedCompletions[0]?.completed_at || null,
  };
}

/**
 * Fetch habit streak from database
 */
export async function fetchHabitStreak(
  supabase: SupabaseClient,
  habit: Habit
): Promise<HabitStreak> {
  const { data: completions } = await supabase
    .from('habit_completions')
    .select('*')
    .eq('habit_id', habit.id)
    .order('occurrence_date', { ascending: false });

  return calculateHabitStreak(habit, (completions as HabitCompletion[]) || []);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Smart slot result with optimized duration
 */
type SmartTimeSlot = TimeSlot & {
  duration: number;
  matchesIdealTime: boolean;
  matchesPreference: boolean;
};

/**
 * Find an available time slot for a habit occurrence with smart duration optimization
 *
 * The duration is optimized based on:
 * - Ideal time match: Use max duration (maximize benefit)
 * - Time preference match: Use preferred duration
 * - Constrained slot: Use minimum viable duration
 */
function findSlotForOccurrence(
  habit: Habit,
  occurrenceDate: Date,
  hourSettings: {
    personalHours: Record<
      string,
      {
        enabled: boolean;
        timeBlocks: Array<{ startTime: string; endTime: string }>;
      }
    >;
    workHours: Record<
      string,
      {
        enabled: boolean;
        timeBlocks: Array<{ startTime: string; endTime: string }>;
      }
    >;
    meetingHours: Record<
      string,
      {
        enabled: boolean;
        timeBlocks: Array<{ startTime: string; endTime: string }>;
      }
    >;
  },
  existingEvents: Array<{ start_at: string; end_at: string }>
): SmartTimeSlot | null {
  const dayOfWeek = occurrenceDate.getDay();
  const dayNames = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  const dayName = dayNames[dayOfWeek];

  // Get the appropriate hour settings based on calendar_hours type
  let daySettings:
    | {
        enabled: boolean;
        timeBlocks: Array<{ startTime: string; endTime: string }>;
      }
    | undefined;

  if (habit.calendar_hours === 'work_hours') {
    daySettings =
      hourSettings.workHours[dayName as keyof typeof hourSettings.workHours];
  } else if (habit.calendar_hours === 'meeting_hours') {
    daySettings =
      hourSettings.meetingHours[
        dayName as keyof typeof hourSettings.meetingHours
      ];
  } else {
    daySettings =
      hourSettings.personalHours[
        dayName as keyof typeof hourSettings.personalHours
      ];
  }

  if (!daySettings?.enabled || !daySettings.timeBlocks?.length) {
    return null;
  }

  // Get effective duration bounds using smart defaults
  const {
    min: minDuration,
    preferred,
    max: maxDuration,
  } = getEffectiveDurationBounds({
    duration_minutes: habit.duration_minutes,
    min_duration_minutes: habit.min_duration_minutes,
    max_duration_minutes: habit.max_duration_minutes,
  });

  // Get events for this specific day
  const dayStart = new Date(occurrenceDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(occurrenceDate);
  dayEnd.setHours(23, 59, 59, 999);

  const dayEvents = existingEvents.filter((e) => {
    const eventStart = new Date(e.start_at);
    const eventEnd = new Date(e.end_at);
    return eventStart < dayEnd && eventEnd > dayStart;
  });

  // Helper to check slot availability and calculate optimal duration
  const evaluateSlot = (
    slotStart: Date,
    maxAvailable: number
  ): SmartTimeSlot | null => {
    const slotEnd = new Date(slotStart);
    slotEnd.setMinutes(slotEnd.getMinutes() + maxAvailable);

    const slotInfo = {
      start: slotStart,
      end: slotEnd,
      maxAvailable,
    };

    // Get slot characteristics
    const characteristics = getSlotCharacteristics(habit, slotInfo);

    // Calculate optimal duration using smart algorithm
    const optimalDuration = calculateOptimalDuration(
      habit,
      slotInfo,
      characteristics
    );

    if (optimalDuration === 0 || optimalDuration < minDuration) {
      return null;
    }

    const eventEnd = new Date(slotStart);
    eventEnd.setMinutes(eventEnd.getMinutes() + optimalDuration);

    return {
      start: slotStart,
      end: eventEnd,
      duration: optimalDuration,
      matchesIdealTime: characteristics.matchesIdealTime,
      matchesPreference: characteristics.matchesPreference,
    };
  };

  // If habit has ideal_time, try that first with max duration
  if (habit.ideal_time) {
    const [hours, minutes] = habit.ideal_time.split(':').map(Number);
    const idealStart = new Date(occurrenceDate);
    idealStart.setHours(hours || 0, minutes || 0, 0, 0);

    // Find available time at ideal slot
    const availableMinutes = findAvailableMinutesAt(
      idealStart,
      dayEvents,
      daySettings.timeBlocks,
      maxDuration
    );

    if (availableMinutes >= minDuration) {
      const slot = evaluateSlot(idealStart, availableMinutes);
      if (slot) return slot;
    }
  }

  // Collect all candidate slots with their scores
  type CandidateSlot = SmartTimeSlot & { score: number };
  const candidates: CandidateSlot[] = [];

  // If habit has time_preference, narrow down to that range first
  let preferredBlocks = daySettings.timeBlocks;
  if (habit.time_preference) {
    const prefRange = getTimeRangeForPreference(
      habit.time_preference as TimeOfDayPreference
    );
    preferredBlocks = daySettings.timeBlocks
      .map((block) => ({
        startTime: maxTime(block.startTime, prefRange.start),
        endTime: minTime(block.endTime, prefRange.end),
      }))
      .filter((block) => block.startTime < block.endTime);
  }

  // Search preferred blocks first
  for (const block of preferredBlocks) {
    const slots = findAllSlotsInBlock(
      occurrenceDate,
      block,
      minDuration,
      dayEvents
    );
    for (const { start, maxAvailable } of slots) {
      const slot = evaluateSlot(start, maxAvailable);
      if (slot) {
        let score = 0;
        if (slot.matchesIdealTime) score += 1000;
        if (slot.matchesPreference) score += 500;
        if (slot.duration >= preferred) score += 200;
        score -= start.getHours() * 0.1; // Prefer earlier slots slightly
        candidates.push({ ...slot, score });
      }
    }
  }

  // Fall back to any available slot in the day's time blocks
  if (candidates.length === 0) {
    for (const block of daySettings.timeBlocks) {
      const slots = findAllSlotsInBlock(
        occurrenceDate,
        block,
        minDuration,
        dayEvents
      );
      for (const { start, maxAvailable } of slots) {
        const slot = evaluateSlot(start, maxAvailable);
        if (slot) {
          let score = 0;
          if (slot.duration >= preferred) score += 200;
          score -= start.getHours() * 0.1;
          candidates.push({ ...slot, score });
        }
      }
    }
  }

  if (candidates.length === 0) return null;

  // Return the best candidate
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

/**
 * Find available minutes at a specific start time
 */
function findAvailableMinutesAt(
  start: Date,
  existingEvents: Array<{ start_at: string; end_at: string }>,
  timeBlocks: Array<{ startTime: string; endTime: string }>,
  maxMinutes: number
): number {
  const startHour = start.getHours();
  const startMin = start.getMinutes();
  const startTimeStr = `${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}`;

  // Find which time block this falls into
  const containingBlock = timeBlocks.find(
    (block) => startTimeStr >= block.startTime && startTimeStr < block.endTime
  );

  if (!containingBlock) return 0;

  // Calculate max available until block end
  const [endHour, endMin] = containingBlock.endTime.split(':').map(Number);
  const blockEnd = new Date(start);
  blockEnd.setHours(endHour || 23, endMin || 59, 0, 0);

  let available = Math.min(
    (blockEnd.getTime() - start.getTime()) / 60000,
    maxMinutes
  );

  // Check for conflicts with existing events
  for (const event of existingEvents) {
    const eventStart = new Date(event.start_at);
    const eventEnd = new Date(event.end_at);

    if (eventStart <= start && eventEnd > start) {
      // Slot starts during an existing event
      return 0;
    }

    if (eventStart > start && eventStart < blockEnd) {
      // Event starts during our potential slot - limit available time
      available = Math.min(
        available,
        (eventStart.getTime() - start.getTime()) / 60000
      );
    }
  }

  return available;
}

/**
 * Find all available slots within a time block (with their max available minutes)
 */
function findAllSlotsInBlock(
  date: Date,
  block: { startTime: string; endTime: string },
  minDurationMinutes: number,
  existingEvents: Array<{ start_at: string; end_at: string }>
): Array<{ start: Date; maxAvailable: number }> {
  const [startHour, startMin] = block.startTime.split(':').map(Number);
  const [endHour, endMin] = block.endTime.split(':').map(Number);

  const blockStart = new Date(date);
  blockStart.setHours(startHour || 0, startMin || 0, 0, 0);

  const blockEnd = new Date(date);
  blockEnd.setHours(endHour || 23, endMin || 59, 0, 0);

  const slots: Array<{ start: Date; maxAvailable: number }> = [];

  // Get events sorted by start time
  const dayEvents = existingEvents
    .map((e) => ({
      start: new Date(e.start_at),
      end: new Date(e.end_at),
    }))
    .filter((e) => e.start < blockEnd && e.end > blockStart)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  if (dayEvents.length === 0) {
    // Entire block is available
    const maxAvailable = (blockEnd.getTime() - blockStart.getTime()) / 60000;
    if (maxAvailable >= minDurationMinutes) {
      slots.push({ start: new Date(blockStart), maxAvailable });
    }
    return slots;
  }

  // Gap before first event
  const firstEvent = dayEvents[0];
  if (firstEvent && firstEvent.start > blockStart) {
    const maxAvailable =
      (firstEvent.start.getTime() - blockStart.getTime()) / 60000;
    if (maxAvailable >= minDurationMinutes) {
      slots.push({ start: new Date(blockStart), maxAvailable });
    }
  }

  // Gaps between events
  for (let i = 0; i < dayEvents.length - 1; i++) {
    const current = dayEvents[i];
    const next = dayEvents[i + 1];
    if (current && next && current.end < next.start) {
      const maxAvailable =
        (next.start.getTime() - current.end.getTime()) / 60000;
      if (maxAvailable >= minDurationMinutes) {
        slots.push({ start: new Date(current.end), maxAvailable });
      }
    }
  }

  // Gap after last event
  const lastEvent = dayEvents[dayEvents.length - 1];
  if (lastEvent && lastEvent.end < blockEnd) {
    const maxAvailable = (blockEnd.getTime() - lastEvent.end.getTime()) / 60000;
    if (maxAvailable >= minDurationMinutes) {
      slots.push({ start: new Date(lastEvent.end), maxAvailable });
    }
  }

  return slots;
}

/**
 * Get the later of two time strings (HH:MM format)
 */
function maxTime(a: string, b: string): string {
  return a >= b ? a : b;
}

/**
 * Get the earlier of two time strings (HH:MM format)
 */
function minTime(a: string, b: string): string {
  return a <= b ? a : b;
}

// ============================================================================
// UNIFIED SCHEDULER INTEGRATION
// ============================================================================

/**
 * Reschedule all habits and tasks in a workspace using the unified scheduler
 *
 * This is the recommended way to perform a full calendar re-optimization.
 * It ensures habits and tasks are scheduled in a coordinated manner with:
 * - Habits scheduled first by priority
 * - Tasks scheduled second by deadline + priority
 * - Smart duration optimization for habits
 * - Urgent task bumping for lower-priority habits
 */
export async function rescheduleWorkspace(
  supabase: SupabaseClient,
  wsId: string,
  options: {
    windowDays?: number;
    forceReschedule?: boolean;
  } = {}
): Promise<{
  scheduledHabits: number;
  scheduledTasks: number;
  bumpedHabits: number;
  warnings: string[];
}> {
  const result = await scheduleWorkspace(supabase, wsId, options);

  return {
    scheduledHabits:
      result.habits.events.length + result.rescheduledHabits.length,
    scheduledTasks: result.tasks.events.reduce(
      (sum, t) => sum + t.events.length,
      0
    ),
    bumpedHabits: result.tasks.bumpedHabits.length,
    warnings: result.warnings,
  };
}
