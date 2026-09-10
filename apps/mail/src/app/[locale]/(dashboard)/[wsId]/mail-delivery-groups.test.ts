import type { MailThreadSummary } from '@tuturuuu/internal-api';
import { expect, it } from 'vitest';
import { groupMailDeliveries } from './mail-delivery-groups';

const delivery = (
  id: string,
  patch: Partial<MailThreadSummary> = {}
): MailThreadSummary => ({
  id,
  mailboxId: 'mailbox',
  messageCount: 1,
  status: 'active',
  subject: 'Newsletter',
  unreadCount: 1,
  lastMessageAt: '2026-09-10T07:35:00Z',
  hasAttachments: true,
  labels: [],
  latestMessageId: id,
  latestSnippet: 'September news',
  participants: [{ address: 'sender@example.com', displayName: 'Sender' }],
  starred: false,
  deliveryRecipient: `${id}@example.com`,
  ...patch,
});

it('groups similar catch-all copies across recipients without losing originals', () => {
  const rows = [delivery('a'), delivery('b'), delivery('c')];
  expect(groupMailDeliveries(rows)).toEqual([rows]);
});
it.each([
  { deliveryRecipient: null },
  { deliveryRecipient: 'a@example.com' },
  { subject: 'Other' },
  { latestSnippet: 'Other content' },
  { latestSnippet: null },
  { lastMessageAt: '2026-09-10T08:35:00Z' },
  { messageCount: 2 },
  { mailboxId: 'other' },
  { hasAttachments: false },
  { participants: [{ address: 'other@example.com', displayName: null }] },
])('keeps separate deliveries with different evidence: %j', (patch) => {
  expect(
    groupMailDeliveries([delivery('a'), delivery('b', patch)])
  ).toHaveLength(2);
});
it('bounds the full group time window, rather than chaining days of copies', () => {
  expect(
    groupMailDeliveries([
      delivery('a'),
      delivery('b', { lastMessageAt: '2026-09-10T07:43:00Z' }),
      delivery('c', { lastMessageAt: '2026-09-10T07:51:00Z' }),
    ]).map((group) => group.length)
  ).toEqual([2, 1]);
});
