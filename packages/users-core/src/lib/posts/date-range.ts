import { isValidTimezone } from '@tuturuuu/utils/timezone';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

export const POST_EMAIL_MAX_AGE_DAYS = 60;

export function getPostEmailMaxAgeCutoff() {
  return dayjs().subtract(POST_EMAIL_MAX_AGE_DAYS, 'day').toISOString();
}

export function buildDefaultPostsDateRange(timezoneSetting?: string | null) {
  const timezoneToUse =
    timezoneSetting &&
    timezoneSetting !== 'auto' &&
    isValidTimezone(timezoneSetting)
      ? timezoneSetting
      : 'UTC';
  const end = dayjs().tz(timezoneToUse).add(1, 'day').startOf('day');

  return {
    end: end.toISOString(),
    start: end.subtract(30, 'day').toISOString(),
  };
}
