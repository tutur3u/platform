import { isValidTimezone } from '@tuturuuu/utils/timezone';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

export const POST_EMAIL_DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

export function resolvePostEmailTimezone(
  timezoneValue?: string | null
): string {
  const trimmedTimezone = timezoneValue?.trim();

  if (
    trimmedTimezone &&
    trimmedTimezone !== 'auto' &&
    isValidTimezone(trimmedTimezone)
  ) {
    return trimmedTimezone;
  }

  return POST_EMAIL_DEFAULT_TIMEZONE;
}

export function formatPostEmailSubjectDate(
  createdAt: string,
  timezoneValue?: string | null
): string {
  return dayjs(createdAt)
    .tz(resolvePostEmailTimezone(timezoneValue))
    .format('DD/MM/YYYY');
}

export function formatPostEmailBodyDate(
  createdAt: string | null | undefined,
  locale: 'en-US' | 'vi',
  timezoneValue?: string | null
): string {
  const date = createdAt ? new Date(createdAt) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    timeZone: resolvePostEmailTimezone(timezoneValue),
    year: 'numeric',
  }).format(safeDate);
}
