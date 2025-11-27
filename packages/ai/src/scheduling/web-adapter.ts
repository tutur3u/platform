/**
 * Web Adapter for Task Scheduling
 *
 * This module bridges the web app's task format to the scheduling algorithm.
 * It converts between web task format and the internal scheduler format.
 */

import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import dayjs from 'dayjs';
import { scheduleTasks } from './algorithm';
import type {
  ActiveHours,
  CalendarHoursType,
  DateRange,
  Event,
  Task,
  WebCalendarEvent,
  WebScheduleResult,
  WebTaskInput,
} from './types';

/**
 * Map web calendar hours type to scheduler category
 */
export function mapCalendarHoursToCategory(
  calendarHours: CalendarHoursType | null | undefined
): 'work' | 'personal' | 'meeting' {
  switch (calendarHours) {
    case 'personal_hours':
      return 'personal';
    case 'meeting_hours':
      return 'meeting';
    default:
      return 'work';
  }
}

/**
 * Convert web task format to scheduler task format
 */
export function convertWebTaskToSchedulerTask(
  task: WebTaskInput,
  existingScheduledMinutes: number = 0
): Task {
  const totalHours = task.total_duration ?? 0;
  const scheduledHours = existingScheduledMinutes / 60;
  const remainingHours = Math.max(0, totalHours - scheduledHours);

  // Convert minutes to hours for min/max duration
  const minDurationHours = (task.min_split_duration_minutes ?? 30) / 60;
  const maxDurationHours = (task.max_split_duration_minutes ?? 120) / 60;

  return {
    id: task.id,
    name: task.name || 'Task',
    duration: remainingHours,
    minDuration: minDurationHours,
    maxDuration: maxDurationHours,
    category: mapCalendarHoursToCategory(task.calendar_hours),
    priority: (task.priority as TaskPriority) ?? 'normal',
    deadline: task.end_date ? dayjs(task.end_date) : undefined,
    allowSplit: task.is_splittable ?? true,
  };
}

/**
 * Convert multiple web tasks to scheduler tasks, sorted by deadline
 */
export function convertWebTasksToSchedulerTasks(
  tasks: Array<{ task: WebTaskInput; existingScheduledMinutes?: number }>
): Task[] {
  return tasks
    .map(({ task, existingScheduledMinutes }) =>
      convertWebTaskToSchedulerTask(task, existingScheduledMinutes ?? 0)
    )
    .sort((a, b) => {
      // Sort by deadline (earliest first, null deadlines last)
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return a.deadline.valueOf() - b.deadline.valueOf();
    });
}

/**
 * Convert existing web calendar events to locked events format
 */
export function convertWebEventsToLocked(events: WebCalendarEvent[]): Event[] {
  return events.map((e, i) => ({
    id: e.id || `existing-${i}`,
    name: 'Existing Event',
    range: {
      start: dayjs(e.start_at),
      end: dayjs(e.end_at),
    },
    taskId: '',
    locked: true,
  }));
}

/**
 * Convert week time ranges to ActiveHours format
 * This converts the web app's hour settings to the scheduler's format
 */
export function convertHourSettingsToActiveHours(hourSettings: {
  personalHours?: {
    [day: string]: {
      enabled: boolean;
      timeBlocks: Array<{ startTime: string; endTime: string }>;
    };
  };
  workHours?: {
    [day: string]: {
      enabled: boolean;
      timeBlocks: Array<{ startTime: string; endTime: string }>;
    };
  };
  meetingHours?: {
    [day: string]: {
      enabled: boolean;
      timeBlocks: Array<{ startTime: string; endTime: string }>;
    };
  };
}): ActiveHours {
  const convertTimeBlocks = (
    hours:
      | {
          [day: string]: {
            enabled: boolean;
            timeBlocks: Array<{ startTime: string; endTime: string }>;
          };
        }
      | undefined
  ): DateRange[] => {
    if (!hours) {
      // Default: 9am-5pm
      return [
        {
          start: dayjs().hour(9).minute(0).second(0).millisecond(0),
          end: dayjs().hour(17).minute(0).second(0).millisecond(0),
        },
      ];
    }

    // For simplicity, we'll use the first enabled day's time blocks
    // In a more complex implementation, you'd handle per-day scheduling
    const ranges: DateRange[] = [];

    for (const dayConfig of Object.values(hours)) {
      if (dayConfig.enabled && dayConfig.timeBlocks.length > 0) {
        for (const block of dayConfig.timeBlocks) {
          const [startHour, startMin] = block.startTime.split(':').map(Number);
          const [endHour, endMin] = block.endTime.split(':').map(Number);

          ranges.push({
            start: dayjs()
              .hour(startHour ?? 9)
              .minute(startMin ?? 0)
              .second(0)
              .millisecond(0),
            end: dayjs()
              .hour(endHour ?? 17)
              .minute(endMin ?? 0)
              .second(0)
              .millisecond(0),
          });
        }
        break; // Use first enabled day's config
      }
    }

    if (ranges.length === 0) {
      // Fallback to default
      return [
        {
          start: dayjs().hour(9).minute(0).second(0).millisecond(0),
          end: dayjs().hour(17).minute(0).second(0).millisecond(0),
        },
      ];
    }

    return ranges;
  };

  return {
    personal: convertTimeBlocks(hourSettings.personalHours),
    work: convertTimeBlocks(hourSettings.workHours),
    meeting: convertTimeBlocks(hourSettings.meetingHours),
  };
}

/**
 * Schedule a single task using the AI package algorithm
 */
export function scheduleWebTask(
  task: WebTaskInput,
  existingEvents: WebCalendarEvent[],
  activeHours: ActiveHours,
  existingScheduledMinutes: number = 0
): WebScheduleResult {
  const schedulerTask = convertWebTaskToSchedulerTask(
    task,
    existingScheduledMinutes
  );
  const lockedEvents = convertWebEventsToLocked(existingEvents);

  const result = scheduleTasks([schedulerTask], activeHours, lockedEvents);

  // Convert result to web format
  const scheduledEvents = result.events.filter((e) => !e.locked);
  const totalScheduledMinutes = scheduledEvents.reduce((sum, e) => {
    const durationMinutes = e.range.end.diff(e.range.start, 'minute');
    return sum + durationMinutes;
  }, 0);

  const pastDeadlineWarnings = result.logs.filter(
    (log) => log.type === 'warning' && log.message.includes('past its deadline')
  );

  return {
    success: scheduledEvents.length > 0,
    events: scheduledEvents.map((e) => ({
      id: e.id,
      title: e.name,
      start_at: e.range.start.toISOString(),
      end_at: e.range.end.toISOString(),
      task_id: task.id,
      partNumber: e.partNumber,
      totalParts: e.totalParts,
    })),
    totalScheduledMinutes: existingScheduledMinutes + totalScheduledMinutes,
    message:
      scheduledEvents.length > 0
        ? `Scheduled ${totalScheduledMinutes} minutes across ${scheduledEvents.length} event(s)`
        : 'No available time slots found',
    warning:
      pastDeadlineWarnings.length > 0
        ? 'Some events scheduled after the deadline'
        : undefined,
    logs: result.logs,
  };
}

/**
 * Schedule multiple tasks using the AI package algorithm
 * Tasks are scheduled in deadline order (earliest first)
 */
export function scheduleWebTasks(
  tasks: Array<{ task: WebTaskInput; existingScheduledMinutes?: number }>,
  existingEvents: WebCalendarEvent[],
  activeHours: ActiveHours
): WebScheduleResult[] {
  const schedulerTasks = convertWebTasksToSchedulerTasks(tasks);
  const lockedEvents = convertWebEventsToLocked(existingEvents);

  const result = scheduleTasks(schedulerTasks, activeHours, lockedEvents);

  // Group events by task ID
  const eventsByTask = new Map<string, Event[]>();
  for (const event of result.events) {
    if (event.locked) continue;
    const taskEvents = eventsByTask.get(event.taskId) || [];
    taskEvents.push(event);
    eventsByTask.set(event.taskId, taskEvents);
  }

  // Convert to web results for each task
  return tasks.map(({ task, existingScheduledMinutes = 0 }) => {
    const taskEvents = eventsByTask.get(task.id) || [];
    const totalScheduledMinutes = taskEvents.reduce((sum, e) => {
      const durationMinutes = e.range.end.diff(e.range.start, 'minute');
      return sum + durationMinutes;
    }, 0);

    const taskLogs = result.logs.filter((log) =>
      log.message.includes(task.name || task.id)
    );
    const pastDeadlineWarnings = taskLogs.filter(
      (log) =>
        log.type === 'warning' && log.message.includes('past its deadline')
    );

    return {
      success: taskEvents.length > 0,
      events: taskEvents.map((e) => ({
        id: e.id,
        title: e.name,
        start_at: e.range.start.toISOString(),
        end_at: e.range.end.toISOString(),
        task_id: task.id,
        partNumber: e.partNumber,
        totalParts: e.totalParts,
      })),
      totalScheduledMinutes: existingScheduledMinutes + totalScheduledMinutes,
      message:
        taskEvents.length > 0
          ? `Scheduled ${totalScheduledMinutes} minutes across ${taskEvents.length} event(s)`
          : 'No available time slots found',
      warning:
        pastDeadlineWarnings.length > 0
          ? 'Some events scheduled after the deadline'
          : undefined,
      logs: taskLogs,
    };
  });
}
