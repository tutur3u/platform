import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import dayjs, { type Dayjs } from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import minMax from 'dayjs/plugin/minMax';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.extend(isBetween);
dayjs.extend(timezone);
dayjs.extend(minMax);
dayjs.extend(utc);

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
  if (dates.length != 2) return [];
  const timeblocks: Timeblock[] = [];

  const { soonest: soonestTime, latest: latestTime } = datesToTimeMatrix(dates);
  const { soonest: soonestDate, latest: latestDate } = datesToDateMatrix(dates);

  let start = soonestDate
    .set('hour', soonestTime.hour())
    .set('minute', soonestTime.minute())
    .set('second', 0);

  const end = latestDate
    .set('hour', latestTime.hour())
    .set('minute', latestTime.minute())
    .set('second', 0);

  while (start.isBefore(end)) {
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

  // Get the removal range from the given dates
  const { soonest: removalStart, latest: removalEnd } =
    datesToDateMatrix(dates);

  const result: Timeblock[] = [];

  for (const timeblock of prevTimeblocks) {
    const splitTimeblocks = splitTimeblockByRemovalRange(
      timeblock,
      removalStart,
      removalEnd
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
    timeblockEnd.isSameOrBefore(removalStart) ||
    timeblockStart.isSameOrAfter(removalEnd)
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
