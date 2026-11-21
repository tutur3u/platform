export const POST_EMAIL_QUEUE_STATUSES = [
  'queued',
  'processing',
  'sent',
  'failed',
  'blocked',
  'cancelled',
  'skipped',
] as const;

export type PostEmailQueueStatus = (typeof POST_EMAIL_QUEUE_STATUSES)[number];
