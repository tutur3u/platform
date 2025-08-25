import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import type { Dayjs } from 'dayjs';
import { dayjs } from '@tuturuuu/ui/lib/dayjs-setup';

dayjs.tz.setDefault();

export function getDateStrings(dates: Date[]): string[] {
  return dates.map((date) => dayjs(date).format('YYYY-MM-DD'));
}

export function datesToDateMatrix(dates?: Date[] | null): {
  soonest: Dayjs;
  latest: Dayjs;
} {
  if (!dates || dates.length === 0) {
    throw new Error('Invalid input');
  }

  const datesInDayjs = dates.map((date) => dayjs(date));
  const sortedDates = datesInDayjs.sort((a, b) => a.diff(b));

  const soonest = dayjs(sortedDates[0]);
  const latest = dayjs(sortedDates[sortedDates.length - 1]).add(15, 'minutes');

  return { soonest, latest };
}

export function datesToTimeMatrix(dates?: Date[] | null): {
  soonest: Dayjs;
  latest: Dayjs;
} {
  if (!dates || dates.length === 0) {
    throw new Error('Invalid input');
  }

  if (dates.length === 1)
    return { soonest: dayjs(dates[0]), latest: dayjs(dates[0]) };

  const now = dayjs();

  const soonest =
    dayjs.min(
      dates.map((date) =>
        dayjs(date)
          .set('year', now.year())
          .set('month', now.month())
          .set('date', now.date())
      )
    ) ?? now;

  const latest =
    dayjs.max(
      dates.map((date) =>
        dayjs(date)
          .set('year', now.year())
          .set('month', now.month())
          .set('date', now.date())
      )
    ) ?? now;

  return {
    soonest,
    latest,
  };
}

export function durationToTimeblocks(
  dates: Date[],
  tentative: boolean
): Timeblock[] {
  if (dates.length === 0) return [];

  const timeblocks: Timeblock[] = [];

  // Handle single date case (for single 15-minute timeblocks)
  if (dates.length === 1) {
    const date = dayjs(dates[0]);
    const startTime = date.set('second', 0);
    const endTime = startTime.add(15, 'minutes');

    timeblocks.push({
      date: startTime.format('YYYY-MM-DD'),
      start_time: startTime.format('HH:mm:ssZ'),
      end_time: endTime.format('HH:mm:ssZ'),
      tentative,
    });

    return timeblocks;
  }

  // Handle two dates case (for duration-based timeblocks)
  if (dates.length === 2) {
    // If both dates are the same, treat as single date case
    if (dayjs(dates[0]).isSame(dates[1], 'minute')) {
      const date = dayjs(dates[0]);
      const startTime = date.set('second', 0);
      const endTime = startTime.add(15, 'minutes');

      timeblocks.push({
        date: startTime.format('YYYY-MM-DD'),
        start_time: startTime.format('HH:mm:ssZ'),
        end_time: endTime.format('HH:mm:ssZ'),
        tentative,
      });

      return timeblocks;
    }

    const { soonest: soonestTime, latest: latestTime } =
      datesToTimeMatrix(dates);
    const { soonest: soonestDate, latest: latestDate } =
      datesToDateMatrix(dates);

    let start = soonestDate
      .set('hour', soonestTime.hour())
      .set('minute', soonestTime.minute())
      .set('second', 0);

    const end = latestDate
      .set('hour', latestTime.hour())
      .set('minute', latestTime.minute())
      .set('second', 0);

    // Use isSameOrBefore to handle cases where start and end are the same
    while (start.isSameOrBefore(end)) {
      const date = start.format('YYYY-MM-DD');

      const startTime = dayjs(soonestTime);
      const endTime = dayjs(latestTime).add(15, 'minutes');

      timeblocks.push({
        date,
        start_time: startTime.format('HH:mm:ssZ'),
        end_time: endTime.format('HH:mm:ssZ'),
        tentative,
      });

      // Increment the date
      start = start.add(1, 'day');
    }
  }

  return timeblocks;
}

export function addTimeblocks(
  prevTimeblocks: Timeblock[],
  dates: Date[],
  tentative: boolean
): Timeblock[] {
  // Generate new timeblocks from dates
  const newTimeblocks = durationToTimeblocks(dates, tentative);
  if (newTimeblocks.length === 0) return prevTimeblocks;

  // Start with all existing timeblocks
  let result: Timeblock[] = [...prevTimeblocks];

  // Merge each new timeblock with existing ones
  for (const newTimeblock of newTimeblocks) {
    if (!isValidTimeblock(newTimeblock)) continue;

    const mergedResult: Timeblock[] = [];
    let wasProcessed = false;

    for (const existingTimeblock of result) {
      if (!isValidTimeblock(existingTimeblock)) continue;

      // Check if timeblocks are on the same date and can potentially be merged
      if (existingTimeblock.date === newTimeblock.date) {
        const merged = mergeTimeblocks(existingTimeblock, newTimeblock);
        mergedResult.push(...merged);
        wasProcessed = true;
      } else {
        mergedResult.push(existingTimeblock);
      }
    }

    // If the new timeblock wasn't processed (no overlap with existing ones), add it separately
    if (!wasProcessed) {
      mergedResult.push(newTimeblock);
    }

    result = mergedResult;
  }

  // Sort the result by date and time
  return result.sort((a, b) => {
    const aDateTime = dayjs(`${a.date} ${a.start_time}`);
    const bDateTime = dayjs(`${b.date} ${b.start_time}`);
    return aDateTime.diff(bDateTime);
  });
}

export function removeTimeblocks(
  prevTimeblocks: Timeblock[],
  dates: Date[]
): Timeblock[] {
  // Return the previous timeblocks if the dates are empty
  if (!dates || dates.length === 0) {
    return prevTimeblocks;
  }

  // Return empty array if no timeblocks to process
  if (!prevTimeblocks || prevTimeblocks.length === 0) {
    return [];
  }

  // Always use min/max day logic first
  const { soonest: soonestDate, latest: latestDate } = datesToDateMatrix(dates);
  const { soonest: soonestTime, latest: latestTime } = datesToTimeMatrix(dates);

  // Handle single date removal
  if (dates.length === 1) {
    const removalStart = soonestDate
      .set('hour', soonestTime.hour())
      .set('minute', soonestTime.minute())
      .set('second', 0);
    const removalEnd = removalStart.add(15, 'minutes');

    return removeTimeblocksInRange(prevTimeblocks, removalStart, removalEnd);
  }

  // Handle multi-day removal - process each day separately
  if (dates.length === 2) {
    // If it's the same day, treat as single day removal
    if (soonestDate.isSame(latestDate, 'day')) {
      const removalStart = soonestDate
        .set('hour', soonestTime.hour())
        .set('minute', soonestTime.minute())
        .set('second', 0);
      let removalEnd = latestDate
        .set('hour', latestTime.hour())
        .set('minute', latestTime.minute())
        .set('second', 0);

      // Fix for UI sending times like 8:59:59 instead of 9:00:00
      // If the end time is very close to the next hour boundary, round it up
      if (removalEnd.minute() >= 59 && latestTime.second() >= 30) {
        removalEnd = removalEnd.add(1, 'hour').minute(0);
      }

      return removeTimeblocksInRange(prevTimeblocks, removalStart, removalEnd);
    }

    // Multi-day removal - remove the same time slot on each day
    let result = [...prevTimeblocks];

    // Get the time range (hours and minutes) from the min/max times
    const startHour = soonestTime.hour();
    const startMinute = soonestTime.minute();
    let endHour = latestTime.hour();
    let endMinute = latestTime.minute();

    // Fix for UI sending times like 8:59:59 instead of 9:00:00
    // If the end time is very close to the next hour boundary, round it up
    if (endMinute >= 59 && latestTime.second() >= 30) {
      endHour = endHour + 1;
      endMinute = 0;
    }

    // Iterate through each day in the range using min/max dates
    let currentDate = soonestDate.startOf('day');
    const lastDate = latestDate.startOf('day');

    while (currentDate.isSameOrBefore(lastDate, 'day')) {
      const dayRemovalStart = currentDate
        .hour(startHour)
        .minute(startMinute)
        .second(0);
      const dayRemovalEnd = currentDate
        .hour(endHour)
        .minute(endMinute)
        .second(0);

      result = removeTimeblocksInRange(result, dayRemovalStart, dayRemovalEnd);
      currentDate = currentDate.add(1, 'day');
    }

    return result;
  }

  // Handle multiple dates (more than 2) - treat as individual removals
  // Sort dates to ensure consistent min/max behavior
  const sortedDates = dates.sort((a, b) => dayjs(a).diff(dayjs(b)));
  let result = [...prevTimeblocks];

  for (const date of sortedDates) {
    const removalStart = dayjs(date).set('second', 0);
    const removalEnd = removalStart.add(15, 'minutes');
    result = removeTimeblocksInRange(result, removalStart, removalEnd);
  }

  return result;
}

// Helper function to remove timeblocks within a specific time range
function removeTimeblocksInRange(
  timeblocks: Timeblock[],
  removalStart: Dayjs,
  removalEnd: Dayjs
): Timeblock[] {
  const result: Timeblock[] = [];

  for (const timeblock of timeblocks) {
    const splitTimeblocks = splitTimeblockByRemovalRange(
      timeblock,
      removalStart,
      removalEnd.add(15, 'minutes')
    );
    result.push(...splitTimeblocks);
  }

  return result;
}

function mergeTimeblocks(
  existing: Timeblock,
  newTimeblock: Timeblock
): Timeblock[] {
  const existingStart = dayjs(`${existing.date} ${existing.start_time}`);
  const existingEnd = dayjs(`${existing.date} ${existing.end_time}`);

  const newStart = dayjs(`${newTimeblock.date} ${newTimeblock.start_time}`);
  const newEnd = dayjs(`${newTimeblock.date} ${newTimeblock.end_time}`);

  if (existingEnd.isBefore(newStart) || existingStart.isAfter(newEnd)) {
    return [existing, newTimeblock];
  }

  if (existing.tentative === newTimeblock.tentative) {
    // Merge timeblocks by taking min start and max end
    const mergedStart = existingStart.isBefore(newStart)
      ? existingStart
      : newStart;
    const mergedEnd = existingEnd.isAfter(newEnd) ? existingEnd : newEnd;

    const mergedTimeblock: Timeblock = {
      ...existing, // Keep other properties from existing
      start_time: mergedStart.format('HH:mm:ssZ'),
      end_time: mergedEnd.format('HH:mm:ssZ'),
    };

    return [mergedTimeblock];
  } else {
    const remainingParts = splitTimeblockByRemovalRange(
      existing,
      newStart,
      newEnd
    );

    return [...remainingParts, newTimeblock].sort((a, b) => {
      const aTime = dayjs(`${a.date} ${a.start_time}`);
      const bTime = dayjs(`${b.date} ${b.start_time}`);
      return aTime.diff(bTime);
    });
  }
}

function splitTimeblockByRemovalRange(
  timeblock: Timeblock,
  removalStart: Dayjs,
  removalEnd: Dayjs
): Timeblock[] {
  const timeblockStart = dayjs(`${timeblock.date} ${timeblock.start_time}`);
  const timeblockEnd = dayjs(`${timeblock.date} ${timeblock.end_time}`);

  // Timeblock is completely outside the removal range
  if (
    timeblockEnd.isBefore(removalStart) ||
    timeblockStart.isAfter(removalEnd)
  ) {
    return [timeblock];
  }

  // Timeblock overlaps with removal range - need to split
  const remainingParts: Timeblock[] = [];

  // Keep the part before the removal range (if any)
  if (timeblockStart.isBefore(removalStart)) {
    remainingParts.push({
      ...timeblock,
      id: undefined, // Remove ID for new timeblock
      end_time: removalStart.format('HH:mm:ssZ'),
    });
  }

  // Keep the part after the removal range (if any)
  if (timeblockEnd.isAfter(removalEnd)) {
    remainingParts.push({
      ...timeblock,
      id: undefined, // Remove ID for new timeblock
      start_time: removalEnd.format('HH:mm:ssZ'),
    });
  }

  return remainingParts;
}

function isValidTimeblock(timeblock: Timeblock): boolean {
  return !!(
    timeblock?.date &&
    timeblock?.start_time &&
    timeblock?.end_time &&
    timeblock?.tentative !== undefined
  );
}
