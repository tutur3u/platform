import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import dayjs from 'dayjs';
import minMax from 'dayjs/plugin/minMax.js';
import { v4 as uuidv4 } from 'uuid';
import { defaultActiveHours } from './default.js';
import type {
  ActiveHours,
  DateRange,
  EnergyProfile,
  Event,
  Log,
  ScheduleResult,
  SchedulingSettings,
  Task,
  TimeOfDayPreference,
} from './types.js';

/**
 * Extended task type used internally for scheduling with additional tracking fields
 */
interface TaskPoolItem extends Task {
  remaining: number;
  nextPart: number;
  scheduledParts: number;
  priorityScore: number;
}

/**
 * Check if a given time matches the user's time of day preference
 */
function matchesTimePreference(
  time: dayjs.Dayjs,
  preference?: TimeOfDayPreference
): boolean {
  if (!preference) return true;

  const hour = time.hour();
  switch (preference) {
    case 'morning':
      return hour >= 6 && hour < 12;
    case 'afternoon':
      return hour >= 12 && hour < 17;
    case 'evening':
      return hour >= 17 && hour < 21;
    case 'night':
      return hour >= 21 || hour < 6;
    default:
      return true;
  }
}

dayjs.extend(minMax);

// Helper function to round time to nearest 15-minute increment
function roundToQuarterHour(
  time: dayjs.Dayjs,
  roundUp: boolean = false
): dayjs.Dayjs {
  const minutes = time.minute();
  const remainder = minutes % 15;

  if (remainder === 0) {
    return time.second(0).millisecond(0);
  }

  let targetMinute: number;
  if (roundUp) {
    targetMinute = minutes + (15 - remainder);
  } else {
    targetMinute = minutes - remainder;
  }

  return time.minute(targetMinute).second(0).millisecond(0);
}

// Helper function to convert hours to 15-minute increments
function hoursToQuarterHours(hours: number): number {
  return Math.round(hours * 4) / 4; // Round to nearest quarter hour
}

// Helper function to ensure duration is at least 15 minutes
function ensureMinimumDuration(hours: number): number {
  return Math.max(0.25, hoursToQuarterHours(hours)); // Minimum 15 minutes
}

export const scheduleWithFlexibleEvents = (
  flexibleEvents: Event[],
  lockedEvents: Event[],
  activeHours: ActiveHours
): ScheduleResult => {
  const now = dayjs();
  const futureFlexibleEvents = flexibleEvents.filter((event) =>
    dayjs(event.range.end).isAfter(now)
  );

  const futureLockedEvents = lockedEvents.filter((event) =>
    dayjs(event.range.end).isAfter(now)
  );

  if (flexibleEvents.length !== futureFlexibleEvents.length) {
    console.log(
      `[Scheduler] Skipped ${flexibleEvents.length - futureFlexibleEvents.length} past flexible events.`
    );
  }
  if (lockedEvents.length !== futureLockedEvents.length) {
    console.log(
      `[Scheduler] Skipped ${lockedEvents.length - futureLockedEvents.length} past locked events.`
    );
  }

  // Now, promote tasks ONLY from the filtered list of future flexible events.
  // We add .filter(Boolean) as a safety measure to remove any potential `null`
  // values if promoteEventToTask is updated to return them.
  const promotedTasks = futureFlexibleEvents
    .map(promoteEventToTask)
    .filter((task): task is Task => task !== null);

  console.log(
    `[Scheduler] Promoted ${promotedTasks.length} flexible events to tasks.`
  );

  const result = scheduleTasks(promotedTasks, activeHours, futureLockedEvents);

  return result;
};

export const prepareTaskChunks = (tasks: Task[]): Task[] => {
  const chunks: Task[] = [];
  for (const task of tasks) {
    if (
      task.allowSplit === false ||
      !task.maxDuration ||
      task.maxDuration <= 0
    ) {
      chunks.push(task);
      continue;
    }
    let remainingDuration = task.duration;
    let partNumber = 1;
    const totalParts = Math.ceil(task.duration / task.maxDuration);
    while (remainingDuration > 0) {
      const partDuration = Math.min(remainingDuration, task.maxDuration);
      chunks.push({
        ...task,
        name:
          totalParts > 1
            ? `${task.name} (Part ${partNumber}/${totalParts})`
            : task.name,
        duration: partDuration,
        minDuration: partDuration,
        priority: task.priority,
        maxDuration: partDuration,
        allowSplit: false,
      });
      remainingDuration -= partDuration;
      partNumber++;
    }
  }
  return chunks;
};
// Helper function to calculate task priority score
function calculatePriorityScore(task: Task): number {
  const now = dayjs();
  let score = 0;

  // Base priority score (higher = more important)
  const priorityScores: Record<TaskPriority, number> = {
    critical: 1000,
    high: 750,
    normal: 500,
    low: 250,
  };
  score += (priorityScores as Record<string, number>)[task.priority] || 0;

  // Streak bonus (for habits) - Add 10 points per streak day, capped at 200
  if (task.isHabit && task.streak) {
    score += Math.min(200, task.streak * 10);
  }

  // Deadline urgency bonus
  if (task.deadline) {
    const deadlineAsDayjs = dayjs(task.deadline);
    const hoursUntilDeadline = deadlineAsDayjs.diff(now, 'hour', true);

    if (hoursUntilDeadline < 0) {
      // Overdue tasks get maximum urgency
      score += 2000;
    } else if (hoursUntilDeadline < 24) {
      // Due within 24 hours
      score += 1500;
    } else if (hoursUntilDeadline < 72) {
      // Due within 3 days
      score += 1000;
    } else if (hoursUntilDeadline < 168) {
      // Due within a week
      score += 500;
    } else {
      score += 100; // Due later than a week
    }
  }

  return score;
}

/**
 * Check if a given time is within the user's peak energy window
 */
function isPeakHour(time: dayjs.Dayjs, profile?: EnergyProfile): boolean {
  if (!profile) return true;

  const hour = time.hour();
  switch (profile) {
    case 'morning_person':
      return hour >= 8 && hour < 12;
    case 'night_owl':
      return hour >= 20 || hour < 2;
    case 'afternoon_peak':
      return hour >= 13 && hour < 17;
    case 'evening_peak':
      return hour >= 18 && hour < 22;
    default:
      return true;
  }
}

/**
 * Calculate the reason for a task being scheduled at a specific time
 */
function calculateSchedulingReason(
  task: TaskPoolItem,
  time: dayjs.Dayjs,
  profile?: EnergyProfile
): string {
  if (task.energyLoad === 'high' && isPeakHour(time, profile)) {
    return 'Peak energy alignment';
  }
  if (task.priority === 'critical' || task.priority === 'high') {
    return 'Priority prioritization';
  }
  if (task.isHabit && task.streak && task.streak > 0) {
    return `Streak maintenance (${task.streak} days)`;
  }
  if (task.timePreference && matchesTimePreference(time, task.timePreference)) {
    return 'Time preference alignment';
  }
  return 'Available slot';
}

export const promoteEventToTask = (event: Event): Task | null => {
  const start = dayjs(event.range.start);
  const end = dayjs(event.range.end);

  if (
    !start.isValid() ||
    !end.isValid() ||
    end.isBefore(start) ||
    !event.name
  ) {
    console.warn(`[Promote] Skipping invalid event: ${event.name}`);
    return null;
  }

  const durationInHours = end.diff(start, 'minute') / 60;

  // Ensure minimum scheduling duration (0.25h = 15 mins)
  const duration = Math.max(0.25, parseFloat(durationInHours.toFixed(2)));

  return {
    id: event.id,
    name: event.name,
    duration,
    minDuration: duration,
    maxDuration: duration,
    allowSplit: false,
    category: 'work',
    priority: 'normal',
    deadline: end,
  };
};

export const scheduleTasks = (
  tasks: Task[],
  activeHours: ActiveHours = defaultActiveHours,
  lockedEvents: Event[] = [],
  settings?: {
    energyProfile?: EnergyProfile;
    schedulingSettings?: SchedulingSettings;
  }
): ScheduleResult => {
  const scheduledEvents: Event[] = lockedEvents.map((e) => ({
    ...e,
    locked: true,
  }));
  const logs: Log[] = [];
  const minBuffer = settings?.schedulingSettings?.min_buffer || 0;
  let taskPool: TaskPoolItem[] = [];
  try {
    taskPool = tasks.map((task) => ({
      ...task,
      duration: hoursToQuarterHours(task.duration),
      minDuration: ensureMinimumDuration(task.minDuration),
      maxDuration: hoursToQuarterHours(task.maxDuration),
      remaining: hoursToQuarterHours(task.duration),
      nextPart: 1,
      scheduledParts: 0,
      priorityScore: calculatePriorityScore(task),
    }));
  } catch (error) {
    console.error('Error preparing task pool:', error);
    return {
      events: [],
      logs: [{ type: 'error', message: 'Failed to prepare task pool.' }],
    };
  }
  // Sort by priority score (highest first) and then by deadline
  taskPool.sort((a, b) => {
    // First sort by priority score (highest first)
    if (a.priorityScore !== b.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }

    const aDeadline = a.deadline ? dayjs(a.deadline) : null;
    const bDeadline = b.deadline ? dayjs(b.deadline) : null;
    // If priority scores are equal, sort by deadline (earliest first)
    if (aDeadline && bDeadline) {
      return aDeadline.isBefore(bDeadline) ? -1 : 1;
    }
    if (a.deadline) return -1;
    if (b.deadline) return 1;

    // If no deadlines, sort by duration (longer tasks first)
    return b.duration - a.duration;
  });

  try {
    const now = dayjs();
    const availableTimes: Record<keyof ActiveHours, dayjs.Dayjs> = {
      work: getNextAvailableTime(activeHours.work, now),
      personal: getNextAvailableTime(activeHours.personal, now),
      meeting: getNextAvailableTime(activeHours.meeting, now),
    };

    let attempts = 0;
    const maxAttempts = 2000;

    while (taskPool.some((t) => t.remaining > 0) && attempts < maxAttempts) {
      attempts++;
      let anyScheduled = false;

      for (const task of taskPool) {
        if (task.remaining <= 0) continue;
        const categoryHours =
          activeHours[task.category as keyof ActiveHours] ?? activeHours.work;
        if (!categoryHours || categoryHours.length === 0) {
          logs.push({
            type: 'error',
            message: `No ${task.category} hours defined for task "${task.name}".`,
          });
          task.remaining = 0;
          continue;
        }

        // Non-splittable: try to schedule as a single block
        if (task.allowSplit === false) {
          if (task.scheduledParts > 0) continue; // Already tried
          let scheduled = false;
          let tryTime =
            availableTimes[task.category as keyof ActiveHours] ??
            availableTimes.work;
          let blockAttempts = 0;
          let scheduledAfterDeadline = false;
          while (!scheduled && blockAttempts < 50) {
            blockAttempts++;
            const availableSlots = getAvailableSlots(
              tryTime,
              categoryHours,
              scheduledEvents,
              minBuffer
            );

            const fitsTask = (s: DateRange) => {
              const slotDuration = s.end.diff(s.start, 'hour', true);
              const fitsTime = task.deadline
                ? slotDuration >= task.duration &&
                  (s.end.isBefore(task.deadline) || s.end.isSame(task.deadline))
                : slotDuration >= task.duration;

              if (!fitsTime) return false;

              // Smart Adaptive Windows: ensure it matches time preference if set
              return matchesTimePreference(s.start, task.timePreference);
            };

            // Try to find a slot that fits, preferring peak hours for high-load tasks
            let slot = availableSlots.find(
              (s) =>
                fitsTask(s) &&
                (task.energyLoad !== 'high' ||
                  isPeakHour(s.start, settings?.energyProfile))
            );

            // If high load task couldn't find a peak slot, just find any slot that fits before deadline
            if (!slot && task.energyLoad === 'high') {
              slot = availableSlots.find(fitsTask);
            }

            // If still not found, allow after deadline
            if (!slot) {
              slot = availableSlots.find((s) => {
                const slotDuration = s.end.diff(s.start, 'hour', true);
                return (
                  slotDuration >= task.duration &&
                  matchesTimePreference(s.start, task.timePreference)
                );
              });
              if (slot) scheduledAfterDeadline = true;
            }

            if (slot) {
              const partStart = roundToQuarterHour(slot.start, false);
              const partEnd = partStart.add(task.duration, 'hour');
              const newEvent: Event = {
                id: `${task.id}`,
                name: task.name,
                range: { start: partStart, end: partEnd },
                locked: false,
                taskId: task.id,
                reason: calculateSchedulingReason(
                  task,
                  partStart,
                  settings?.energyProfile
                ),
              };
              if (
                (task.deadline && partEnd.isAfter(task.deadline)) ||
                scheduledAfterDeadline
              ) {
                logs.push({
                  type: 'warning',
                  message: `Task "${task.name}" is scheduled past its deadline of ${task.deadline}.`,
                });
              }
              scheduledEvents.push(newEvent);

              availableTimes[task.category as keyof ActiveHours] =
                roundToQuarterHour(partEnd.add(minBuffer, 'minute'), true) ??
                availableTimes.work;
              scheduled = true;
              task.remaining = 0;
              task.scheduledParts = 1;
              anyScheduled = true;
            } else {
              tryTime = tryTime.add(1, 'day').startOf('day');
              tryTime = getNextAvailableTime(categoryHours, tryTime);
              logs.push({
                type: 'warning',
                message: `Moving task "${task.name}" to ${tryTime.format('YYYY-MM-DD')} due to lack of available time slots for non-splittable task.`,
              });
            }
          }
          if (!scheduled) {
            logs.push({
              type: 'error',
              message: `Task "${task.name}" could not be scheduled as a single block after 50 attempts.`,
            });
            task.remaining = 0;
          }
          continue;
        }

        // Splittable: try to schedule the next part
        let scheduledPart = false;
        let tryTime =
          availableTimes[task.category as keyof ActiveHours] ??
          availableTimes.work;
        let splitAttempts = 0;
        while (task.remaining > 0 && splitAttempts < 50 && !scheduledPart) {
          splitAttempts++;
          const availableSlots = getAvailableSlots(
            tryTime,
            categoryHours,
            scheduledEvents,
            minBuffer
          );

          const fitsPart = (s: DateRange) => {
            const slotDuration = s.end.diff(s.start, 'hour', true);
            const fitsTime = task.deadline
              ? s.end.isSame(task.deadline) || s.end.isBefore(task.deadline)
              : slotDuration >= task.minDuration ||
                slotDuration >= task.remaining;

            if (!fitsTime) return false;

            // Smart Adaptive Windows: ensure it matches time preference if set
            return matchesTimePreference(s.start, task.timePreference);
          };

          // Try to find a slot that fits, preferring peak hours for high-load tasks
          let slot = availableSlots.find(
            (s) =>
              fitsPart(s) &&
              (task.energyLoad !== 'high' ||
                isPeakHour(s.start, settings?.energyProfile))
          );

          // If high load task couldn't find a peak slot, just find any slot that fits before deadline
          if (!slot && task.energyLoad === 'high') {
            slot = availableSlots.find(fitsPart);
          }

          // If not found, allow after deadline
          let scheduledAfterDeadline = false;
          if (!slot) {
            slot = availableSlots.find((s) =>
              matchesTimePreference(s.start, task.timePreference)
            );
            if (slot && task.deadline && slot.end.isAfter(task.deadline)) {
              scheduledAfterDeadline = true;
            }
          }

          if (!slot) {
            // Move to next day and try again
            const nextTime = tryTime.add(1, 'day').startOf('day');
            tryTime = getNextAvailableTime(categoryHours, nextTime);
            continue;
          }
          const slotDuration = slot.end.diff(slot.start, 'hour', true);
          let partDuration = Math.min(task.remaining, slotDuration);
          partDuration = Math.min(partDuration, task.maxDuration);
          partDuration = Math.max(
            partDuration,
            Math.min(task.minDuration, task.remaining)
          );
          partDuration = hoursToQuarterHours(partDuration);
          if (
            task.remaining < task.minDuration &&
            partDuration < task.remaining
          ) {
            const extendedDuration = Math.min(task.minDuration, slotDuration);
            if (extendedDuration >= task.minDuration) {
              partDuration = hoursToQuarterHours(extendedDuration);
            } else {
              logs.push({
                type: 'warning',
                message: `Cannot schedule remaining ${task.remaining}h of task "${task.name}" due to minimum duration constraint (${task.minDuration}h).`,
              });
              task.remaining = 0;
              break;
            }
          }
          const partStart = roundToQuarterHour(slot.start, false);
          const partEnd = partStart.add(partDuration, 'hour');
          const totalParts = Math.ceil(task.duration / task.maxDuration);

          const newEvent: Event = {
            id: uuidv4(),
            name:
              totalParts > 1
                ? `${task.name} (Part ${task.nextPart}/${totalParts})`
                : task.name,
            range: { start: partStart, end: partEnd },
            taskId: task.id,
            partNumber: totalParts > 1 ? task.nextPart : undefined,
            totalParts: totalParts > 1 ? totalParts : undefined,
            locked: false,
            reason: calculateSchedulingReason(
              task,
              partStart,
              settings?.energyProfile
            ),
          };
          if (
            (task.deadline && partEnd.isAfter(task.deadline)) ||
            scheduledAfterDeadline
          ) {
            logs.push({
              type: 'warning',
              message: `Part ${task.nextPart} of task "${task.name}" is scheduled past its deadline of ${task.deadline}.`,
            });
          }
          scheduledEvents.push(newEvent);
          tryTime = roundToQuarterHour(partEnd.add(minBuffer, 'minute'), true);
          availableTimes[task.category as keyof ActiveHours] = tryTime;
          task.remaining -= partDuration;
          task.scheduledParts++;
          task.nextPart++;
          anyScheduled = true;
          scheduledPart = true;
        }
      }

      // If no task could be scheduled in this round, break to avoid infinite loop
      if (!anyScheduled) break;
    }

    // Log split info and unscheduled warnings
    for (const task of taskPool) {
      if (task.scheduledParts > 1) {
        logs.push({
          type: 'warning',
          message: `Task "${task.name}" has been split into ${task.scheduledParts} parts due to duration constraints and available time slots.`,
        });
      }
      if (task.remaining > 0) {
        logs.push({
          type: 'warning',
          message: `Task "${task.name}" could not be fully scheduled. ${task.remaining}h remaining.`,
        });
      }
    }

    return { events: scheduledEvents, logs };
  } catch (error) {
    console.error('Error sorting task pool:', error);
  }
  // Initialize available times for each category - start from now
  return {
    events: [],
    logs: [
      {
        type: 'error',
        message: 'Scheduling failed due to an unexpected error.',
      },
    ],
  };
};

function getNextAvailableTime(
  hours: DateRange[],
  startFrom: dayjs.Dayjs
): dayjs.Dayjs {
  if (!hours || hours.length === 0) {
    return roundToQuarterHour(startFrom, true);
  }

  const firstHour = hours[0];
  if (!firstHour) {
    return roundToQuarterHour(startFrom, true);
  }

  // Check each day starting from startFrom
  for (let day = 0; day < 30; day++) {
    const checkDate = startFrom.add(day, 'day');

    for (const hourRange of hours) {
      const dayStart = hourRange.start
        .year(checkDate.year())
        .month(checkDate.month())
        .date(checkDate.date());

      const dayEnd = hourRange.end
        .year(checkDate.year())
        .month(checkDate.month())
        .date(checkDate.date());

      let effectiveStart: dayjs.Dayjs;

      if (day === 0) {
        // For the first day, start from the later of: startFrom or day start
        effectiveStart = startFrom.isAfter(dayStart) ? startFrom : dayStart;
      } else {
        // For subsequent days, start from the beginning of active hours
        effectiveStart = dayStart;
      }

      if (effectiveStart.isBefore(dayEnd)) {
        return roundToQuarterHour(effectiveStart, true);
      }
    }
  }

  // Fallback to tomorrow if nothing found
  return roundToQuarterHour(startFrom.add(1, 'day').startOf('day'), true);
}

function getAvailableSlots(
  startTime: dayjs.Dayjs,
  categoryHours: DateRange[],
  existingEvents: Event[],
  minBuffer: number = 0
): DateRange[] {
  const slots: DateRange[] = [];
  const startDay = startTime.startOf('day');

  // Optimization: Pre-filter events to a reasonable window (e.g., 14 days)
  const windowEnd = startTime.add(14, 'day');
  const relevantEvents = existingEvents.filter(
    (e) => e.range.end.isAfter(startTime) && e.range.start.isBefore(windowEnd)
  );

  // Generate slots for the next 14 days (reduced from 30 for performance)
  for (let day = 0; day < 14; day++) {
    const checkDate = startDay.add(day, 'day');
    const checkDateStart = checkDate.startOf('day');
    const checkDateEnd = checkDate.endOf('day');

    // Optimization: Filter events relevant to THIS day
    const dayEvents = relevantEvents.filter(
      (e) =>
        e.range.start.isBefore(checkDateEnd) &&
        e.range.end.isAfter(checkDateStart)
    );

    for (const hourRange of categoryHours) {
      const dayStart = hourRange.start
        .year(checkDate.year())
        .month(checkDate.month())
        .date(checkDate.date());
      const dayEnd = hourRange.end
        .year(checkDate.year())
        .month(checkDate.month())
        .date(checkDate.date());

      let slotStart: dayjs.Dayjs;

      if (day === 0) {
        if (startTime.isSame(checkDate, 'day')) {
          slotStart = startTime.isAfter(dayStart)
            ? roundToQuarterHour(startTime, true)
            : roundToQuarterHour(dayStart, true);
        } else {
          slotStart = roundToQuarterHour(dayStart, true);
        }
      } else {
        slotStart = roundToQuarterHour(dayStart, true);
      }

      const slotEnd = roundToQuarterHour(dayEnd, false);

      if (slotStart.isBefore(slotEnd)) {
        // Use dayEvents which is already much smaller than existingEvents
        const conflictingEvents = dayEvents
          .filter(
            (event) =>
              event.range.start.isBefore(slotEnd) &&
              event.range.end.isAfter(slotStart)
          )
          .sort((a, b) => a.range.start.diff(b.range.start));

        if (conflictingEvents.length === 0) {
          slots.push({ start: slotStart, end: slotEnd });
        } else {
          const firstConflict = conflictingEvents[0];
          if (firstConflict) {
            const preConflictEnd = roundToQuarterHour(
              firstConflict.range.start.subtract(minBuffer, 'minute'),
              false
            );
            if (slotStart.isBefore(preConflictEnd)) {
              slots.push({ start: slotStart, end: preConflictEnd });
            }
          }

          for (let i = 0; i < conflictingEvents.length; i++) {
            const currentEvent = conflictingEvents[i];
            const nextEvent = conflictingEvents[i + 1];

            if (!currentEvent) continue;

            const currentEventEndWithBuffer = roundToQuarterHour(
              currentEvent.range.end.add(minBuffer, 'minute'),
              true
            );
            const nextEventStartWithBuffer = nextEvent
              ? roundToQuarterHour(
                  nextEvent.range.start.subtract(minBuffer, 'minute'),
                  false
                )
              : slotEnd;

            if (currentEventEndWithBuffer.isBefore(nextEventStartWithBuffer)) {
              slots.push({
                start: currentEventEndWithBuffer,
                end: nextEventStartWithBuffer,
              });
            }
          }
        }
      }
    }

    // Optimization: If we already found enough slots for a few days, stop early
    if (slots.length >= 20) break;
  }

  return slots
    .filter((slot) => slot.end.diff(slot.start, 'minute') >= 15)
    .sort((a, b) => a.start.diff(b.start));
}
