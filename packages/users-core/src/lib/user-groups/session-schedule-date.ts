import dayjs from 'dayjs';
import '../dayjs-setup';

export function normalizeDbTime(value: string) {
  return value.length === 5 ? `${value}:00` : value;
}

export function compareIsoDate(a: string, b: string) {
  return a.localeCompare(b);
}

export function addDate(date: string, days: number) {
  return dayjs(date).add(days, 'day').format('YYYY-MM-DD');
}

export function buildSeriesTimestamp(
  date: string,
  time: string,
  timezone: string
) {
  return dayjs
    .tz(`${date} ${normalizeDbTime(time)}`, 'YYYY-MM-DD HH:mm:ss', timezone)
    .toISOString();
}
