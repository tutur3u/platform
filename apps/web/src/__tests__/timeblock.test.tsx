import { datesToDateMatrix } from '@/utils/timeblock-helper';
import { describe, expect, test } from 'vitest';
import dayjs from 'dayjs';

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
