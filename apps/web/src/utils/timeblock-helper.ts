import { Timeblock } from '@/types/primitives/Timeblock';
import dayjs, { Dayjs } from 'dayjs';
import { maxTimetz, minTimetz, timeToTimetz } from './date-helper';

export function datesToDateMatrix(dates: Date[]): {
  soonest: Dayjs;
  latest: Dayjs;
} {
  const sortedDates = dates.sort((a, b) => {
    return a.getTime() - b.getTime();
  });

  const dateWithEarliestTime = sortedDates.reduce((prev, curr) => {
    // check for difference in both hours and minutes
    return prev.getHours() < curr.getHours() ||
      (prev.getHours() === curr.getHours() &&
        prev.getMinutes() < curr.getMinutes())
      ? prev
      : curr;
  });

  const dateWithLatestTime = dayjs(
    sortedDates.reduce((prev, curr) => {
      // check for difference in both hours and minutes
      return prev.getHours() > curr.getHours() ||
        (prev.getHours() === curr.getHours() &&
          prev.getMinutes() > curr.getMinutes())
        ? prev
        : curr;
    })
  ).add(15, 'minutes');

  const soonest = dayjs(dateWithEarliestTime).set('date', dates[0].getDate());

  const latest = dayjs(dateWithLatestTime).set(
    'date',
    dates[dates.length - 1].getDate()
  );

  return { soonest, latest };
}

export function durationToTimeblocks(dates: Date[]): Timeblock[] {
  if (dates.length != 2) return [];
  const timeblocks: Timeblock[] = [];

  const { soonest, latest } = datesToDateMatrix(dates);
  let start = soonest;

  while (start.isBefore(latest)) {
    const date = start.format('YYYY-MM-DD');

    const startTime = dayjs(soonest).format('HH:mm');
    const endTime = dayjs(latest).format('HH:mm');

    timeblocks.push({
      date,
      start_time: timeToTimetz(startTime),
      end_time: timeToTimetz(endTime),
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
  dates: Date[]
): Timeblock[] {
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
          timeToTimetz(dayjs(soonest).format('HH:mm')),
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
          timeToTimetz(dayjs(latest).format('HH:mm')),
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
