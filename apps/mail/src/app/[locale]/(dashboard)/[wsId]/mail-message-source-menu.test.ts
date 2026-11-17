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
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  source: vi.fn(),
  copy: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  getMailMessageSource: mocks.source,
  getMailSourceHeaders: (raw: string) => raw.split(/\r?\n\r?\n/u, 1)[0],
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: mocks.success, error: mocks.error },
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { MailMessageSourceMenu } from './mail-message-source-menu';

const raw =
  'From: sender@example.test\r\nX-Test: one\r\nX-Test: two\r\n\r\n<script>plain text</script>';
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(MailMessageSourceMenu, {
        workspaceId: 'ws',
        mailboxId: 'box',
        messageId: 'message',
      })
    )
  );
  fireEvent.keyDown(screen.getByRole('button', { name: 'message_more' }), {
    key: 'ArrowDown',
  });
  return client;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.source.mockResolvedValue(raw);
  mocks.copy.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mocks.copy },
  });
});
afterEach(cleanup);

it('loads source only on request and renders escaped text', async () => {
  show();
  expect(mocks.source).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole('menuitem', { name: 'view_source' }));
  const text = await screen.findByRole('textbox', { name: 'view_source' });
  await waitFor(() =>
    expect((text as HTMLTextAreaElement).value).toBe(
      raw.replaceAll('\r\n', '\n')
    )
  );
  expect(text.hasAttribute('readonly')).toBe(true);
  expect(document.querySelector('script')).toBeNull();
  expect(mocks.source).toHaveBeenCalledWith(
    'ws',
    'box',
    'message',
    expect.any(AbortSignal)
  );
});

it.each(['copy_raw_message', 'copy_headers'])(
  'copies %s only after an authorized source read',
  async (action) => {
    show();
    fireEvent.click(await screen.findByRole('menuitem', { name: action }));
    await waitFor(() =>
      expect(mocks.copy).toHaveBeenCalledWith(
        action === 'copy_headers' ? raw.split('\r\n\r\n')[0] : raw
      )
    );
    expect(mocks.success).toHaveBeenCalledWith('source_copied');
  }
);

it('does not copy or announce success after denied source access', async () => {
  mocks.source.mockRejectedValue(new Error('Forbidden'));
  show();
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'copy_raw_message' })
  );
  await waitFor(() =>
    expect(mocks.error).toHaveBeenCalledWith('source_copy_failed')
  );
  expect(mocks.copy).not.toHaveBeenCalled();
  expect(mocks.success).not.toHaveBeenCalled();
});
