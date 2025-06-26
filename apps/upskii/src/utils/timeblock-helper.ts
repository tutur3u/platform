import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import dayjs, { type Dayjs } from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import minMax from 'dayjs/plugin/minMax';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { maxTimetz, minTimetz } from './date-helper';

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

export function durationToTimeblocks(dates: Date[]): Timeblock[] {
  if (dates.length !== 2) return [];
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
    });

    // Increment the date
    start = start.add(1, 'day');
  }

  return timeblocks;
}

export function _experimentalAddTimeblocks(
  prevTimeblocks: Timeblock[],
  newTimeblocks: Timeblock[]
): Timeblock[] {
  // Concat the new timeblocks
  const timeblocks = prevTimeblocks.concat(newTimeblocks);

  // Sort the timeblocks by start time and date
  const sortedTimeblocks = timeblocks.sort((a, b) => {
    const aTime = dayjs(`${a.date} ${a.start_time}`);
    const bTime = dayjs(`${b.date} ${b.start_time}`);
    return aTime.diff(bTime);
  });

  const nextTBs: Timeblock[] = [];

  for (let i = 0; i < sortedTimeblocks.length; i++) {
    const lastTB = nextTBs[nextTBs.length - 1];
    const currTB = sortedTimeblocks[i];

    // If nextTBs is empty, add the current timeblock
    if (nextTBs.length === 0) {
      if (currTB) {
        nextTBs.push(currTB);
      }
      continue;
    }

    if (
      !currTB?.date ||
      !currTB?.start_time ||
      !currTB?.end_time ||
      !lastTB?.date ||
      !lastTB?.start_time ||
      !lastTB?.end_time
    )
      continue;

    // If currTB is in the middle of lastTB,
    // skip the current timeblock
    if (
      dayjs(`${currTB.date} ${currTB.start_time}`).isBetween(
        dayjs(`${lastTB.date} ${lastTB.start_time}`),
        dayjs(`${lastTB.date} ${lastTB.end_time}`),
        null,
        '[]'
      ) &&
      dayjs(`${currTB.date} ${currTB.end_time}`).isBetween(
        dayjs(`${lastTB.date} ${lastTB.start_time}`),
        dayjs(`${lastTB.date} ${lastTB.end_time}`),
        null,
        '[]'
      )
    ) {
      continue;
    }

    // If lastTB's end time is greater than or equal to currTB's start time,
    // set lastTB's end time to max of lastTB's end time and currTB's end time
    if (
      `${lastTB.date} ${lastTB.end_time}` ===
        `${currTB.date} ${currTB.start_time}` ||
      dayjs(`${lastTB.date} ${lastTB.end_time}`).isAfter(
        dayjs(`${currTB.date} ${currTB.start_time}`)
      )
    ) {
      lastTB.end_time = currTB.end_time;
      continue;
    }

    // If none of the above conditions are met, add the current timeblock
    nextTBs.push(currTB);
  }

  return nextTBs;
}

export function _experimentalRemoveTimeblocks(
  prevTimeblocks: Timeblock[],
  dates: Date[],
  forcedOffset?: number
): Timeblock[] {
  // Return the previous timeblocks if the dates are empty
  if (!dates || dates.length === 0) {
    return prevTimeblocks;
  }

  // Get the soonest and latest dates and hours
  const { soonest: removalStartTime, latest: removalEndTime } =
    datesToTimeMatrix(dates);

  const { soonest: soonestDate, latest: latestDate } = datesToDateMatrix(dates);

  const removalStart = soonestDate
    .set('hour', removalStartTime.hour())
    .set('minute', removalStartTime.minute())
    .set('second', 0);

  const removalEnd = latestDate
    .set('hour', removalEndTime.hour())
    .set('minute', removalEndTime.minute())
    .set('second', 0);

  const filteredTimeblocks: Timeblock[] = [];

  // Iterate through each timeblock
  for (const tb of prevTimeblocks) {
    const tbStart = dayjs(`${tb.date} ${tb.start_time}`);
    const tbEnd = dayjs(`${tb.date} ${tb.end_time}`);

    // Check if the timeblock is completely outside the date range
    if (
      tbStart.isSameOrAfter(removalEnd, 'minutes') ||
      tbEnd.isSameOrBefore(removalStart, 'minutes')
    ) {
      filteredTimeblocks.push(tb);
      continue;
    }

    // Check if the timeblock is completely inside the date range
    if (
      tbStart.isSameOrAfter(removalStart, 'minutes') &&
      tbEnd.isSameOrBefore(removalEnd, 'minutes')
    ) {
      continue;
    }

    const date = dayjs(tb.date);

    const rmStart = dayjs(removalStart)
      .set('year', date.year())
      .set('month', date.month())
      .set('date', date.date());

    const rmEnd = dayjs(removalEnd)
      .set('year', date.year())
      .set('month', date.month())
      .set('date', date.date());

    // Check if the removal time is within the timeblock
    // if (
    //   tbStart.isBefore(rmStart, 'minutes') &&
    //   tbEnd.isAfter(rmEnd, 'minutes')
    // ) {
    //   const newTimeblock = { ...tb };

    //   newTimeblock.start_time = (dayjs.max(tbStart, rmStart) ?? tbStart)
    //     .utcOffset(forcedOffset ?? rmStart.utcOffset(), true)
    //     .format('HH:mm:ssZ');

    //   newTimeblock.end_time = (dayjs.min(rmEnd, tbEnd) ?? tbEnd)
    //     .add(15, 'minutes')
    //     .utcOffset(forcedOffset ?? rmEnd.utcOffset(), true)
    //     .format('HH:mm:ssZ');

    //   filteredTimeblocks.push(newTimeblock);
    //   continue;
    // }

    // Check if the timeblock ends after the removal time starts
    // and before the removal time ends
    if (
      tbEnd.isSameOrAfter(rmStart, 'minutes') &&
      tbEnd.isSameOrBefore(rmEnd, 'minutes')
    ) {
      const newTimeblock = { ...tb };

      newTimeblock.end_time = (dayjs.min(rmStart, tbEnd) ?? tbEnd)
        .utcOffset(forcedOffset ?? rmStart.utcOffset())
        .format('HH:mm:ssZ');

      filteredTimeblocks.push(newTimeblock);
      continue;
    }

    // Check if the timeblock starts after the removal time starts
    // and before the removal time ends
    if (
      tbStart.isSameOrAfter(rmStart, 'minutes') &&
      tbStart.isSameOrBefore(rmEnd, 'minutes')
    ) {
      const newTimeblock = { ...tb };

      newTimeblock.start_time = (dayjs.max(rmEnd, tbStart) ?? tbStart)
        .utcOffset(forcedOffset ?? rmEnd.utcOffset())
        .format('HH:mm:ssZ');

      filteredTimeblocks.push(newTimeblock);
    }
  }

  return filteredTimeblocks.filter(
    (timeblock) => timeblock.start_time !== timeblock.end_time
  );
}

export function addTimeblocks(
  prevTimeblocks: Timeblock[],
  newTimeblocks: Timeblock[]
): Timeblock[] {
  // Concat the new timeblocks
  const timeblocks = prevTimeblocks.concat(newTimeblocks);

  // Sort the timeblocks by start time and date
  const sortedTimeblocks = timeblocks.sort((a, b) => {
    const aTime = dayjs(`${a.date} ${a.start_time}`);
    const bTime = dayjs(`${b.date} ${b.start_time}`);
    return aTime.diff(bTime);
  });

  const nextTBs: Timeblock[] = [];

  for (let i = 0; i < sortedTimeblocks.length; i++) {
    const lastTB = nextTBs[nextTBs.length - 1];
    const currTB = sortedTimeblocks[i];

    // If nextTBs is empty, add the current timeblock
    if (nextTBs.length === 0) {
      if (currTB) {
        nextTBs.push(currTB);
      }
      continue;
    }

    if (
      !currTB?.date ||
      !currTB?.start_time ||
      !currTB?.end_time ||
      !lastTB?.date ||
      !lastTB?.start_time ||
      !lastTB?.end_time
    )
      continue;

    // If currTB is in the middle of lastTB,
    // skip the current timeblock
    if (
      dayjs(`${currTB.date} ${currTB.start_time}`).isBetween(
        dayjs(`${lastTB.date} ${lastTB.start_time}`),
        dayjs(`${lastTB.date} ${lastTB.end_time}`),
        null,
        '[]'
      ) &&
      dayjs(`${currTB.date} ${currTB.end_time}`).isBetween(
        dayjs(`${lastTB.date} ${lastTB.start_time}`),
        dayjs(`${lastTB.date} ${lastTB.end_time}`),
        null,
        '[]'
      )
    ) {
      continue;
    }

    // If lastTB's end time is greater than or equal to currTB's start time,
    // set lastTB's end time to max of lastTB's end time and currTB's end time
    if (
      `${lastTB.date} ${lastTB.end_time}` ===
        `${currTB.date} ${currTB.start_time}` ||
      dayjs(`${lastTB.date} ${lastTB.end_time}`).isAfter(
        dayjs(`${currTB.date} ${currTB.start_time}`)
      )
    ) {
      lastTB.end_time = currTB.end_time;
      continue;
    }

    // If none of the above conditions are met, add the current timeblock
    nextTBs.push(currTB);
  }

  return nextTBs;
}

export function removeTimeblocks(
  prevTimeblocks: Timeblock[],
  dates: Date[]
): Timeblock[] {
  // Return the previous timeblocks if the dates are empty
  if (!dates || dates.length === 0) {
    return prevTimeblocks;
  }

  // Get the soonest and latest dates from the given dates
  const { soonest, latest } = datesToDateMatrix(dates);
  const filteredTimeblocks: Timeblock[] = [];

  // Iterate through each timeblock
  for (const timeblock of prevTimeblocks) {
    const timeblockStart = dayjs(`${timeblock.date} ${timeblock.start_time}`);
    const timeblockEnd = dayjs(`${timeblock.date} ${timeblock.end_time}`);

    // Check if the timeblock is completely outside the date range
    if (timeblockStart.isBefore(soonest) && timeblockEnd.isBefore(soonest)) {
      // Add the timeblock to the filtered timeblocks
      // without any modification
      filteredTimeblocks.push(timeblock);
      continue;
    }

    if (timeblockStart.isAfter(latest) && timeblockEnd.isAfter(latest)) {
      // Add the timeblock to the filtered timeblocks
      // without any modification
      filteredTimeblocks.push(timeblock);
      continue;
    }

    // Split the timeblock no matter what, since it's inside the date range,
    // and we'll do the filtering to remove 0-duration timeblocks at the end
    const splitTimeblocks: Timeblock[] = [];

    // If the timeblock starts before the soonest date
    if (timeblockStart.set('date', soonest.date()).isBefore(soonest)) {
      const splitTimeblock = {
        ...timeblock,
        id: undefined,
        end_time: minTimetz(
          dayjs(soonest).format('HH:mm:ssZ'),
          timeblock.end_time
        ),
      };

      splitTimeblocks.push(splitTimeblock);
    }

    // If the timeblock ends after the latest date
    if (timeblockEnd.set('date', latest.date()).isAfter(latest)) {
      const splitTimeblock = {
        ...timeblock,
        id: undefined,
        start_time: maxTimetz(
          dayjs(latest).format('HH:mm:ssZ'),
          timeblock.start_time
        ),
      };

      splitTimeblocks.push(splitTimeblock);
    }

    // Add the split timeblocks to the filtered timeblocks
    filteredTimeblocks.push(...splitTimeblocks);
  }

  return filteredTimeblocks;
}
