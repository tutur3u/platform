import type { MailThreadSummary } from '@tuturuuu/internal-api';

export type MailThreadRevision = Pick<
  MailThreadSummary,
  'latestMessageId' | 'messageCount' | 'lastMessageAt'
>;

export function threadRevision(thread: MailThreadRevision): MailThreadRevision {
  return {
    latestMessageId: thread.latestMessageId,
    messageCount: thread.messageCount,
    lastMessageAt: thread.lastMessageAt,
  };
}

// Flags changed optimistically are excluded. New messages change this revision;
// an action bounded to older messages must not hide or replace that newer row.
export function sameThreadRevision(
  current: MailThreadRevision,
  before: MailThreadRevision | undefined
) {
  return Boolean(
    before &&
      current.latestMessageId === before.latestMessageId &&
      current.messageCount === before.messageCount &&
      current.lastMessageAt === before.lastMessageAt
  );
}
