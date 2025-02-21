import { compareTimetz, maxTimetz, minTimetz } from '@/utils/date-helper';
import {
  _experimentalAddTimeblocks as addTimeblocks,
  datesToDateMatrix,
  datesToTimeMatrix,
  durationToTimeblocks,
  getDateStrings,
  _experimentalRemoveTimeblocks as removeTimeblocks,
} from '@/utils/timeblock-helper';
import { Timeblock } from '@tutur3u/types/primitives/Timeblock';
import dayjs from 'dayjs';
import { describe, expect, test } from 'vitest';

describe('compareTimetz', () => {
  test('check compareTimetz implementation', ({ expect }) => {
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
  test('check minTimetz implementation', ({ expect }) => {
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
  test('check maxTimetz implementation', ({ expect }) => {
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
  test.each([[[]], [null], [undefined]])(
    'returns null for soonest and latest when given invalid input %s',
    (invalidInput) => {
      expect(() => {
        datesToTimeMatrix(invalidInput);
      }).toThrow();
    }
  );

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
      },
    ];

    expect(durationToTimeblocks(dates)).toEqual(expectedOutput);
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
      },
      {
        date: '2024-03-16',
        start_time: dayjs(dates[0]).format('HH:mm:ssZ'),
        end_time: dayjs(dates[1]).add(15, 'minutes').format('HH:mm:ssZ'),
      },
      {
        date: '2024-03-17',
        start_time: dayjs(dates[0]).format('HH:mm:ssZ'),
        end_time: dayjs(dates[1]).add(15, 'minutes').format('HH:mm:ssZ'),
      },
    ];

    expect(durationToTimeblocks(dates)).toEqual(expectedOutput);
  });

  test.skip('returns an array of timeblocks for a duration in a day (reverse order)', () => {
    const dates = [
      new Date('2024-03-15T19:00:00+00:00'),
      new Date('2024-03-15T08:00:00+00:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: dayjs(dates[1]).format('HH:mm:ssZ'),
        end_time: dayjs(dates[0]).add(15, 'minutes').format('HH:mm:ssZ'),
      },
    ];

    expect(durationToTimeblocks(dates)).toEqual(expectedOutput);
  });

  test.skip('returns an array of timeblocks for a duration spanning multiple days (reverse order)', () => {
    const dates = [
      new Date('2024-03-17T19:00:00+00:00'),
      new Date('2024-03-15T08:00:00+00:00'),
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: dayjs(dates[1]).format('HH:mm:ssZ'),
        end_time: dayjs(dates[0]).add(15, 'minutes').format('HH:mm:ssZ'),
      },
      {
        date: '2024-03-16',
        start_time: dayjs(dates[1]).format('HH:mm:ssZ'),
        end_time: dayjs(dates[0]).add(15, 'minutes').format('HH:mm:ssZ'),
      },
      {
        date: '2024-03-17',
        start_time: dayjs(dates[1]).format('HH:mm:ssZ'),
        end_time: dayjs(dates[0]).add(15, 'minutes').format('HH:mm:ssZ'),
      },
    ];

    expect(durationToTimeblocks(dates)).toEqual(expectedOutput);
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
      },
      {
        date: '2024-03-16',
        start_time: dayjs(dates[0]).format('HH:mm:ssZ'),
        end_time: dayjs(dates[1]).add(15, 'minutes').format('HH:mm:ssZ'),
      },
      {
        date: '2024-03-17',
        start_time: dayjs(dates[0]).format('HH:mm:ssZ'),
        end_time: dayjs(dates[1]).add(15, 'minutes').format('HH:mm:ssZ'),
      },
    ];

    expect(durationToTimeblocks(dates)).toEqual(expectedOutput);
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
      },
      {
        date: '2024-03-16',
        start_time: dayjs(dates[0]).format('HH:mm:ssZ'),
        end_time: dayjs(dates[1]).add(15, 'minutes').format('HH:mm:ssZ'),
      },
      {
        date: '2024-03-17',
        start_time: dayjs(dates[0]).format('HH:mm:ssZ'),
        end_time: dayjs(dates[1]).add(15, 'minutes').format('HH:mm:ssZ'),
      },
    ];

    expect(durationToTimeblocks(dates)).toEqual(expectedOutput);
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
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
      },
    ];

    expect(addTimeblocks(prevTimeblocks, newTimeblocks)).toEqual(newTimeblocks);
  });

  test('returns the previous timeblocks if the new timeblocks array is empty', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
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
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
      },
    ];
    const newTimeblocks: Timeblock[] = [
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
      },
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
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
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
      },
    ];
    const newTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '10:00:00+00:00',
        end_time: '15:15:00+00:00',
      },
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
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
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
      },
    ];
    const newTimeblocks: Timeblock[] = [
      {
        date: '2024-03-16',
        start_time: '10:00:00+00:00',
        end_time: '15:15:00+00:00',
      },
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
      },
      {
        date: '2024-03-16',
        start_time: '10:00:00+00:00',
        end_time: '15:15:00+00:00',
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
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
      },
    ];
    const newTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '10:00:00+00:00',
        end_time: '23:15:00+00:00',
      },
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '23:15:00+00:00',
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
        start_time: '10:00:00+00:00',
        end_time: '23:15:00+00:00',
      },
    ];
    const newTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
      },
    ];

    const expectedOutput: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '23:15:00+00:00',
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

    expect(removeTimeblocks(prevTimeblocks, dates, 0)).toEqual([]);
  });

  test('returns the previous timeblocks if the dates array is empty', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
      },
    ];
    const dates: Date[] = [];

    expect(removeTimeblocks(prevTimeblocks, dates, 0)).toEqual(prevTimeblocks);
  });

  test('returns an empty array if the previous timeblocks array is empty', () => {
    const prevTimeblocks: Timeblock[] = [];
    const dates: Date[] = [new Date('2024-03-15T08:00:00+00:00')];

    expect(removeTimeblocks(prevTimeblocks, dates, 0)).toEqual([]);
  });

  test('cut first split of a timeblock that is in the removal date range (single day)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
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
      },
    ];

    expect(removeTimeblocks(prevTimeblocks, dates, 0)).toEqual(expectedOutput);
  });

  test('cut first split of a timeblock that is in the removal date range (multiple days)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
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
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
      },
    ];

    expect(removeTimeblocks(prevTimeblocks, dates, 0)).toEqual(expectedOutput);
  });

  test.skip('cut last split of a timeblock that is in the removal date range (single day)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
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
      },
    ];

    expect(removeTimeblocks(prevTimeblocks, dates, 0)).toEqual(expectedOutput);
  });

  test.skip('cut last split of a timeblock that is in the removal date range (multiple days)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
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
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
      },
    ];

    expect(removeTimeblocks(prevTimeblocks, dates, 0)).toEqual(expectedOutput);
  });

  test.skip('cut middle split of a timeblock that is in the removal date range (single day)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
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
      },
      {
        date: '2024-03-15',
        start_time: '15:30:00+00:00',
        end_time: '19:15:00+00:00',
      },
    ];

    expect(removeTimeblocks(prevTimeblocks, dates, 0)).toEqual(expectedOutput);
  });

  test.skip('cut middle split of a timeblock that is in the removal date range (multiple days)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
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
      },
      {
        date: '2024-03-15',
        start_time: '15:30:00+00:00',
        end_time: '19:15:00+00:00',
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
      },
    ];

    expect(removeTimeblocks(prevTimeblocks, dates, 0)).toEqual(expectedOutput);
  });

  test('cut entire timeblock that is in the removal date range (single day)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
      },
    ];
    const dates: Date[] = [
      new Date('2024-03-15T08:00:00+00:00'),
      new Date('2024-03-15T19:15:00+00:00'),
    ];

    const expectedOutput: Timeblock[] = [];

    expect(removeTimeblocks(prevTimeblocks, dates, 0)).toEqual(expectedOutput);
  });

  test('cut entire timeblock that is in the removal date range (multiple days)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
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
      },
    ];

    expect(removeTimeblocks(prevTimeblocks, dates, 0)).toEqual(expectedOutput);
  });

  test('cut entire timeblock that is in the removal date range (multiple days, multiple timeblocks)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '12:00:00+00:00',
      },
      {
        date: '2024-03-15',
        start_time: '12:00:00+00:00',
        end_time: '19:15:00+00:00',
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
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
      },
    ];

    expect(removeTimeblocks(prevTimeblocks, dates, 0)).toEqual(expectedOutput);
  });

  test('cut entire timeblock that is in the removal date range (multiple days, multiple timeblocks, multiple removals)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '12:00:00+00:00',
      },
      {
        date: '2024-03-15',
        start_time: '12:00:00+00:00',
        end_time: '19:15:00+00:00',
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
      },
    ];
    const dates: Date[] = [
      new Date('2024-03-15T08:00:00+00:00'),
      new Date('2024-03-16T19:15:00+00:00'),
    ];

    const expectedOutput: Timeblock[] = [];

    expect(removeTimeblocks(prevTimeblocks, dates, 0)).toEqual(expectedOutput);
  });

  test('cut entire timeblock that is in the removal date range (multiple days, multiple timeblocks, multiple removals, reverse order)', () => {
    const prevTimeblocks: Timeblock[] = [
      {
        date: '2024-03-15',
        start_time: '08:00:00+00:00',
        end_time: '12:00:00+00:00',
      },
      {
        date: '2024-03-15',
        start_time: '12:00:00+00:00',
        end_time: '19:15:00+00:00',
      },
      {
        date: '2024-03-16',
        start_time: '08:00:00+00:00',
        end_time: '19:15:00+00:00',
      },
    ];
    const dates: Date[] = [
      new Date('2024-03-16T19:15:00+00:00'),
      new Date('2024-03-15T08:00:00+00:00'),
    ];

    const expectedOutput: Timeblock[] = [];

    expect(removeTimeblocks(prevTimeblocks, dates, 0)).toEqual(expectedOutput);
  });
});
