import { defaultActiveHours } from './default';
import type {
  ActiveHours,
  DateRange,
  Event,
  Log,
  ScheduleResult,
  Task,
} from './types';
import dayjs from 'dayjs';
import minMax from 'dayjs/plugin/minMax';

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

export const scheduleTasks = (
  tasks: Task[],
  activeHours: ActiveHours = defaultActiveHours
): ScheduleResult => {
  const scheduledEvents: Event[] = [];
  const logs: Log[] = [];

  // Sort tasks by deadline, earliest first. Tasks without a deadline are considered last.
  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.deadline && b.deadline)
      return a.deadline.isBefore(b.deadline) ? -1 : 1;
    if (a.deadline) return -1; // a has a deadline, b doesn't
    if (b.deadline) return 1; // b has a deadline, a doesn't
    return 0; // no deadlines
  });

  // Initialize available times for each category - start from now
  const now = dayjs();
  const availableTimes: Record<keyof ActiveHours, dayjs.Dayjs> = {
    work: getNextAvailableTime(activeHours.work, now),
    personal: getNextAvailableTime(activeHours.personal, now),
    meeting: getNextAvailableTime(activeHours.meeting, now),
  };

  for (const task of sortedTasks) {
    const categoryHours = activeHours[task.category];

    if (!categoryHours || categoryHours.length === 0) {
      logs.push({
        type: 'error',
        message: `No ${task.category} hours defined for task "${task.name}".`,
      });
      continue;
    }

    // Ensure task durations are in 15-minute increments
    const adjustedTask = {
      ...task,
      duration: hoursToQuarterHours(task.duration),
      minDuration: ensureMinimumDuration(task.minDuration),
      maxDuration: hoursToQuarterHours(task.maxDuration),
    };

    let remainingDuration = adjustedTask.duration;
    let partNumber = 1;
    const taskParts: Event[] = [];
    let attempts = 0;
    const maxAttempts = 50; // Prevent infinite loops

    while (remainingDuration > 0 && attempts < maxAttempts) {
      attempts++;

      const availableSlots = getAvailableSlots(
        availableTimes[task.category],
        categoryHours,
        scheduledEvents
      );

      if (availableSlots.length === 0) {
        // Move to next day and try again
        availableTimes[task.category] = availableTimes[task.category]
          .add(1, 'day')
          .startOf('day');
        availableTimes[task.category] = getNextAvailableTime(
          categoryHours,
          availableTimes[task.category]
        );

        logs.push({
          type: 'warning',
          message: `Moving task "${task.name}" to ${availableTimes[task.category].format('YYYY-MM-DD')} due to lack of available time slots.`,
        });
        continue;
      }

      const slot = availableSlots[0];
      if (!slot) {
        logs.push({
          type: 'error',
          message: `No valid slot found for task "${task.name}".`,
        });
        break;
      }

      const slotDuration = slot.end.diff(slot.start, 'hour', true);

      // Calculate the duration for this part (in quarter-hour increments)
      let partDuration = Math.min(remainingDuration, slotDuration);
      partDuration = Math.min(partDuration, adjustedTask.maxDuration);
      partDuration = Math.max(
        partDuration,
        Math.min(adjustedTask.minDuration, remainingDuration)
      );

      // Ensure part duration is in 15-minute increments
      partDuration = hoursToQuarterHours(partDuration);

      // If the remaining duration is less than minDuration and we can't fit it
      if (
        remainingDuration < adjustedTask.minDuration &&
        partDuration < remainingDuration
      ) {
        // Try to extend the current part or find a larger slot
        const extendedDuration = Math.min(
          adjustedTask.minDuration,
          slotDuration
        );
        if (extendedDuration >= adjustedTask.minDuration) {
          partDuration = hoursToQuarterHours(extendedDuration);
        } else {
          logs.push({
            type: 'warning',
            message: `Cannot schedule remaining ${remainingDuration}h of task "${task.name}" due to minimum duration constraint (${adjustedTask.minDuration}h).`,
          });
          break;
        }
      }

      // Ensure the part start time is rounded to 15-minute increment
      const partStart = roundToQuarterHour(slot.start, false);
      const partEnd = partStart.add(partDuration, 'hour');

      // Verify the end time doesn't exceed the slot
      if (partEnd.isAfter(slot.end)) {
        const adjustedDuration = slot.end.diff(partStart, 'hour', true);

        if (adjustedDuration < adjustedTask.minDuration) {
          logs.push({
            type: 'error',
            message: `Cannot fit minimum duration for task "${task.name}" part ${partNumber}.`,
          });
          break;
        }

        partDuration = hoursToQuarterHours(adjustedDuration);
      }

      const finalPartEnd = partStart.add(partDuration, 'hour');
      const totalParts = Math.ceil(
        adjustedTask.duration / adjustedTask.maxDuration
      );

      const newEvent: Event = {
        id: `event-${task.id}-part-${partNumber}`,
        name:
          totalParts > 1
            ? `${task.name} (Part ${partNumber}/${totalParts})`
            : task.name,
        range: { start: partStart, end: finalPartEnd },
        isPastDeadline: false,
        taskId: task.id,
        partNumber: totalParts > 1 ? partNumber : undefined,
        totalParts: totalParts > 1 ? totalParts : undefined,
      };

      // Check if this part is past the deadline
      if (task.deadline && finalPartEnd.isAfter(task.deadline)) {
        newEvent.isPastDeadline = true;
        logs.push({
          type: 'warning',
          message: `Part ${partNumber} of task "${task.name}" is scheduled past its deadline of ${task.deadline.format('YYYY-MM-DD HH:mm')}.`,
        });
      }

      taskParts.push(newEvent);
      scheduledEvents.push(newEvent);

      remainingDuration -= partDuration;
      availableTimes[task.category] = roundToQuarterHour(finalPartEnd, true);
      partNumber++;
    }

    if (attempts >= maxAttempts) {
      logs.push({
        type: 'error',
        message: `Task "${task.name}" could not be fully scheduled after ${maxAttempts} attempts.`,
      });
    }

    if (taskParts.length > 1) {
      logs.push({
        type: 'warning',
        message: `Task "${task.name}" has been split into ${taskParts.length} parts due to duration constraints and available time slots.`,
      });
    }

    if (remainingDuration > 0) {
      logs.push({
        type: 'warning',
        message: `Task "${task.name}" could not be fully scheduled. ${remainingDuration}h remaining.`,
      });
    }
  }

  return { events: scheduledEvents, logs };
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

          // Add slots between conflicts and after last conflict
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
