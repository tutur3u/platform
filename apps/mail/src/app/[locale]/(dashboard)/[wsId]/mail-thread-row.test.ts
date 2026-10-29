// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { MailThreadSummary } from '@tuturuuu/internal-api';
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { MailThreadRow } from './mail-thread-list';

vi.mock('next-intl', () => ({
  useLocale: () => 'en-US',
  useTranslations: () => (key: string) => key,
}));
afterEach(cleanup);

function row(unreadCount: number) {
  const thread = {
    hasAttachments: false,
    id: 'thread',
    labels: [],
    lastMessageAt: '2026-10-28T09:05:00.000Z',
    latestSnippet: 'Snippet',
    mailboxId: 'mailbox',
    messageCount: 1,
    participants: [{ address: 'linh@example.com', displayName: 'Linh' }],
    starred: false,
    subject: 'Planning notes',
    unreadCount,
  } as unknown as MailThreadSummary;
  render(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(MailThreadRow, {
        active: false,
        onClick: vi.fn(),
        onPrefetch: vi.fn(),
        onSelect: vi.fn(),
        selected: false,
        thread,
      })
    )
  );
  return screen.getByRole('button', { name: /Planning notes/ });
}

it('announces unread conversations without relying on weight or the dot', () => {
  const button = row(2);
  expect(button.textContent).toContain('unread');
  expect(screen.getByText('unread').className).toContain('sr-only');
  expect(
    button.querySelector('.rounded-full')?.getAttribute('aria-hidden')
  ).toBe('true');
});

it('does not announce read conversations as unread', () => {
  expect(row(0).textContent).not.toContain('unread');
});
