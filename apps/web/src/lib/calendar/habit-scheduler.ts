/**
 * Habit Scheduler
 *
 * Schedules habit occurrences on the calendar by creating events.
 * Integrates with the task scheduling system and respects workspace hour settings.
 */

import { getOccurrencesInRange } from '@tuturuuu/ai/scheduling';
import type { SupabaseClient } from '@tuturuuu/supabase';
import type {
  Habit,
  HabitCompletion,
  HabitStreak,
  TimeOfDayPreference,
} from '@tuturuuu/types/primitives/Habit';
import { getTimeRangeForPreference } from '@tuturuuu/types/primitives/Habit';
import { fetchHourSettings } from './task-scheduler';

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
 * Find an available time slot for a habit occurrence
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
): TimeSlot | null {
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
  let daySettings;
  switch (habit.calendar_hours) {
    case 'work_hours':
      daySettings =
        hourSettings.workHours[dayName as keyof typeof hourSettings.workHours];
      break;
    case 'meeting_hours':
      daySettings =
        hourSettings.meetingHours[
          dayName as keyof typeof hourSettings.meetingHours
        ];
      break;
    case 'personal_hours':
    default:
      daySettings =
        hourSettings.personalHours[
          dayName as keyof typeof hourSettings.personalHours
        ];
  }

  if (!daySettings?.enabled || !daySettings.timeBlocks?.length) {
    return null;
  }

  const duration = habit.duration_minutes;

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

  // If habit has ideal_time, try that first
  if (habit.ideal_time) {
    const [hours, minutes] = habit.ideal_time.split(':').map(Number);
    const idealStart = new Date(occurrenceDate);
    idealStart.setHours(hours || 0, minutes || 0, 0, 0);
    const idealEnd = new Date(idealStart);
    idealEnd.setMinutes(idealEnd.getMinutes() + duration);

    if (
      isSlotAvailable(idealStart, idealEnd, dayEvents, daySettings.timeBlocks)
    ) {
      return { start: idealStart, end: idealEnd };
    }
  }

  // If habit has time_preference, narrow down to that range
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

  // Find first available slot in preferred blocks
  for (const block of preferredBlocks) {
    const slot = findSlotInBlock(occurrenceDate, block, duration, dayEvents);
    if (slot) return slot;
  }

  // Fall back to any available slot in the day's time blocks
  for (const block of daySettings.timeBlocks) {
    const slot = findSlotInBlock(occurrenceDate, block, duration, dayEvents);
    if (slot) return slot;
  }

  return null;
}

/**
 * Find an available slot within a time block
 */
function findSlotInBlock(
  date: Date,
  block: { startTime: string; endTime: string },
  durationMinutes: number,
  existingEvents: Array<{ start_at: string; end_at: string }>
): TimeSlot | null {
  const [startHour, startMin] = block.startTime.split(':').map(Number);
  const [endHour, endMin] = block.endTime.split(':').map(Number);

  const blockStart = new Date(date);
  blockStart.setHours(startHour || 0, startMin || 0, 0, 0);

  const blockEnd = new Date(date);
  blockEnd.setHours(endHour || 23, endMin || 59, 0, 0);

  // Try every 15 minutes
  let currentTime = new Date(blockStart);

  while (
    currentTime.getTime() + durationMinutes * 60000 <=
    blockEnd.getTime()
  ) {
    const slotEnd = new Date(currentTime);
    slotEnd.setMinutes(slotEnd.getMinutes() + durationMinutes);

    const hasConflict = existingEvents.some((event) => {
      const eventStart = new Date(event.start_at);
      const eventEnd = new Date(event.end_at);
      // Check overlap
      return currentTime < eventEnd && slotEnd > eventStart;
    });

    if (!hasConflict) {
      return { start: new Date(currentTime), end: slotEnd };
    }

    // Move to next 15-minute slot
    currentTime.setMinutes(currentTime.getMinutes() + 15);
  }

  return null;
}

/**
 * Check if a slot is available
 */
function isSlotAvailable(
  start: Date,
  end: Date,
  existingEvents: Array<{ start_at: string; end_at: string }>,
  timeBlocks: Array<{ startTime: string; endTime: string }>
): boolean {
  // Check if within allowed time blocks
  const [startHour, startMin] = [start.getHours(), start.getMinutes()];
  const [endHour, endMin] = [end.getHours(), end.getMinutes()];
  const startTimeStr = `${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}`;
  const endTimeStr = `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;

  const inBlock = timeBlocks.some(
    (block) => startTimeStr >= block.startTime && endTimeStr <= block.endTime
  );

  if (!inBlock) return false;

  // Check for conflicts with existing events
  return !existingEvents.some((event) => {
    const eventStart = new Date(event.start_at);
    const eventEnd = new Date(event.end_at);
    return start < eventEnd && end > eventStart;
  });
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
