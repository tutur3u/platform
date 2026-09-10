// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MailThreadSummary } from '@tuturuuu/internal-api';
import { createElement as h } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { MailDeliveryList } from './mail-delivery-list';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: { count: number }) =>
    `${key}${values ? ` ${values.count}` : ''}`,
}));
afterEach(cleanup);
const threads: MailThreadSummary[] = ['a', 'b'].map((id) => ({
  id,
  mailboxId: 'box',
  messageCount: 1,
  status: 'active',
  subject: 'Newsletter',
  unreadCount: 1,
  lastMessageAt: '2026-09-10T07:35:00Z',
  hasAttachments: false,
  labels: [],
  latestMessageId: id,
  latestSnippet: 'News',
  participants: [{ address: 'sender@example.com', displayName: 'Sender' }],
  starred: false,
  deliveryRecipient: `${id}@example.com`,
}));
it('collapses similar deliveries and preserves recipient-specific open actions', () => {
  const onOpen = vi.fn();
  const props = {
    threads,
    folder: 'inbox' as const,
    threadId: null as string | null,
    selectedThreads: new Set<string>(),
    onOpen,
    onPrefetch: () => {},
    onSelect: () => {},
  };
  const { container, rerender } = render(h(MailDeliveryList, props));
  expect(container.querySelector('details')?.open).toBe(false);
  expect(screen.getByText('similar_deliveries 2')).toBeTruthy();
  expect(screen.getByText('delivery_unread_count 2')).toBeTruthy();
  rerender(h(MailDeliveryList, { ...props, threadId: 'b' }));
  expect(container.querySelector('details')?.open).toBe(true);
  fireEvent.click(container.querySelector('[data-mail-thread-open="b"]')!);
  expect(onOpen).toHaveBeenCalledWith(threads[1]);
  expect(screen.getByText('to: b@example.com')).toBeTruthy();
});
