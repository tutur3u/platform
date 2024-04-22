import {
  datesToDateMatrix,
} from '@/utils/timeblock-helper';
import { Dayjs } from 'dayjs';
import { expect, test } from 'vitest';

test('datesToDateMatrix should return the soonest and latest dates from an array of dates', () => {
  const dates: Date[] = [new Date('2023-03-08T10:00:00'), new Date('2023-03-07T12:00:00'), new Date('2023-03-09T14:00:00')];
  const result = datesToDateMatrix(dates);

  expect(result.soonest).toEqual(dayjs('2023-03-07T12:00:00'));
  expect(result.latest).toEqual(dayjs('2023-03-09T14:15:00'));
});

test('datesToDateMatrix should throw an error if the input is invalid', () => {
  expect(() => datesToDateMatrix(null)).toThrowError('Invalid input');
  expect(() => datesToDateMatrix([])).toThrowError('Invalid input');
});
