import { Timeblock } from '@/types/primitives/Timeblock';
import dayjs, { Dayjs } from 'dayjs';

import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isBetween from 'dayjs/plugin/isBetween';
import timezone from 'dayjs/plugin/timezone';
import minMax from 'dayjs/plugin/minMax';
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

  const now = dayjs(dates[0]);

  let soonest = now;
  let latest = now;

  for (let i = 1; i < dates.length; i++) {
    const date = dayjs(dates[i])
      .set('year', now.year())
      .set('month', now.month())
      .set('date', now.date());

    if (date.isBefore(soonest, 'hour')) {
      soonest = date;
    } else if (date.isAfter(latest, 'hour')) {
      latest = date;
    }
  }

  return {
    soonest,
    latest,
  };
}

export function durationToTimeblocks(
  dates: Date[],
  forcedOffset?: number
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

    const startTime = dayjs(soonestTime)
      .utcOffset(forcedOffset ?? start.utcOffset(), true)
      .format('HH:mm:ssZ');

    const endTime = dayjs(latestTime)
      .utcOffset(forcedOffset ?? start.utcOffset(), true)
      .add(15, 'minutes')
      .format('HH:mm:ssZ');

    timeblocks.push({
      date,
      start_time: startTime,
      end_time: endTime,
    });

    // Increment the date
    start = start.add(1, 'day');
  }

  return timeblocks;
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

  let nextTBs: Timeblock[] = [];

  for (let i = 0; i < sortedTimeblocks.length; i++) {
    const lastTB = nextTBs[nextTBs.length - 1];
    const currTB = sortedTimeblocks[i];

    // If nextTBs is empty, add the current timeblock
    if (nextTBs.length === 0) {
      nextTBs.push(currTB);
      continue;
    }

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
      continue;
    }
  }

  return filteredTimeblocks.filter(
    (timeblock) => timeblock.start_time !== timeblock.end_time
  );
}
