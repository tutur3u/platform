// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { MailThreadDetail } from '@tuturuuu/internal-api';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ update: vi.fn(), error: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({
  updateMailThreadState: mocks.update,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: mocks.error } }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { useMailViewedThreadRead } from './use-mail-viewed-thread-read';

function detail(
  id = 'a',
  unread = true,
  messageId = 'message'
): MailThreadDetail {
  return {
    thread: { id },
    messages: [{ id: messageId, unread }],
  } as MailThreadDetail;
}
const base = {
  workspaceId: 'ws',
  mailboxId: 'mailbox',
  threadId: 'a',
  blocked: false,
  detail: detail(),
};
function setup(props = base) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const hook = renderHook(useMailViewedThreadRead, {
    initialProps: props,
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  });
  return { ...hook, invalidate };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockResolvedValue({});
});
afterEach(cleanup);

describe('viewed thread read tracking', () => {
  it('marks a loaded restored URL read without a list click and refreshes mailbox counts', async () => {
    const { invalidate } = setup();
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith('ws', 'mailbox', 'a', {
        action: 'mark_read',
      })
    );
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ['mail', 'ws', 'bootstrap'],
      })
    );
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
  it('waits for loaded matching unread content and for archive rollback to settle', async () => {
    const { rerender } = setup({ ...base, blocked: true });
    expect(mocks.update).not.toHaveBeenCalled();
    rerender({ ...base, detail: detail('other') });
    expect(mocks.update).not.toHaveBeenCalled();
    rerender({ ...base, detail: detail('a', false) });
    expect(mocks.update).not.toHaveBeenCalled();
    rerender(base);
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
  });
  it('deduplicates in-flight reads and handles a new unread arrival in the open thread', async () => {
    let resolve!: (value: object) => void;
    mocks.update.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const { rerender } = setup();
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    rerender({ ...base, detail: detail() });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    await act(async () => resolve({}));
    rerender({ ...base, detail: detail('a', true, 'new-message') });
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2));
  });
  it('does not retry a failing read in a render loop and can retry after reopening', async () => {
    mocks.update.mockRejectedValue(new Error('offline'));
    const { rerender } = setup();
    await waitFor(() => expect(mocks.error).toHaveBeenCalledTimes(1));
    rerender({ ...base, detail: detail() });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    rerender({ ...base, threadId: 'other', detail: detail('other', false) });
    rerender(base);
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2));
  });
});
