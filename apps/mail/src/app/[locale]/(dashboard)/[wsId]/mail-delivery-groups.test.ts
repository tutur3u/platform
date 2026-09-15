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
  { lastMessageAt: '2026-09-10T08:35:00Z' },
  { messageCount: 2 },
  { mailboxId: 'other' },
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

it('keeps a delivery addressed to the selected mailbox outside alternate-recipient groups', () => {
  const rows = [
    delivery('a'),
    delivery('mine', { deliveryRecipient: 'ME@example.com' }),
    delivery('b'),
  ];
  expect(groupMailDeliveries(rows, 'me@example.com')).toEqual([
    [rows[0], rows[2]],
    [rows[1]],
  ]);
});
it('groups personalized copies with normalized subjects while retaining every original', () => {
  const rows = [
    delivery('a'),
    delivery('b', {
      subject: '  NEWSLETTER  ',
      latestSnippet: 'Hi B, September news',
      hasAttachments: false,
    }),
  ];
  expect(groupMailDeliveries(rows)).toEqual([rows]);
});
