import {
  addTimeblocks,
  datesToDateMatrix,
  durationToTimeblocks,
  removeTimeblocks,
} from '@/utils/timeblock-helper';
import { describe, expect, test } from 'vitest';
import dayjs from 'dayjs';
import { Timeblock } from '@/types/primitives/Timeblock';
import {
  compareTimetz,
  maxTimetz,
  minTimetz,
  timeToTimetz,
} from '@/utils/date-helper';

describe('timeToTimetz', () => {
  test('check timeToTimetz implementation', ({ expect }) => {
    // Test without forced offset
    const time = '08:00';
    const expectedOutput = `${time}:00+${-new Date().getTimezoneOffset() / 60}`;
    expect(timeToTimetz(time)).toBe(expectedOutput);

    // Test with positive forced offset
    const forcedOffsetPositive = 2;
    const expectedOutputPositive = `${time}:00+${forcedOffsetPositive}`;
    expect(timeToTimetz(time, forcedOffsetPositive)).toBe(
      expectedOutputPositive
    );

    // Test with negative forced offset
    const forcedOffsetNegative = -2;
    const expectedOutputNegative = `${time}:00${forcedOffsetNegative}`;
    expect(timeToTimetz(time, forcedOffsetNegative)).toBe(
      expectedOutputNegative
    );
  });
});

describe('compareTimetz', () => {
  test('check compareTimetz implementation', ({ expect }) => {
    // Test with equal times
    const time1 = '08:00:00+0';
    const time2 = '08:00:00+0';
    expect(compareTimetz(time1, time2)).toBe(0);

    // Test with time1 earlier than time2
    const time3 = '08:00:00+0';
    const time4 = '09:00:00+0';
    expect(compareTimetz(time3, time4)).toBe(-1);

    // Test with time1 later than time2
    const time5 = '10:00:00+0';
    const time6 = '09:00:00+0';
    expect(compareTimetz(time5, time6)).toBe(1);
  });
});

describe('minTimetz', () => {
  test('check minTimetz implementation', ({ expect }) => {
    // Test with equal times
    const time1 = '08:00:00+0';
    const time2 = '08:00:00+0';
    expect(minTimetz(time1, time2)).toBe(time1);

    // Test with time1 earlier than time2
    const time3 = '08:00:00+0';
    const time4 = '09:00:00+0';
    expect(minTimetz(time3, time4)).toBe(time3);

    // Test with time1 later than time2
    const time5 = '10:00:00+0';
    const time6 = '09:00:00+0';
    expect(minTimetz(time5, time6)).toBe(time6);
  });
});

describe('maxTimetz', () => {
  test('check maxTimetz implementation', ({ expect }) => {
    // Test with equal times
    const time1 = '08:00:00+0';
    const time2 = '08:00:00+0';
    expect(maxTimetz(time1, time2)).toBe(time1);

    // Test with time1 earlier than time2
    const time3 = '08:00:00+0';
    const time4 = '09:00:00+0';
    expect(maxTimetz(time3, time4)).toBe(time4);

    // Test with time1 later than time2
    const time5 = '10:00:00+0';
    const time6 = '09:00:00+0';
    expect(maxTimetz(time5, time6)).toBe(time5);
  });
});

describe('datesToDateMatrix', () => {
  test.each([[[]], [null], [undefined]])(
    'returns null for soonest and latest when given invalid input %s',
    (invalidInput) => {
      expect(() => {
        datesToDateMatrix(invalidInput);
      }).toThrow();
    }
  );

  test('handles dates with the same day but different times correctly', () => {
    const dates = [
      new Date(2023, 4, 1, 9, 30),
      new Date(2023, 4, 1, 10, 0),
      new Date(2023, 4, 1, 11, 15),
    ];
    const result = datesToDateMatrix(dates);
    expect(result.soonest.format()).toEqual(dayjs(dates[0]).format());
    expect(result.latest.format()).toEqual(
      dayjs(dates[2]).add(15, 'minutes').format()
    );
  });

  test('handles dates that span multiple years correctly', () => {
    const dates = [
      new Date(2021, 4, 1, 9, 30),
      new Date(2023, 5, 1, 10, 0),
      new Date(2022, 4, 1, 11, 15),
    ];
    const result = datesToDateMatrix(dates);
    expect(result.soonest.format()).toEqual(dayjs(dates[0]).format());
    expect(result.latest.format()).toEqual(
      dayjs(dates[1]).add(15, 'minutes').format()
    );
  });

  test('handles dates that are in descending order correctly', () => {
    const dates = [
      new Date(2023, 5, 1, 10, 0),
      new Date(2023, 4, 1, 11, 15),
      new Date(2023, 3, 1, 9, 30),
    ];
    const result = datesToDateMatrix(dates);
    expect(result.soonest.format()).toEqual(dayjs(dates[2]).format());
    expect(result.latest.format()).toEqual(
      dayjs(dates[0]).add(15, 'minutes').format()
    );
  });

  test('returns the same date for soonest and latest when given a single date', () => {
    const dates = [new Date(2023, 4, 1, 12, 0)];
    const result = datesToDateMatrix(dates);
    expect(result.soonest.format()).toEqual(dayjs(dates[0]).format());
    expect(result.latest.format()).toEqual(
      dayjs(dates[0]).add(15, 'minutes').format()
    );
  });

  test('handles dates with the same time correctly', () => {
    const dates = [
      new Date(2023, 4, 1, 12, 0),
      new Date(2023, 4, 1, 12, 0),
      new Date(2023, 4, 1, 12, 0),
    ];
    const result = datesToDateMatrix(dates);
    expect(result.soonest.format()).toEqual(dayjs(dates[0]).format());
    expect(result.latest.format()).toEqual(
      dayjs(dates[0]).add(15, 'minutes').format()
    );
  });

  test('handles an array with mixed date objects correctly', () => {
    const dates = [
      new Date(2023, 3, 1, 9, 30),
      new Date(2023, 5, 1, 10, 0),
      new Date(2023, 4, 1, 11, 15),
    ];
    const result = datesToDateMatrix(dates);
    expect(result.soonest.format('YYYY-MM-DD HH:mm')).toEqual(
      dayjs(new Date(2023, 3, 1, 9, 30)).format('YYYY-MM-DD HH:mm')
    );
    expect(result.latest.format('YYYY-MM-DD HH:mm')).toEqual(
      dayjs(new Date(2023, 5, 1, 10, 0))
        .add(15, 'minutes')
        .format('YYYY-MM-DD HH:mm')
    );
  });

  test('returns the correct soonest and latest dates when given valid dates', () => {
    const dates = [
      new Date(2023, 4, 1, 14, 30),
      new Date(2023, 4, 1, 9, 45),
      new Date(2023, 4, 1, 17, 10),
    ];
    const result = datesToDateMatrix(dates);
    expect(result.soonest.format()).toEqual(dayjs(dates[1]).format());
    expect(result.latest.format()).toEqual(
      dayjs(dates[2]).add(15, 'minutes').format()
    );
  });
});

describe('durationToTimeblocks', () => {
  test('returns an empty array if the input array does not have exactly two elements', () => {
    expect(durationToTimeblocks([])).toEqual([]);
    expect(durationToTimeblocks([new Date()])).toEqual([]);
    expect(durationToTimeblocks([new Date(), new Date(), new Date()])).toEqual(
      []
    );
  });

  test('returns an array of timeblocks for a duration in a day (normal flow)', () => {
    const dates = [
      new Date('2024-03-15T08:00:00'),
      new Date('2024-03-15T19:00:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+0',
        end_time: '19:15:00+0',
      },
    ];

    expect(durationToTimeblocks(dates, 0)).toEqual(expectedOutput);
  });

  test('returns an array of timeblocks for a duration spanning multiple days (normal flow)', () => {
    const dates = [
      new Date('2024-03-15T08:00:00'),
      new Date('2024-03-17T19:00:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+0',
        end_time: '19:15:00+0',
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+0',
        end_time: '19:15:00+0',
      },
      {
        date: '2024-03-17',
        start_time: '08:00:00+0',
        end_time: '19:15:00+0',
      },
    ];

    expect(durationToTimeblocks(dates, 0)).toEqual(expectedOutput);
  });

  test('returns an array of timeblocks for a duration in a day (reverse flow)', () => {
    const dates = [
      new Date('2024-03-15T19:00:00'),
      new Date('2024-03-15T08:00:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+0',
        end_time: '19:15:00+0',
      },
    ];

    expect(durationToTimeblocks(dates, 0)).toEqual(expectedOutput);
  });

  test('returns an array of timeblocks for a duration spanning multiple days (reverse flow)', () => {
    const dates = [
      new Date('2024-03-17T19:00:00'),
      new Date('2024-03-15T08:00:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+0',
        end_time: '19:15:00+0',
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+0',
        end_time: '19:15:00+0',
      },
      {
        date: '2024-03-17',
        start_time: '08:00:00+0',
        end_time: '19:15:00+0',
      },
    ];

    expect(durationToTimeblocks(dates, 0)).toEqual(expectedOutput);
  });

  test('returns an array of timeblocks for a duration spanning multiple days (with offset)', () => {
    const dates = [
      new Date('2024-03-15T08:00:00'),
      new Date('2024-03-17T19:00:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+2',
        end_time: '19:15:00+2',
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+2',
        end_time: '19:15:00+2',
      },
      {
        date: '2024-03-17',
        start_time: '08:00:00+2',
        end_time: '19:15:00+2',
      },
    ];

    expect(durationToTimeblocks(dates, 2)).toEqual(expectedOutput);
  });

  test('returns an array of timeblocks for a duration spanning multiple days (with negative offset)', () => {
    const dates = [
      new Date('2024-03-15T08:00:00'),
      new Date('2024-03-17T19:00:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00-2',
        end_time: '19:15:00-2',
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00-2',
        end_time: '19:15:00-2',
      },
      {
        date: '2024-03-17',
        start_time: '08:00:00-2',
        end_time: '19:15:00-2',
      },
    ];

    expect(durationToTimeblocks(dates, -2)).toEqual(expectedOutput);
  });
});

describe('addTimeblocks', () => {
  test('returns an empty array if both input arrays are empty', () => {
    const prevTimeblocks: Timeblock[] = [];
    const newTimeblocks: Timeblock[] = [];

    expect(addTimeblocks(prevTimeblocks, newTimeblocks)).toEqual([]);
  });

  test('returns the new timeblocks if the previous timeblocks array is empty', () => {
    const prevTimeblocks: Timeblock[] = [];
    const newTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+0',
        end_time: '19:15:00+0',
      },
    ];

    expect(addTimeblocks(prevTimeblocks, newTimeblocks)).toEqual(newTimeblocks);
  });

  test('returns the previous timeblocks if the new timeblocks array is empty', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+0',
        end_time: '19:15:00+0',
      },
    ];
    const newTimeblocks: Timeblock[] = [];

    expect(addTimeblocks(prevTimeblocks, newTimeblocks)).toEqual(
      prevTimeblocks
    );
  });

  test('returns the correct timeblocks when both arrays are non-empty', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+0',
        end_time: '19:15:00+0',
      },
    ];
    const newTimeblocks: Timeblock[] = [
      {
        date: '2024-03-16',
        start_time: '08:00:00+0',
        end_time: '19:15:00+0',
      },
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+0',
        end_time: '19:15:00+0',
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+0',
        end_time: '19:15:00+0',
      },
    ];

    expect(addTimeblocks(prevTimeblocks, newTimeblocks)).toEqual(
      expectedOutput
    );
  });

  test('returns the correct timeblocks when both arrays are non-empty and overlapping', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+0',
        end_time: '19:15:00+0',
      },
    ];
    const newTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '10:00:00+0',
        end_time: '15:15:00+0',
      },
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+0',
        end_time: '19:15:00+0',
      },
    ];

    expect(addTimeblocks(prevTimeblocks, newTimeblocks)).toEqual(
      expectedOutput
    );
  });

  test('returns the correct timeblocks when both arrays are non-empty and not overlapping', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+0',
        end_time: '19:15:00+0',
      },
    ];
    const newTimeblocks: Timeblock[] = [
      {
        date: '2024-03-16',
        start_time: '10:00:00+0',
        end_time: '15:15:00+0',
      },
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+0',
        end_time: '19:15:00+0',
      },
      {
        date: '2024-03-16',
        start_time: '10:00:00+0',
        end_time: '15:15:00+0',
      },
    ];

    expect(addTimeblocks(prevTimeblocks, newTimeblocks)).toEqual(
      expectedOutput
    );
  });

  test('returns the correct timeblocks when both arrays are non-empty and partially overlapping', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+0',
        end_time: '19:15:00+0',
      },
    ];
    const newTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '10:00:00+0',
        end_time: '23:15:00+0',
      },
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+0',
        end_time: '23:15:00+0',
      },
    ];

    expect(addTimeblocks(prevTimeblocks, newTimeblocks)).toEqual(
      expectedOutput
    );
  });

  test('returns the correct timeblocks when both arrays are non-empty and partially overlapping (reverse order)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '10:00:00+0',
        end_time: '23:15:00+0',
      },
    ];
    const newTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+0',
        end_time: '19:15:00+0',
      },
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+0',
        end_time: '23:15:00+0',
      },
    ];

    expect(addTimeblocks(prevTimeblocks, newTimeblocks)).toEqual(
      expectedOutput
    );
  });
});

describe('removeTimeblocks', () => {
  test('returns an empty array if both input arrays are empty', () => {
    const prevTimeblocks: Timeblock[] = [];
    const dates: Date[] = [];

    expect(removeTimeblocks(prevTimeblocks, dates)).toEqual([]);
  });

  test('returns the previous timeblocks if the dates array is empty', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+0',
        end_time: '19:15:00+0',
      },
    ];
    const dates: Date[] = [];

    expect(removeTimeblocks(prevTimeblocks, dates)).toEqual(prevTimeblocks);
  });

  test('returns an empty array if the previous timeblocks array is empty', () => {
    const prevTimeblocks: Timeblock[] = [];
    const dates: Date[] = [new Date('2024-03-15T08:00:00')];

    expect(removeTimeblocks(prevTimeblocks, dates)).toEqual([]);
  });

  // test('cut first split of a timeblock that is in the removal date range (single day)', () => {
  //   const prevTimeblocks: Timeblock[] = [
  //     {
  //       date: '2024-03-15',
  //       start_time: '08:00:00+0',
  //       end_time: '19:15:00+0',
  //     },
  //   ];
  //   const dates: Date[] = [
  //     new Date('2024-03-15T08:00:00'),
  //     new Date('2024-03-15T12:00:00'),
  //   ];

  //   const expectedOutput: Timeblock[] = [
  //     {
  //       date: '2024-03-15',
  //       start_time: '12:00:00+0',
  //       end_time: '19:15:00+0',
  //     },
  //   ];

  //   expect(removeTimeblocks(prevTimeblocks, dates)).toEqual(expectedOutput);
  // });
});
