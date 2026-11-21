import dayjs from 'dayjs';

export { POST_EMAIL_QUEUE_STATUSES } from './statuses';

export const POST_EMAIL_QUEUE_TABLE = 'post_email_queue';

export const POST_EMAIL_MAX_AGE_DAYS = 60;

export const POST_EMAIL_AGE_SKIP_REASON = `Post older than ${POST_EMAIL_MAX_AGE_DAYS} days`;

export function buildPostEmailAgeSkipReason(suffix?: string | null): string {
  if (!suffix) return POST_EMAIL_AGE_SKIP_REASON;
  return `${POST_EMAIL_AGE_SKIP_REASON}${suffix}`;
}

export function isPostEmailAgeSkipReason(
  lastError: string | null | undefined
): boolean {
  return Boolean(lastError?.startsWith(POST_EMAIL_AGE_SKIP_REASON));
}

export function getPostEmailMaxAgeCutoff(): string {
  return dayjs().subtract(POST_EMAIL_MAX_AGE_DAYS, 'day').toISOString();
}
