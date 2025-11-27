/**
 * Task Scheduler
 *
 * Schedules tasks on the calendar by creating events.
 * Integrates with the habit scheduling system via the unified scheduler.
 *
 * This module has been updated to use:
 * - Priority-based scheduling with deadline inference
 * - Unified scheduling for coordinated habit/task scheduling
 * - Habit bumping for urgent tasks
 */

import {
  convertHourSettingsToActiveHours,
  convertWebEventsToLocked,
  convertWebTaskToSchedulerTask,
  getEffectivePriority,
  scheduleTasks,
} from '@tuturuuu/ai/scheduling';
import type { SupabaseClient } from '@tuturuuu/supabase';
import type { CalendarHoursType, TaskWithScheduling } from '@tuturuuu/types';
import { scheduleWorkspace } from './unified-scheduler';

type TimeBlock = {
  startTime: string;
  endTime: string;
};

type DayTimeRange = {
  enabled: boolean;
  timeBlocks: TimeBlock[];
};

type WeekTimeRanges = {
  monday: DayTimeRange;
  tuesday: DayTimeRange;
  wednesday: DayTimeRange;
  thursday: DayTimeRange;
  friday: DayTimeRange;
  saturday: DayTimeRange;
  sunday: DayTimeRange;
};

type HoursSettingsData = {
  personalHours: WeekTimeRanges;
  workHours: WeekTimeRanges;
  meetingHours: WeekTimeRanges;
};

type TimeSlot = {
  start: Date;
  end: Date;
  durationMinutes: number;
};

type ScheduleResult = {
  success: boolean;
  events: Array<{
    id: string;
    title: string;
    start_at: string;
    end_at: string;
    task_id: string;
  }>;
  links: Array<{
    task_id: string;
    event_id: string;
    scheduled_minutes: number;
  }>;
  totalScheduledMinutes: number;
  message: string;
  warning?: string; // e.g., "Some events scheduled after deadline"
};

type SlotFindingOptions = {
  searchStartDate?: Date; // When to start searching for slots
  taskStartDate?: Date | null; // Don't schedule before this date (task start constraint)
  taskEndDate?: Date | null; // Prefer scheduling before this (deadline)
  maxDaysToSearch?: number;
};

// Default hours: 7am-11pm every day
const DEFAULT_WEEK_RANGES: WeekTimeRanges = {
  monday: {
    enabled: true,
    timeBlocks: [{ startTime: '07:00', endTime: '23:00' }],
  },
  tuesday: {
    enabled: true,
    timeBlocks: [{ startTime: '07:00', endTime: '23:00' }],
  },
  wednesday: {
    enabled: true,
    timeBlocks: [{ startTime: '07:00', endTime: '23:00' }],
  },
  thursday: {
    enabled: true,
    timeBlocks: [{ startTime: '07:00', endTime: '23:00' }],
  },
  friday: {
    enabled: true,
    timeBlocks: [{ startTime: '07:00', endTime: '23:00' }],
  },
  saturday: {
    enabled: true,
    timeBlocks: [{ startTime: '07:00', endTime: '23:00' }],
  },
  sunday: {
    enabled: true,
    timeBlocks: [{ startTime: '07:00', endTime: '23:00' }],
  },
};

/**
 * Fetch hour settings for a workspace
 * Returns default settings (7am-11pm every day) if no workspace settings exist
 */
export async function fetchHourSettings(
  supabase: SupabaseClient,
  wsId: string
): Promise<HoursSettingsData> {
  const { data, error } = await supabase
    .from('workspace_calendar_hour_settings')
    .select('*')
    .eq('ws_id', wsId);

  // If error or no data, return default settings
  if (error) {
    console.error('Error fetching hour settings:', error);
  }

  // Return defaults if no workspace settings exist
  if (!data || data.length === 0) {
    return {
      personalHours: DEFAULT_WEEK_RANGES,
      workHours: DEFAULT_WEEK_RANGES,
      meetingHours: DEFAULT_WEEK_RANGES,
    };
  }

  const parseData = (raw: unknown): WeekTimeRanges | null => {
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
    return raw as WeekTimeRanges;
  };

  const personalData = parseData(
    data.find((h: any) => h.type === 'PERSONAL')?.data
  );
  const workData = parseData(data.find((h: any) => h.type === 'WORK')?.data);
  const meetingData = parseData(
    data.find((h: any) => h.type === 'MEETING')?.data
  );

  return {
    personalHours: personalData || DEFAULT_WEEK_RANGES,
    workHours: workData || DEFAULT_WEEK_RANGES,
    meetingHours: meetingData || DEFAULT_WEEK_RANGES,
  };
}

/**
 * Fetch existing calendar events for a workspace
 * Gets all events that overlap with the search window (including events that started before but are ongoing)
 */
async function fetchExistingEvents(
  supabase: SupabaseClient,
  wsId: string,
  startDate: Date,
  endDate: Date
): Promise<Array<{ start_at: string; end_at: string }>> {
  // Fetch events that overlap with the search window:
  // - end_at > startDate (event hasn't ended before our search starts)
  // - start_at < endDate (event starts before our search window ends)
  const { data } = await supabase
    .from('workspace_calendar_events')
    .select('start_at, end_at')
    .eq('ws_id', wsId)
    .gt('end_at', startDate.toISOString())
    .lt('start_at', endDate.toISOString());

  return data || [];
}

/**
 * Find available time slots for a task within hour settings
 * Uses the AI package's deadline-first algorithm which:
 * - Collects ALL available slots first
 * - Prioritizes slots that end before the deadline
 * - Only falls back to after-deadline slots if necessary
 */
export function findAvailableSlotsForTask(
  task: TaskWithScheduling,
  hourSettings: HoursSettingsData,
  existingEvents: Array<{ start_at: string; end_at: string }>,
  options: SlotFindingOptions = {}
): { slots: TimeSlot[]; scheduledPastDeadline: boolean } {
  const { taskStartDate, taskEndDate } = options;

  const scheduledMinutes = task.scheduled_minutes ?? 0;
  const totalMinutes = (task.total_duration ?? 0) * 60;
  const remainingMinutes = totalMinutes - scheduledMinutes;

  if (remainingMinutes <= 0) return { slots: [], scheduledPastDeadline: false };

  // Convert task to AI package's WebTaskInput format
  const webTaskInput = {
    id: task.id,
    name: task.name ?? undefined,
    total_duration: task.total_duration ?? undefined,
    is_splittable: task.is_splittable ?? undefined,
    min_split_duration_minutes: task.min_split_duration_minutes ?? undefined,
    max_split_duration_minutes: task.max_split_duration_minutes ?? undefined,
    calendar_hours: task.calendar_hours ?? undefined,
    priority: task.priority ?? undefined,
    start_date: taskStartDate?.toISOString() ?? task.start_date ?? undefined,
    end_date: taskEndDate?.toISOString() ?? task.end_date ?? undefined,
  };

  // Convert hour settings to AI package's ActiveHours format
  const activeHours = convertHourSettingsToActiveHours({
    personalHours: hourSettings.personalHours,
    workHours: hourSettings.workHours,
    meetingHours: hourSettings.meetingHours,
  });

  // Convert existing events to AI package's locked events format
  const lockedEvents = convertWebEventsToLocked(existingEvents);

  // Convert task to scheduler format and run the algorithm
  const schedulerTask = convertWebTaskToSchedulerTask(
    webTaskInput,
    scheduledMinutes
  );
  const result = scheduleTasks([schedulerTask], activeHours, lockedEvents);

  // Convert result events back to TimeSlot format
  const slots: TimeSlot[] = result.events
    .filter((e) => !e.locked)
    .map((e) => ({
      start: e.range.start.toDate(),
      end: e.range.end.toDate(),
      durationMinutes: e.range.end.diff(e.range.start, 'minute'),
    }));

  // Check if any events were scheduled past the deadline
  const scheduledPastDeadline = result.logs.some(
    (log) => log.type === 'warning' && log.message.includes('past its deadline')
  );

  return { slots, scheduledPastDeadline };
}

/**
 * Schedule a task by creating calendar events
 * Re-optimizes by removing future events and re-scheduling from scratch
 */
export async function scheduleTask(
  supabase: SupabaseClient,
  wsId: string,
  task: TaskWithScheduling
): Promise<ScheduleResult> {
  // Fetch hour settings (returns defaults if none configured)
  const hourSettings = await fetchHourSettings(supabase, wsId);

  const totalMinutes = (task.total_duration ?? 0) * 60;
  const now = new Date();

  // Re-optimization: Remove existing future events for this task and recalculate
  let pastMinutes = 0;
  try {
    // Get existing events linked to this task
    const { data: existingLinks } = await (supabase as any)
      .from('task_calendar_events')
      .select(`
        event_id,
        scheduled_minutes,
        workspace_calendar_events!inner(start_at)
      `)
      .eq('task_id', task.id);

    if (existingLinks && existingLinks.length > 0) {
      const futureEventIds: string[] = [];

      for (const link of existingLinks) {
        const eventStartAt = link.workspace_calendar_events?.start_at;
        if (eventStartAt) {
          const eventStart = new Date(eventStartAt);
          if (eventStart >= now) {
            // Future event - mark for deletion
            futureEventIds.push(link.event_id);
          } else {
            // Past event - keep and count the minutes
            pastMinutes += link.scheduled_minutes ?? 0;
          }
        }
      }

      // Delete future events (cascade will handle junction table)
      if (futureEventIds.length > 0) {
        await supabase
          .from('workspace_calendar_events')
          .delete()
          .in('id', futureEventIds);
      }
    }
  } catch (error) {
    console.error('Error during re-optimization:', error);
    // Continue with scheduling even if re-optimization fails
  }

  // Calculate remaining duration to schedule (accounting for past completed events)
  const remainingMinutes = totalMinutes - pastMinutes;

  if (remainingMinutes <= 0) {
    return {
      success: true,
      events: [],
      links: [],
      totalScheduledMinutes: totalMinutes,
      message: 'Task is already fully scheduled',
    };
  }

  // Parse task date constraints
  const taskStartDate = task.start_date ? new Date(task.start_date) : null;
  const taskEndDate = task.end_date ? new Date(task.end_date) : null;

  // Always start searching from today (or task start date if later)
  // This fills up the calendar ASAP
  // Urgent tasks will bump less urgent ones via the priority logic below
  let searchStartDate = new Date(now);

  // Only respect task start date constraint (don't delay for deadline)
  if (taskStartDate && taskStartDate > searchStartDate) {
    searchStartDate = new Date(taskStartDate);
  }

  // Fetch existing events for the next 4 weeks (28 days)
  const eventsFetchStart = new Date(now);
  const eventsFetchEnd = new Date(now);
  eventsFetchEnd.setDate(eventsFetchEnd.getDate() + 28);
  let existingEvents = await fetchExistingEvents(
    supabase,
    wsId,
    eventsFetchStart,
    eventsFetchEnd
  );

  // For urgent tasks (deadline <= 48 hours), check if we need to move less urgent task events
  const isUrgent =
    taskEndDate &&
    (taskEndDate.getTime() - now.getTime()) / (1000 * 60 * 60) <= 48;
  const tasksToReschedule: string[] = []; // Track tasks that need re-scheduling

  if (isUrgent && taskEndDate) {
    // Find events from other tasks that have later deadlines and are blocking our urgent time window
    try {
      const urgentWindowEnd = new Date(taskEndDate);

      // Get events in our urgent window that are linked to tasks with later deadlines
      const { data: blockingEvents } = await (supabase as any)
        .from('task_calendar_events')
        .select(`
          event_id,
          task_id,
          tasks!inner(id, end_date, auto_schedule),
          workspace_calendar_events!inner(id, start_at, end_at)
        `)
        .neq('task_id', task.id)
        .gt('workspace_calendar_events.end_at', now.toISOString())
        .lt(
          'workspace_calendar_events.start_at',
          urgentWindowEnd.toISOString()
        );

      if (blockingEvents && blockingEvents.length > 0) {
        // Filter to events from tasks with later deadlines (or no deadline)
        const eventsToMove: string[] = [];

        for (const be of blockingEvents) {
          const otherTaskEndDate = be.tasks?.end_date
            ? new Date(be.tasks.end_date)
            : null;

          // Move event if: other task has no deadline, or deadline is after our urgent task's deadline
          if (!otherTaskEndDate || otherTaskEndDate > taskEndDate) {
            eventsToMove.push(be.event_id);

            // Track tasks with auto_schedule enabled for re-scheduling
            if (
              be.tasks?.auto_schedule &&
              !tasksToReschedule.includes(be.task_id)
            ) {
              tasksToReschedule.push(be.task_id);
            }
          }
        }

        // Delete blocking events from less urgent tasks
        if (eventsToMove.length > 0) {
          await supabase
            .from('workspace_calendar_events')
            .delete()
            .in('id', eventsToMove);

          // Re-fetch existing events after clearing blocking ones
          existingEvents = await fetchExistingEvents(
            supabase,
            wsId,
            eventsFetchStart,
            eventsFetchEnd
          );
        }
      }
    } catch (error) {
      console.error('Error checking for blocking events:', error);
      // Continue with scheduling even if this optimization fails
    }
  }

  // Update task's scheduled_minutes to reflect only past events
  const updatedTask = {
    ...task,
    scheduled_minutes: pastMinutes,
  };

  // Find available slots with date constraints
  const { slots, scheduledPastDeadline } = findAvailableSlotsForTask(
    updatedTask,
    hourSettings,
    existingEvents,
    {
      searchStartDate,
      taskStartDate,
      taskEndDate,
      maxDaysToSearch: 28,
    }
  );

  if (slots.length === 0) {
    return {
      success: false,
      events: [],
      links: [],
      totalScheduledMinutes: pastMinutes,
      message: 'No available time slots found in the next 4 weeks',
      warning:
        taskEndDate && taskEndDate < now
          ? 'Task deadline has passed'
          : undefined,
    };
  }

  // Create calendar events for each slot
  const createdEvents: ScheduleResult['events'] = [];
  const createdLinks: ScheduleResult['links'] = [];
  let newScheduledMinutes = 0;

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!slot) continue;

    const eventTitle =
      slots.length > 1
        ? `${task.name || 'Task'} (${i + 1}/${slots.length})`
        : task.name || 'Task';

    // Create calendar event
    // Note: task_id is optional - only include if the column exists
    const eventData: Record<string, unknown> = {
      ws_id: wsId,
      title: eventTitle,
      description: task.description || '',
      start_at: slot.start.toISOString(),
      end_at: slot.end.toISOString(),
      color: getColorForHourType(task.calendar_hours),
    };

    const { data: event, error: eventError } = await supabase
      .from('workspace_calendar_events')
      .insert(eventData)
      .select()
      .single();

    if (eventError || !event) {
      console.error('Error creating event:', eventError);
      continue;
    }

    createdEvents.push({
      id: event.id,
      title: eventTitle,
      start_at: slot.start.toISOString(),
      end_at: slot.end.toISOString(),
      task_id: task.id,
    });

    // Track scheduled minutes (event was created successfully)
    newScheduledMinutes += slot.durationMinutes;

    // Try to create junction table entry (optional - table may not exist yet)
    try {
      const { error: linkError } = await (supabase as any)
        .from('task_calendar_events')
        .insert({
          task_id: task.id,
          event_id: event.id,
          scheduled_minutes: slot.durationMinutes,
          completed: false,
        });

      if (!linkError) {
        createdLinks.push({
          task_id: task.id,
          event_id: event.id,
          scheduled_minutes: slot.durationMinutes,
        });
      }
    } catch {
      // Junction table may not exist yet - silently ignore
    }
  }

  const totalNowScheduled = pastMinutes + newScheduledMinutes;
  const isFullyScheduled = totalNowScheduled >= totalMinutes;

  return {
    success: createdEvents.length > 0,
    events: createdEvents,
    links: createdLinks,
    totalScheduledMinutes: totalNowScheduled,
    message: isFullyScheduled
      ? `Task fully scheduled with ${createdEvents.length} event(s)`
      : `Scheduled ${newScheduledMinutes} minutes across ${createdEvents.length} event(s). ${totalMinutes - totalNowScheduled} minutes remaining.`,
    warning: scheduledPastDeadline
      ? 'Some events scheduled after the deadline'
      : undefined,
  };
}

/**
 * Get a color for the calendar event based on hour type
 * Returns a valid value from the calendar_event_colors table
 */
function getColorForHourType(hourType?: CalendarHoursType | null): string {
  switch (hourType) {
    case 'work_hours':
      return 'BLUE';
    case 'meeting_hours':
      return 'CYAN';
    case 'personal_hours':
      return 'GREEN';
    default:
      return 'BLUE';
  }
}

/**
 * Reschedule all tasks with auto_schedule enabled in a workspace
 *
 * This function now uses the unified scheduler which:
 * 1. Schedules habits FIRST (by priority)
 * 2. Schedules tasks SECOND (by deadline + priority)
 * 3. Allows urgent tasks to bump lower-priority habit events
 * 4. Reschedules bumped habits to next available slots
 *
 * This ensures coordinated scheduling between habits and tasks.
 */
export async function rescheduleAllAutoScheduleTasks(
  supabase: SupabaseClient,
  wsId: string,
  options: {
    useUnifiedScheduler?: boolean;
    windowDays?: number;
  } = {}
): Promise<{
  rescheduledCount: number;
  errors: string[];
  warnings: string[];
}> {
  const { useUnifiedScheduler = true, windowDays = 30 } = options;

  // Use unified scheduler by default for coordinated habit/task scheduling
  if (useUnifiedScheduler) {
    try {
      const result = await scheduleWorkspace(supabase, wsId, {
        windowDays,
        forceReschedule: true,
      });

      const rescheduledCount = result.tasks.events.filter(
        (t) => t.events.length > 0
      ).length;

      const warnings = [...result.warnings];

      // Add warnings for tasks that couldn't be scheduled
      for (const taskResult of result.tasks.events) {
        if (taskResult.warning) {
          warnings.push(
            `${taskResult.task.name || 'Task'}: ${taskResult.warning}`
          );
        }
      }

      return {
        rescheduledCount,
        errors: [],
        warnings,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error('Error in unified scheduler:', error);
      return {
        rescheduledCount: 0,
        errors: [errorMessage],
        warnings: [],
      };
    }
  }

  // Legacy task-only scheduling (deprecated, kept for backward compatibility)
  return rescheduleTasksOnly(supabase, wsId);
}

/**
 * Legacy task-only scheduling function
 * @deprecated Use rescheduleAllAutoScheduleTasks with useUnifiedScheduler: true instead
 */
async function rescheduleTasksOnly(
  supabase: SupabaseClient,
  wsId: string
): Promise<{
  rescheduledCount: number;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let rescheduledCount = 0;

  try {
    // 1. Fetch ALL auto-schedule tasks
    const { data: autoScheduleTasks, error } = await supabase
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
      console.error('Error fetching auto-schedule tasks:', error);
      return { rescheduledCount: 0, errors: [error.message], warnings: [] };
    }

    if (!autoScheduleTasks || autoScheduleTasks.length === 0) {
      return { rescheduledCount: 0, errors: [], warnings: [] };
    }

    // 2. Sort by effective priority (inferred from deadline if not set) then deadline
    const sortedTasks = [...autoScheduleTasks].sort((a: any, b: any) => {
      // Primary: Effective priority (highest first)
      const aPriority = getEffectivePriority({
        priority: a.priority,
        end_date: a.end_date,
      });
      const bPriority = getEffectivePriority({
        priority: b.priority,
        end_date: b.end_date,
      });

      const priorityOrder: Record<string, number> = {
        critical: 0,
        high: 1,
        normal: 2,
        low: 3,
      };

      const priorityDiff =
        (priorityOrder[aPriority] ?? 2) - (priorityOrder[bPriority] ?? 2);
      if (priorityDiff !== 0) return priorityDiff;

      // Secondary: Deadline (earliest first, null deadlines last)
      if (!a.end_date && !b.end_date) return 0;
      if (!a.end_date) return 1;
      if (!b.end_date) return -1;
      return new Date(a.end_date).getTime() - new Date(b.end_date).getTime();
    });

    // 3. Delete ALL future events from ALL these tasks first
    const taskIds = sortedTasks.map((t: any) => t.id);
    const now = new Date();

    try {
      const { data: allLinks } = await (supabase as any)
        .from('task_calendar_events')
        .select('event_id, task_id, workspace_calendar_events!inner(start_at)')
        .in('task_id', taskIds);

      if (allLinks && allLinks.length > 0) {
        const futureEventIds = allLinks
          .filter(
            (link: any) =>
              new Date(link.workspace_calendar_events.start_at) >= now
          )
          .map((link: any) => link.event_id);

        if (futureEventIds.length > 0) {
          await supabase
            .from('workspace_calendar_events')
            .delete()
            .in('id', futureEventIds);
        }
      }
    } catch (deleteError) {
      console.error('Error deleting future events:', deleteError);
      // Continue with scheduling even if deletion fails
    }

    // 4. Schedule each task in priority + deadline order
    for (const taskData of sortedTasks) {
      try {
        const result = await scheduleTask(
          supabase,
          wsId,
          taskData as TaskWithScheduling
        );
        if (result.success) {
          rescheduledCount++;
          if (result.warning) {
            warnings.push(`${taskData.name || 'Task'}: ${result.warning}`);
          }
        } else {
          errors.push(`${taskData.name || 'Task'}: ${result.message}`);
        }
      } catch (rescheduleError: unknown) {
        const errorMessage =
          rescheduleError instanceof Error
            ? rescheduleError.message
            : 'Unknown error';
        console.error(
          `Failed to re-schedule task ${taskData.id}:`,
          rescheduleError
        );
        errors.push(`${taskData.name || taskData.id}: ${errorMessage}`);
      }
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in rescheduleTasksOnly:', error);
    errors.push(errorMessage);
  }

  return { rescheduledCount, errors, warnings };
}

/**
 * Schedule multiple tasks in batch
 */
export async function scheduleTasksBatch(
  supabase: SupabaseClient,
  wsId: string,
  tasks: TaskWithScheduling[]
): Promise<{
  results: ScheduleResult[];
  totalScheduled: number;
  totalEvents: number;
}> {
  const results: ScheduleResult[] = [];
  let totalScheduled = 0;
  let totalEvents = 0;

  // Sort tasks by priority (if available) or by remaining duration
  const sortedTasks = [...tasks].sort((a, b) => {
    // Higher priority first
    const priorityOrder: Record<string, number> = {
      urgent: 0,
      high: 1,
      medium: 2,
      low: 3,
      none: 4,
    };
    const aPriority = priorityOrder[a.priority ?? 'none'] ?? 4;
    const bPriority = priorityOrder[b.priority ?? 'none'] ?? 4;
    if (aPriority !== bPriority) return aPriority - bPriority;

    // Then by remaining duration (smaller first)
    const aRemaining =
      (a.total_duration ?? 0) * 60 - (a.scheduled_minutes ?? 0);
    const bRemaining =
      (b.total_duration ?? 0) * 60 - (b.scheduled_minutes ?? 0);
    return aRemaining - bRemaining;
  });

  for (const task of sortedTasks) {
    const result = await scheduleTask(supabase, wsId, task);
    results.push(result);
    totalScheduled += result.totalScheduledMinutes;
    totalEvents += result.events.length;
  }

  return { results, totalScheduled, totalEvents };
}
