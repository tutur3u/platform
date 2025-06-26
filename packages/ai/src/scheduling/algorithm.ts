import dayjs from 'dayjs';
import minMax from 'dayjs/plugin/minMax';
import { defaultActiveHours } from './default';
import type {
  ActiveHours,
  DateRange,
  Event,
  Log,
  ScheduleResult,
  Task,
  TaskPriority,
} from './types';


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
  score += priorityScores[task.priority];

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
    }else{
      score += 100; // Due later than a week
    }
  }

  return score;
}

export const promoteEventToTask = (event: Event ): Task =>{
  const start = dayjs(event.range.start);
  const end = dayjs(event.range.end);

  // Now you can safely calculate the difference.
  const durationInHours = end.diff(start, 'hour', true);

  // FIX 2: A promoted event is treated as a single, non-splittable block.
  // We set its min/max duration to its actual duration.
  const duration = hoursToQuarterHours(durationInHours);


  return {
    id: event.id,
    name: event.name,
    duration: hoursToQuarterHours(duration),
    minDuration: ensureMinimumDuration(duration),
    maxDuration: hoursToQuarterHours(duration),
    category: event.category || 'work',
    priority: 'normal', 
    events: [],
    deadline: event.range.end, 
    allowSplit: false, 
  };
}

export const scheduleWithFlexibleEvents = (
  newTasks: Task[],
  flexibleEvents: Event[],
  lockedEvents: Event[],
  activeHours: ActiveHours
): ScheduleResult => {
  const now = dayjs();
  const futureFlexibleEvents = flexibleEvents.filter(event =>
    dayjs(event.range.end).isAfter(now)
  );


  const futureLockedEvents = lockedEvents.filter(event =>
    dayjs(event.range.end).isAfter(now)
  );
  
  if (flexibleEvents.length !== futureFlexibleEvents.length) {
    console.log(`[Scheduler] Skipped ${flexibleEvents.length - futureFlexibleEvents.length} past flexible events.`);
  }
  if (lockedEvents.length !== futureLockedEvents.length) {
    console.log(`[Scheduler] Skipped ${lockedEvents.length - futureLockedEvents.length} past locked events.`);
  }

  // Now, promote tasks ONLY from the filtered list of future flexible events.
  // We add .filter(Boolean) as a safety measure to remove any potential `null`
  // values if promoteEventToTask is updated to return them.
  const promotedTasks = futureFlexibleEvents
    .map(promoteEventToTask)
    .filter((task): task is Task => task !== null);

  const allTasksToProcess = [...newTasks, ...promotedTasks];

  // Call the core scheduler with the clean, future-only lists.
  const result = scheduleTasks(allTasksToProcess, activeHours, futureLockedEvents)

  return result;
};

export const scheduleTasks = (
  tasks: Task[],
  activeHours: ActiveHours = defaultActiveHours,
  lockedEvents: Event[] = []
): ScheduleResult => {

  // console.log(activeHours, 'activeHours');  
  // console.log(lockedEvents, 'lockedEvents');
  // Start with locked events in the schedule
  const scheduledEvents: Event[] = lockedEvents.map((e) => ({
    ...e,
    locked: true,
  }));
  const logs: Log[] = [];
// console.log(tasks, 'Tasks to Schedule');
let taskPool: any[]= [];
  // Prepare a working pool of tasks with remaining duration
  try{
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
  
    // console.log(taskPool, 'Task Pool Before Sorting');
  }catch (error) {
    console.error('Error preparing task pool:', error);
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


  try{
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
      const categoryHours = activeHours[task.category as keyof ActiveHours];
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
        let tryTime = availableTimes[task.category as keyof ActiveHours];
        let blockAttempts = 0;
        let scheduledAfterDeadline = false;
        while (!scheduled && blockAttempts < 50) {
          blockAttempts++;
          const availableSlots = getAvailableSlots(
            tryTime,
            categoryHours,
            scheduledEvents
          );
          // Try to find a slot before the deadline first
          let slot = availableSlots.find((slot) => {
            const slotDuration = slot.end.diff(slot.start, 'hour', true);
            if (task.deadline) {
              return (
                slotDuration >= task.duration &&
                (slot.end.isBefore(task.deadline) ||
                  slot.end.isSame(task.deadline))
              );
            }
            return slotDuration >= task.duration;
          });
          // If not found, allow after deadline
          if (!slot) {
            slot = availableSlots.find((slot) => {
              const slotDuration = slot.end.diff(slot.start, 'hour', true);
              return slotDuration >= task.duration;
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
              isPastDeadline: false,
              taskId: task.id,
            };
            if (
              (task.deadline && partEnd.isAfter(task.deadline)) ||
              scheduledAfterDeadline
            ) {
              newEvent.isPastDeadline = true;
              logs.push({
                type: 'warning',
                message: `Task "${task.name}" is scheduled past its deadline of ${task.deadline}.`,
              });
            }
            scheduledEvents.push(newEvent);
            availableTimes[task.category as keyof ActiveHours] = roundToQuarterHour(partEnd, true) ?? availableTimes.work;
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
      let tryTime = availableTimes[task.category as keyof ActiveHours] ?? availableTimes.work;
      let splitAttempts = 0;
      while (task.remaining > 0 && splitAttempts < 50 && !scheduledPart) {
        splitAttempts++;
        const availableSlots = getAvailableSlots(
          tryTime,
          categoryHours,
          scheduledEvents
        );
        // Try to find a slot before the deadline first
        let slot;
        if (task.deadline) {
          slot = availableSlots.find(
            (slot) =>
              slot.end.isSame(task.deadline) || slot.end.isBefore(task.deadline)
          );
        }
        // If not found, allow after deadline
        let scheduledAfterDeadline = false;
        if (!slot) {
          slot = availableSlots[0];
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
          id: `${task.id}-part-${task.nextPart}`,
          name:
            totalParts > 1
              ? `${task.name} (Part ${task.nextPart}/${totalParts})`
              : task.name,
          range: { start: partStart, end: partEnd },
          isPastDeadline: false,
          taskId: task.id,
          partNumber: totalParts > 1 ? task.nextPart : undefined,
          totalParts: totalParts > 1 ? totalParts : undefined,
        };
        if (
          (task.deadline && partEnd.isAfter(task.deadline)) ||
          scheduledAfterDeadline
        ) {
          newEvent.isPastDeadline = true;
          logs.push({
            type: 'warning',
            message: `Part ${task.nextPart} of task "${task.name}" is scheduled past its deadline of ${task.deadline}.`,
          });
        }
        scheduledEvents.push(newEvent);
        tryTime = roundToQuarterHour(partEnd, true);
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

// console.log('Scheduled Events:', scheduledEvents);
  return { events: scheduledEvents, logs };
  }catch (error) {
    console.error('Error sorting task pool:', error);
  }
  // Initialize available times for each category - start from now
  return { events: [], logs: [{ type: 'error', message: 'Scheduling failed due to an unexpected error.' }] };
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
  existingEvents: Event[]
): DateRange[] {
  const slots: DateRange[] = [];
  const startDay = startTime.startOf('day');

  // Generate slots for the next 30 days to ensure we can find availability
  for (let day = 0; day < 30; day++) {
    const checkDate = startDay.add(day, 'day');

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
        // For the first day, start from the later of: startTime or day start
        if (startTime.isSame(checkDate, 'day')) {
          slotStart = startTime.isAfter(dayStart)
            ? roundToQuarterHour(startTime, true)
            : roundToQuarterHour(dayStart, true);
        } else {
          slotStart = roundToQuarterHour(dayStart, true);
        }
      } else {
        // For subsequent days, always start from the beginning of active hours
        slotStart = roundToQuarterHour(dayStart, true);
      }

      const slotEnd = roundToQuarterHour(dayEnd, false);

      if (slotStart.isBefore(slotEnd)) {
        // Check for conflicts with existing events
        const conflictingEvents = existingEvents
          .filter(
            (event) =>
              event.range.start.isBefore(slotEnd) &&
              event.range.end.isAfter(slotStart)
          )
          .sort((a, b) => a.range.start.diff(b.range.start));

        if (conflictingEvents.length === 0) {
          slots.push({ start: slotStart, end: slotEnd });
        } else {
          // Add slot before first conflict if there's space
          const firstConflict = conflictingEvents[0];
          if (firstConflict && slotStart.isBefore(firstConflict.range.start)) {
            const conflictStart = roundToQuarterHour(
              firstConflict.range.start,
              false
            );
            if (slotStart.isBefore(conflictStart)) {
              slots.push({ start: slotStart, end: conflictStart });
            }
          }


          for (let i = 0; i < conflictingEvents.length; i++) {
            const currentEvent = conflictingEvents[i];
            const nextEvent = conflictingEvents[i + 1];

            if (!currentEvent) continue;

            const currentEventEnd = roundToQuarterHour(
              currentEvent.range.end,
              true
            );
            const nextEventStart = nextEvent
              ? roundToQuarterHour(nextEvent.range.start, false)
              : slotEnd;

            if (currentEventEnd.isBefore(nextEventStart)) {
              slots.push({ start: currentEventEnd, end: nextEventStart });
            }
          }
        }
      }
    }
  }

  // Filter out slots that are too small (less than 15 minutes) and sort by start time
  return slots
    .filter((slot) => slot.end.diff(slot.start, 'minute') >= 15)
    .sort((a, b) => a.start.diff(b.start));
}
