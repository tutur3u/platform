// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mark: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({ markMailFolderRead: mocks.mark }));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: mocks.success, error: mocks.error },
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { MailMarkFolderRead } from './mail-mark-folder-read';

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
function setup() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const element = (mailboxId: string) =>
    createElement(
      QueryClientProvider,
      { client },
      createElement(MailMarkFolderRead, {
        workspaceId: 'ws',
        mailboxId,
        folder: 'inbox',
        disabled: false,
      })
    );
  const view = render(element('first'));
  return { invalidate, switchMailbox: () => view.rerender(element('second')) };
}
it('finishes all batches for the original mailbox after navigation', async () => {
  let resolve!: (result: unknown) => void;
  mocks.mark.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  mocks.mark.mockResolvedValueOnce({
    nextCursor: null,
    before: 'cutoff',
    updated: 1,
  });
  const { invalidate, switchMailbox } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'mark_inbox_read' }));
  await waitFor(() => expect(mocks.mark).toHaveBeenCalledOnce());
  switchMailbox();
  await act(async () =>
    resolve({ nextCursor: 'cursor', before: 'cutoff', updated: 250 })
  );
  await waitFor(() => expect(mocks.success).toHaveBeenCalledOnce());
  expect(mocks.mark).toHaveBeenNthCalledWith(2, 'ws', 'first', {
    folder: 'inbox',
    cursor: 'cursor',
    before: 'cutoff',
  });
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ['mail', 'ws', 'first'],
  });
  expect(invalidate).not.toHaveBeenCalledWith({
    queryKey: ['mail', 'ws', 'second'],
  });
});
it('reports partial batch failure and reconciles persisted state', async () => {
  mocks.mark.mockResolvedValueOnce({
    nextCursor: 'cursor',
    before: 'cutoff',
    updated: 250,
  });
  mocks.mark.mockRejectedValueOnce(new Error('offline'));
  const { invalidate } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'mark_inbox_read' }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce());
  expect(mocks.success).not.toHaveBeenCalled();
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ['mail', 'ws', 'first'],
  });
});
