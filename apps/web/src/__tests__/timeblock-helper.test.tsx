import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import {
  compareTimetz,
  maxTimetz,
  minTimetz,
} from '@tuturuuu/utils/date-helper';
import {
  addTimeblocks,
  datesToDateMatrix,
  datesToTimeMatrix,
  durationToTimeblocks,
  getDateStrings,
  removeTimeblocks,
} from '@tuturuuu/utils/timeblock-helper';
import dayjs from 'dayjs';
import { describe, expect, test } from 'vitest';

describe('compareTimetz', () => {
  test('check compareTimetz implementation', () => {
    // Test with equal times
    const time1 = '08:00:00+00:00';
    const time2 = '08:00:00+00:00';
    expect(compareTimetz(time1, time2)).toBe(0);

    // Test with time1 earlier than time2
    const time3 = '08:00:00+00:00';
    const time4 = '09:00:00+00:00';
    expect(compareTimetz(time3, time4)).toBe(-1);

    // Test with time1 later than time2
    const time5 = '10:00:00+00:00';
    const time6 = '09:00:00+00:00';
    expect(compareTimetz(time5, time6)).toBe(1);
  });
});

describe('minTimetz', () => {
  test('check minTimetz implementation', () => {
    // Test with equal times
    const time1 = '08:00:00+00:00';
    const time2 = '08:00:00+00:00';
    expect(minTimetz(time1, time2)).toBe(time1);

    // Test with time1 earlier than time2
    const time3 = '08:00:00+00:00';
    const time4 = '09:00:00+00:00';
    expect(minTimetz(time3, time4)).toBe(time3);

    // Test with time1 later than time2
    const time5 = '10:00:00+00:00';
    const time6 = '09:00:00+00:00';
    expect(minTimetz(time5, time6)).toBe(time6);
  });
});

describe('maxTimetz', () => {
  test('check maxTimetz implementation', () => {
    // Test with equal times
    const time1 = '08:00:00+00:00';
    const time2 = '08:00:00+00:00';
    expect(maxTimetz(time1, time2)).toBe(time1);

    // Test with time1 earlier than time2
    const time3 = '08:00:00+00:00';
    const time4 = '09:00:00+00:00';
    expect(maxTimetz(time3, time4)).toBe(time4);

    // Test with time1 later than time2
    const time5 = '10:00:00+00:00';
    const time6 = '09:00:00+00:00';
    expect(maxTimetz(time5, time6)).toBe(time5);
  });
});

describe('getDateStrings', () => {
  test('returns an empty array if the input array is empty', () => {
    expect(getDateStrings([])).toEqual([]);
  });

  test('returns an array of date strings when given valid dates (same dates)', () => {
    const dates = [
      new Date(2023, 4, 1, 9, 30),
      new Date(2023, 4, 1, 10, 0),
      new Date(2023, 4, 1, 11, 15),
    ];
    const result = getDateStrings(dates);
    expect(result).toEqual(['2023-05-01', '2023-05-01', '2023-05-01']);
  });

  test('returns an array of date strings when given valid dates (different dates)', () => {
    const dates = [
      new Date(2023, 4, 1, 9, 30),
      new Date(2023, 5, 1, 10, 0),
      new Date(2023, 4, 1, 11, 15),
    ];
    const result = getDateStrings(dates);
    expect(result).toEqual(['2023-05-01', '2023-06-01', '2023-05-01']);
  });

  test('returns an array of date strings when given valid dates (different years)', () => {
    const dates = [
      new Date(2021, 4, 1, 9, 30),
      new Date(2023, 5, 1, 10, 0),
      new Date(2022, 4, 1, 11, 15),
    ];
    const result = getDateStrings(dates);
    expect(result).toEqual(['2021-05-01', '2023-06-01', '2022-05-01']);
  });
});

describe('datesToTimeMatrix', () => {
  test.each([
    [[]],
    [null],
    [undefined],
  ])('returns null for soonest and latest when given invalid input %s', (invalidInput) => {
    expect(() => {
      datesToTimeMatrix(invalidInput);
    }).toThrow();
  });

  test('return the same time for soonest and latest when given a single date', () => {
    const dates = [new Date(2023, 4, 1, 12, 0)];
    const result = datesToTimeMatrix(dates);
    expect(result.soonest).toEqual(dayjs(dates[0]));
    expect(result.latest).toEqual(dayjs(dates[0]));
  });

  test('handles dates with the same time correctly', () => {
    const dates = [
      new Date(2023, 4, 1, 12, 0),
      new Date(2023, 4, 1, 12, 0),
      new Date(2023, 4, 1, 12, 0),
    ];
    const result = datesToTimeMatrix(dates);
    expect(result.soonest.format('HH:mm:ssZ')).toEqual(
      dayjs(dates[0]).format('HH:mm:ssZ')
    );
    expect(result.latest.format('HH:mm:ssZ')).toEqual(
      dayjs(dates[0]).format('HH:mm:ssZ')
    );
  });

  test('handles dates with the same day but different times correctly', () => {
    const dates = [
      new Date(2023, 4, 1, 9, 30),
      new Date(2023, 4, 1, 10, 0),
      new Date(2023, 4, 1, 11, 15),
    ];
    const result = datesToTimeMatrix(dates);
    expect(result.soonest.format('HH:mm:ssZ')).toEqual(
      dayjs(dates[0]).format('HH:mm:ssZ')
    );
    expect(result.latest.format('HH:mm:ssZ')).toEqual(
      dayjs(dates[2]).format('HH:mm:ssZ')
    );
  });

  test('handles dates that span multiple years correctly', () => {
    const dates = [
      new Date(2021, 4, 1, 9, 30),
      new Date(2023, 5, 1, 10, 0),
      new Date(2022, 4, 1, 11, 15),
    ];
    const result = datesToTimeMatrix(dates);
    expect(result.soonest.format('HH:mm:ssZ')).toEqual(
      dayjs(dates[0]).format('HH:mm:ssZ')
    );
    expect(result.latest.format('HH:mm:ssZ')).toEqual(
      dayjs(dates[2]).format('HH:mm:ssZ')
    );
  });

  test('handles dates that are in descending order correctly', () => {
    const dates = [
      new Date(2023, 5, 1, 10, 0),
      new Date(2023, 4, 1, 11, 15),
      new Date(2023, 3, 1, 9, 30),
    ];
    const result = datesToTimeMatrix(dates);
    expect(result.soonest.format('HH:mm:ssZ')).toEqual(
      dayjs(dates[2]).format('HH:mm:ssZ')
    );
    expect(result.latest.format('HH:mm:ssZ')).toEqual(
      dayjs(dates[1]).format('HH:mm:ssZ')
    );
  });

  test('returns the correct soonest and latest times when given valid dates', () => {
    const dates = [
      new Date(2023, 4, 1, 14, 30),
      new Date(2023, 4, 1, 9, 45),
      new Date(2023, 4, 1, 17, 10),
    ];
    const result = datesToTimeMatrix(dates);
    expect(result.soonest.format('HH:mm:ssZ')).toEqual(
      dayjs(dates[1]).format('HH:mm:ssZ')
    );
    expect(result.latest.format('HH:mm:ssZ')).toEqual(
      dayjs(dates[2]).format('HH:mm:ssZ')
    );
  });

  test('handles dates with different days, months, years and times correctly', () => {
    const dates = [
      new Date(2023, 4, 1, 14, 30),
      new Date(2023, 5, 1, 9, 45),
      new Date(2023, 6, 1, 17, 10),
    ];
    const result = datesToTimeMatrix(dates);
    expect(result.soonest.format('HH:mm:ssZ')).toEqual(
      dayjs(dates[1]).format('HH:mm:ssZ')
    );
    expect(result.latest.format('HH:mm:ssZ')).toEqual(
      dayjs(dates[2]).format('HH:mm:ssZ')
    );
  });
});

describe('datesToDateMatrix', () => {
  test.each([
    [[]],
    [null],
    [undefined],
  ])('returns null for soonest and latest when given invalid input %s', (invalidInput) => {
    expect(() => {
      datesToDateMatrix(invalidInput);
    }).toThrow();
  });

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
  test('returns an empty array if the input array is empty', () => {
    expect(durationToTimeblocks([], false)).toEqual([]);
  });

  test('returns a single 15-minute timeblock for a single date', () => {
    const date = new Date('2024-03-15T08:00:00+00:00');
    const result = durationToTimeblocks([date], false);
    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: result[0]!.start_time,
        end_time: result[0]!.end_time,
        tentative: false,
      },
    ];

    expect(durationToTimeblocks([date], false)).toEqual(expectedOutput);
  });

  test('returns an empty array if the input array has more than two elements', () => {
    expect(
      durationToTimeblocks([new Date(), new Date(), new Date()], false)
    ).toEqual([]);
  });

  test('returns a single 15-minute timeblock when both dates are the same', () => {
    const sameDate = new Date('2024-03-15T08:00:00+00:00');
    const dates = [sameDate, sameDate];
    const result = durationToTimeblocks(dates, false);

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: result[0]!.start_time,
        end_time: result[0]!.end_time,
        tentative: false,
      },
    ];

    expect(durationToTimeblocks(dates, false)).toEqual(expectedOutput);
  });

  test.skip('returns an array of timeblocks for a duration in a day (normal order)', () => {
    const dates = [
      new Date('2024-03-15T08:00:00+00:00'),
      new Date('2024-03-15T19:00:00+00:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: dayjs(dates[0]).format('HH:mm:ssZ'),
        end_time: dayjs(dates[1]).add(15, 'minutes').format('HH:mm:ssZ'),
        tentative: false,
      },
    ];

    expect(durationToTimeblocks(dates, false)).toEqual(expectedOutput);
  });

  test.skip('returns an array of timeblocks for a duration spanning multiple days (normal order)', () => {
    const dates = [
      new Date('2024-03-15T08:00:00+00:00'),
      new Date('2024-03-17T19:00:00+00:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: dayjs(dates[0]).format('HH:mm:ssZ'),
        end_time: dayjs(dates[1]).add(15, 'minutes').format('HH:mm:ssZ'),
        tentative: false,
      },
      {
        date: '2024-03-16',
        start_time: dayjs(dates[0]).format('HH:mm:ssZ'),
        end_time: dayjs(dates[1]).add(15, 'minutes').format('HH:mm:ssZ'),
        tentative: false,
      },
      {
        date: '2024-03-17',
        start_time: dayjs(dates[0]).format('HH:mm:ssZ'),
        end_time: dayjs(dates[1]).add(15, 'minutes').format('HH:mm:ssZ'),
        tentative: false,
      },
    ];

    expect(durationToTimeblocks(dates, false)).toEqual(expectedOutput);
  });

  test.skip('returns an array of timeblocks for a duration in a day (reverse order)', () => {
    const dates = [
      new Date('2024-03-15T08:00:00+00:00'),
      new Date('2024-03-15T19:00:00+00:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: dayjs(dates[0]).format('HH:mm:ssZ'),
        end_time: dayjs(dates[1]).add(15, 'minutes').format('HH:mm:ssZ'),
        tentative: false,
      },
    ];

    expect(durationToTimeblocks(dates, false)).toEqual(expectedOutput);
  });

  test.skip('returns an array of timeblocks for a duration spanning multiple days (reverse order)', () => {
    const dates = [
      new Date('2024-03-15T08:00:00+00:00'),
      new Date('2024-03-17T19:00:00+00:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: dayjs(dates[0]).format('HH:mm:ssZ'),
        end_time: dayjs(dates[1]).add(15, 'minutes').format('HH:mm:ssZ'),
        tentative: false,
      },
      {
        date: '2024-03-16',
        start_time: dayjs(dates[0]).format('HH:mm:ssZ'),
        end_time: dayjs(dates[1]).add(15, 'minutes').format('HH:mm:ssZ'),
        tentative: false,
      },
      {
        date: '2024-03-17',
        start_time: dayjs(dates[0]).format('HH:mm:ssZ'),
        end_time: dayjs(dates[1]).add(15, 'minutes').format('HH:mm:ssZ'),
        tentative: false,
      },
    ];

    expect(durationToTimeblocks(dates, false)).toEqual(expectedOutput);
  });

  test.skip('returns an array of timeblocks for a duration spanning multiple days (with offset)', () => {
    const dates = [
      new Date('2024-03-15T08:00:00+02:00'),
      new Date('2024-03-17T19:00:00+02:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: dayjs(dates[0]).format('HH:mm:ssZ'),
        end_time: dayjs(dates[1]).add(15, 'minutes').format('HH:mm:ssZ'),
        tentative: false,
      },
      {
        date: '2024-03-16',
        start_time: dayjs(dates[0]).format('HH:mm:ssZ'),
        end_time: dayjs(dates[1]).add(15, 'minutes').format('HH:mm:ssZ'),
        tentative: false,
      },
      {
        date: '2024-03-17',
        start_time: dayjs(dates[0]).format('HH:mm:ssZ'),
        end_time: dayjs(dates[1]).add(15, 'minutes').format('HH:mm:ssZ'),
        tentative: false,
      },
    ];

    expect(durationToTimeblocks(dates, false)).toEqual(expectedOutput);
  });

  test.skip('returns an array of timeblocks for a duration spanning multiple days (with negative offset)', () => {
    const dates = [
      new Date('2024-03-15T08:00:00-02:00'),
      new Date('2024-03-17T19:00:00-02:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: dayjs(dates[0]).format('HH:mm:ssZ'),
        end_time: dayjs(dates[1]).add(15, 'minutes').format('HH:mm:ssZ'),
        tentative: false,
      },
      {
        date: '2024-03-16',
        start_time: dayjs(dates[0]).format('HH:mm:ssZ'),
        end_time: dayjs(dates[1]).add(15, 'minutes').format('HH:mm:ssZ'),
        tentative: false,
      },
      {
        date: '2024-03-17',
        start_time: dayjs(dates[0]).format('HH:mm:ssZ'),
        end_time: dayjs(dates[1]).add(15, 'minutes').format('HH:mm:ssZ'),
        tentative: false,
      },
    ];

    expect(durationToTimeblocks(dates, false)).toEqual(expectedOutput);
  });
});

describe('addTimeblocks', () => {
  test('returns an empty array if both input arrays are empty', () => {
    const prevTimeblocks: Timeblock[] = [];
    const newDates: Date[] = [];

    expect(addTimeblocks(prevTimeblocks, newDates, false)).toEqual([]);
  });

  test('returns the new timeblocks if the previous timeblocks array is empty', () => {
    const prevTimeblocks: Timeblock[] = [];
    const newDates: Date[] = [
      new Date('2024-03-15T08:00:00+00:00'),
      new Date('2024-03-15T19:15:00+00:00'),
    ];

    expect(addTimeblocks(prevTimeblocks, newDates, false)).toEqual(
      durationToTimeblocks(newDates, false)
    );
  });

  test('returns a single 15-minute timeblock when adding one date', () => {
    const prevTimeblocks: Timeblock[] = [];
    const newDates: Date[] = [new Date('2024-03-15T08:00:00+00:00')];
    const result = addTimeblocks(prevTimeblocks, newDates, false);

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: result[0]!.start_time,
        end_time: result[0]!.end_time,
        tentative: false,
      },
    ];

    expect(addTimeblocks(prevTimeblocks, newDates, false)).toEqual(
      expectedOutput
    );
  });

  test('returns a single 15-minute timeblock when adding same dates (drag and drop fix)', () => {
    const prevTimeblocks: Timeblock[] = [];
    const sameDate = new Date('2024-03-15T08:00:00+00:00');
    const newDates: Date[] = [sameDate, sameDate];
    const result = addTimeblocks(prevTimeblocks, newDates, false);

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: result[0]!.start_time,
        end_time: result[0]!.end_time,
        tentative: false,
      },
    ];

    expect(addTimeblocks(prevTimeblocks, newDates, false)).toEqual(
      expectedOutput
    );
  });

  test.skip('returns the previous timeblocks if the new timeblocks array is empty', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];
    const newDates: Date[] = [];

    expect(addTimeblocks(prevTimeblocks, newDates, false)).toEqual(
      prevTimeblocks
    );
  });

  test.skip('returns the correct timeblocks when both arrays are non-empty', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];
    const newDates: Date[] = [
      new Date('2024-03-16T08:00:00+00:00'),
      new Date('2024-03-16T19:15:00+00:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];

    expect(addTimeblocks(prevTimeblocks, newDates, false)).toEqual(
      expectedOutput
    );
  });

  test.skip('returns the correct timeblocks when both arrays are non-empty and overlapping', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];
    const newDates: Date[] = [
      new Date('2024-03-15T10:00:00+00:00'),
      new Date('2024-03-15T15:15:00+00:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];

    expect(addTimeblocks(prevTimeblocks, newDates, false)).toEqual(
      expectedOutput
    );
  });

  test.skip('returns the correct timeblocks when both arrays are non-empty and not overlapping', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];
    const newDates: Date[] = [
      new Date('2024-03-16T10:00:00+00:00'),
      new Date('2024-03-16T15:15:00+00:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
      {
        date: '2024-03-16',
        start_time: '10:00:00+00:00',
        end_time: '15:15:00+00:00',
        tentative: false,
      },
    ];

    expect(addTimeblocks(prevTimeblocks, newDates, false)).toEqual(
      expectedOutput
    );
  });

  test.skip('returns the correct timeblocks when both arrays are non-empty and partially overlapping', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];
    const newDates: Date[] = [
      new Date('2024-03-15T10:00:00+00:00'),
      new Date('2024-03-15T23:15:00+00:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '23:15:00+00:00',
        tentative: false,
      },
    ];

    expect(addTimeblocks(prevTimeblocks, newDates, false)).toEqual(
      expectedOutput
    );
  });

  test.skip('returns the correct timeblocks when both arrays are non-empty and partially overlapping (reverse order)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '10:00:00+00:00',
        end_time: '23:15:00+00:00',
        tentative: false,
      },
    ];
    const newDates: Date[] = [
      new Date('2024-03-15T08:00:00+00:00'),
      new Date('2024-03-15T19:15:00+00:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '23:15:00+00:00',
        tentative: false,
      },
    ];

    expect(addTimeblocks(prevTimeblocks, newDates, false)).toEqual(
      expectedOutput
    );
  });
});

describe('removeTimeblocks', () => {
  test.skip('returns an empty array if both input arrays are empty', () => {
    const prevTimeblocks: Timeblock[] = [];
    const dates: Date[] = [];

    expect(removeTimeblocks(prevTimeblocks, dates)).toEqual([]);
  });

  test('returns the previous timeblocks if the dates array is empty', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];
    const dates: Date[] = [];

    expect(removeTimeblocks(prevTimeblocks, dates)).toEqual(prevTimeblocks);
  });

  test('removes a single 15-minute timeblock precisely', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '09:00:00+00:00',
        tentative: false,
      },
    ];
    const dates: Date[] = [new Date('2024-03-15T08:15:00+00:00')];
    const result = removeTimeblocks(prevTimeblocks, dates);

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: result[0]!.end_time,
        tentative: false,
      },
      {
        date: '2024-03-15',
        start_time: result[1]!.start_time,
        end_time: '09:00:00+00:00',
        tentative: false,
      },
    ];

    expect(removeTimeblocks(prevTimeblocks, dates)).toEqual(expectedOutput);
  });

  test('removes a single 15-minute timeblock when both dates are the same', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '08:15:00+00:00',
        tentative: false,
      },
    ];
    const sameDate = new Date('2024-03-15T08:00:00+00:00');
    const dates: Date[] = [sameDate, sameDate];

    const expectedOutput: Timeblock[] = [];

    expect(removeTimeblocks(prevTimeblocks, dates)).toEqual(expectedOutput);
  });

  test('removes multi-day timeblocks correctly (same time slot each day)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '09:00:00+00:00',
        tentative: false,
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '09:00:00+00:00',
        tentative: false,
      },
      {
        date: '2024-03-17',
        start_time: '08:00:00+00:00',
        end_time: '09:00:00+00:00',
        tentative: false,
      },
      {
        date: '2024-03-15',
        start_time: '10:00:00+00:00',
        end_time: '11:00:00+00:00',
        tentative: false,
      },
    ];

    // Remove 8-9 AM on March 15-17
    const startDate = new Date('2024-03-15T08:00:00+00:00');
    const endDate = new Date('2024-03-17T09:00:00+00:00');
    const dates: Date[] = [startDate, endDate];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '10:00:00+00:00',
        end_time: '11:00:00+00:00',
        tentative: false,
      },
    ];

    expect(removeTimeblocks(prevTimeblocks, dates)).toEqual(expectedOutput);
  });

  test('removes single timeblock with precise time matching', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:15:00+00:00',
        end_time: '08:30:00+00:00',
        tentative: false,
      },
    ];

    // Try to remove at 08:15:30 (should match the 08:15-08:30 slot)
    const removalDate = new Date('2024-03-15T08:15:30+00:00');
    const dates: Date[] = [removalDate];

    const expectedOutput: Timeblock[] = [];

    expect(removeTimeblocks(prevTimeblocks, dates)).toEqual(expectedOutput);
  });

  test('removes full hour range correctly (8-9 AM)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '09:00:00+00:00',
        tentative: false,
      },
    ];

    // Remove 8-9 AM (should remove the entire hour)
    const startDate = new Date('2024-03-15T08:00:00+00:00');
    const endDate = new Date('2024-03-15T09:00:00+00:00');
    const dates: Date[] = [startDate, endDate];

    const expectedOutput: Timeblock[] = [];

    expect(removeTimeblocks(prevTimeblocks, dates)).toEqual(expectedOutput);
  });

  test('removes full hour range correctly across multiple days (8-9 AM)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '09:00:00+00:00',
        tentative: false,
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '09:00:00+00:00',
        tentative: false,
      },
      {
        date: '2024-03-17',
        start_time: '08:00:00+00:00',
        end_time: '09:00:00+00:00',
        tentative: false,
      },
    ];

    // Remove 8-9 AM across March 15-17 (should remove the entire hour on each day)
    const startDate = new Date('2024-03-15T08:00:00+00:00');
    const endDate = new Date('2024-03-17T09:00:00+00:00');
    const dates: Date[] = [startDate, endDate];

    const expectedOutput: Timeblock[] = [];

    expect(removeTimeblocks(prevTimeblocks, dates)).toEqual(expectedOutput);
  });

  test('fixes UI sending 8:59:59 instead of 9:00:00', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '09:00:00+00:00',
        tentative: false,
      },
    ];

    // Simulate UI sending 8:59:59 instead of 9:00:00
    const startDate = new Date('2024-03-15T08:00:00+00:00');
    const endDate = new Date('2024-03-15T08:59:59+00:00'); // UI sends 8:59:59
    const dates: Date[] = [startDate, endDate];

    const expectedOutput: Timeblock[] = [];

    expect(removeTimeblocks(prevTimeblocks, dates)).toEqual(expectedOutput);
  });

  test.skip('returns an empty array if the previous timeblocks array is empty', () => {
    const prevTimeblocks: Timeblock[] = [];
    const dates: Date[] = [new Date('2024-03-15T08:00:00+00:00')];

    expect(removeTimeblocks(prevTimeblocks, dates)).toEqual([]);
  });

  test.skip('cut first split of a timeblock that is in the removal date range (single day)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];
    const dates: Date[] = [
      new Date('2024-03-15T08:00:00+00:00'),
      new Date('2024-03-15T12:00:00+00:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '12:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];

    expect(removeTimeblocks(prevTimeblocks, dates)).toEqual(expectedOutput);
  });

  test.skip('cut first split of a timeblock that is in the removal date range (multiple days)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];
    const dates: Date[] = [
      new Date('2024-03-15T08:00:00+00:00'),
      new Date('2024-03-15T12:00:00+00:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '12:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];

    expect(removeTimeblocks(prevTimeblocks, dates)).toEqual(expectedOutput);
  });

  test.skip('cut last split of a timeblock that is in the removal date range (single day)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];
    const dates: Date[] = [
      new Date('2024-03-15T12:00:00+00:00'),
      new Date('2024-03-15T19:15:00+00:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '12:00:00+00:00',
        tentative: false,
      },
    ];

    expect(removeTimeblocks(prevTimeblocks, dates)).toEqual(expectedOutput);
  });

  test.skip('cut last split of a timeblock that is in the removal date range (multiple days)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];
    const dates: Date[] = [
      new Date('2024-03-15T12:00:00+00:00'),
      new Date('2024-03-15T19:15:00+00:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '12:00:00+00:00',
        tentative: false,
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];

    expect(removeTimeblocks(prevTimeblocks, dates)).toEqual(expectedOutput);
  });

  test.skip('cut middle split of a timeblock that is in the removal date range (single day)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];
    const dates: Date[] = [
      new Date('2024-03-15T10:00:00+00:00'),
      new Date('2024-03-15T15:15:00+00:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '10:00:00+00:00',
        tentative: false,
      },
      {
        date: '2024-03-15',
        start_time: '15:30:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];

    expect(removeTimeblocks(prevTimeblocks, dates)).toEqual(expectedOutput);
  });

  test.skip('cut middle split of a timeblock that is in the removal date range (multiple days)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];
    const dates: Date[] = [
      new Date('2024-03-15T10:00:00+00:00'),
      new Date('2024-03-15T15:15:00+00:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '10:00:00+00:00',
        tentative: false,
      },
      {
        date: '2024-03-15',
        start_time: '15:30:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];

    expect(removeTimeblocks(prevTimeblocks, dates)).toEqual(expectedOutput);
  });

  test.skip('cut entire timeblock that is in the removal date range (single day)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];
    const dates: Date[] = [
      new Date('2024-03-15T08:00:00+00:00'),
      new Date('2024-03-15T19:15:00+00:00'),
    ];

    const expectedOutput: Timeblock[] = [];

    expect(removeTimeblocks(prevTimeblocks, dates)).toEqual(expectedOutput);
  });

  test.skip('cut entire timeblock that is in the removal date range (multiple days)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];
    const dates: Date[] = [
      new Date('2024-03-15T08:00:00+00:00'),
      new Date('2024-03-15T19:15:00+00:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];

    expect(removeTimeblocks(prevTimeblocks, dates)).toEqual(expectedOutput);
  });

  test.skip('cut entire timeblock that is in the removal date range (multiple days, multiple timeblocks)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '12:00:00+00:00',
        tentative: false,
      },
      {
        date: '2024-03-15',
        start_time: '12:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];
    const dates: Date[] = [
      new Date('2024-03-15T08:00:00+00:00'),
      new Date('2024-03-15T19:15:00+00:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];

    expect(removeTimeblocks(prevTimeblocks, dates)).toEqual(expectedOutput);
  });

  test.skip('cut entire timeblock that is in the removal date range (multiple days, multiple timeblocks, multiple removals)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '12:00:00+00:00',
        tentative: false,
      },
      {
        date: '2024-03-15',
        start_time: '12:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];
    const dates: Date[] = [
      new Date('2024-03-15T08:00:00+00:00'),
      new Date('2024-03-16T19:15:00+00:00'),
    ];

    const expectedOutput: Timeblock[] = [];

    expect(removeTimeblocks(prevTimeblocks, dates)).toEqual(expectedOutput);
  });

  test.skip('cut entire timeblock that is in the removal date range (multiple days, multiple timeblocks, multiple removals, reverse order)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '12:00:00+00:00',
        tentative: false,
      },
      {
        date: '2024-03-15',
        start_time: '12:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
        tentative: false,
      },
    ];
    const dates: Date[] = [
      new Date('2024-03-16T19:15:00+00:00'),
      new Date('2024-03-15T08:00:00+00:00'),
    ];

    const expectedOutput: Timeblock[] = [];

    expect(removeTimeblocks(prevTimeblocks, dates)).toEqual(expectedOutput);
  });
});
