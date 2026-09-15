// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), add: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({
  getMailBlacklistRecipients: mocks.get,
  blacklistMailFailedRecipient: mocks.add,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

import { MailBlacklistControl } from './mail-blacklist-control';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('shows confirmed blacklist status in both list and reader caches before refresh finishes', async () => {
  const client = new QueryClient();
  const data = {
    canManage: true,
    infrastructureOrigin: 'https://infrastructure.example.com',
    recipients: [{ email: 'failed@example.com', blocked: false }],
  };
  client.setQueryData(['mail', 'ws', 'box', 'blacklist', 'a'], data);
  client.setQueryData(['mail', 'ws', 'other-box', 'blacklist', 'b'], data);
  vi.spyOn(client, 'invalidateQueries').mockReturnValue(new Promise(() => {}));
  mocks.add.mockResolvedValue({ blocked: true, alreadyBlocked: false });
  render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(MailBlacklistControl, {
        workspaceId: 'ws',
        mailboxId: 'box',
        messageId: 'a',
      })
    )
  );
  fireEvent.click(screen.getByRole('button', { name: 'blacklist_email' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'add_to_blacklist' })
  );
  await waitFor(() =>
    expect(
      screen.getByText('blacklisted · blacklist_reason_inactive')
    ).toBeTruthy()
  );
  expect(
    client.getQueryData<typeof data>([
      'mail',
      'ws',
      'other-box',
      'blacklist',
      'b',
    ])?.recipients[0]?.blocked
  ).toBe(true);
});
it('does not show management state when the server denies access', async () => {
  const client = new QueryClient();
  client.setQueryData(['mail', 'ws', 'box', 'blacklist', 'a'], {
    canManage: false,
    recipients: [],
  });
  const { container } = render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(MailBlacklistControl, {
        workspaceId: 'ws',
        mailboxId: 'box',
        messageId: 'a',
      })
    )
  );
  expect(container.textContent).toBe('');
});
