import dayjs from 'dayjs';

export const POST_EMAIL_QUEUE_TABLE = 'post_email_queue';

export const POST_EMAIL_MAX_AGE_DAYS = 60;

export function getPostEmailMaxAgeCutoff(): string {
  return dayjs().subtract(POST_EMAIL_MAX_AGE_DAYS, 'day').toISOString();
}
