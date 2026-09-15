// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { MailThreadDetail } from '@tuturuuu/internal-api';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMailThreadsQueryKey } from './mail-thread-query';

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
  return { ...hook, invalidate, client };
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

it('clears list, reader and mailbox unread state before persistence and rolls back a failure', async () => {
  let reject!: (error: Error) => void;
  mocks.update.mockImplementation(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      })
  );
  const { client, rerender } = setup({ ...base, blocked: true });
  const key = getMailThreadsQueryKey({
    workspaceId: 'ws',
    mailboxId: 'mailbox',
    folder: 'inbox',
  });
  const original = {
    pages: [
      { pagination: { total: 1 }, threads: [{ id: 'a', unreadCount: 1 }] },
    ],
    pageParams: [1],
  };
  client.setQueryData(key, original);
  client.setQueryData(['mail', 'ws', 'mailbox', 'thread', 'a'], detail());
  client.setQueryData(['mail', 'ws', 'bootstrap-counts'], { mailbox: 3 });
  rerender({ ...base, threads: [{ id: 'a', unreadCount: 1 }] } as typeof base);
  await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
  expect(
    client.getQueryData<typeof original>(key)?.pages[0]?.threads[0]?.unreadCount
  ).toBe(0);
  expect(
    client.getQueryData<MailThreadDetail>([
      'mail',
      'ws',
      'mailbox',
      'thread',
      'a',
    ])?.messages[0]?.unread
  ).toBe(false);
  expect(client.getQueryData(['mail', 'ws', 'bootstrap-counts'])).toEqual({
    mailbox: 2,
  });
  await act(async () => reject(new Error('offline')));
  await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce());
  expect(client.getQueryData(key)).toEqual(original);
  expect(
    client.getQueryData<MailThreadDetail>([
      'mail',
      'ws',
      'mailbox',
      'thread',
      'a',
    ])?.messages[0]?.unread
  ).toBe(true);
  expect(client.getQueryData(['mail', 'ws', 'bootstrap-counts'])).toEqual({
    mailbox: 3,
  });
  rerender(base);
  expect(mocks.update).toHaveBeenCalledOnce();
});

it('marks the next viewed thread optimistically while the previous read is still saving', async () => {
  mocks.update.mockImplementation(() => new Promise(() => {}));
  const { rerender, client } = setup();
  await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
  client.setQueryData(['mail', 'ws', 'mailbox', 'thread', 'b'], detail('b'));
  rerender({ ...base, threadId: 'b', detail: detail('b') });
  await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2));
  expect(
    client.getQueryData<MailThreadDetail>([
      'mail',
      'ws',
      'mailbox',
      'thread',
      'b',
    ])?.messages[0]?.unread
  ).toBe(false);
});

it('marks a new unread message beyond the reader cap even when the unread count repeats', async () => {
  const first = {
    ...detail(),
    thread: {
      id: 'a',
      unreadCount: 1,
      messageCount: 201,
      mailboxId: 'mailbox',
      status: 'active',
      subject: 'Thread',
      lastMessageAt: '2026-09-15T00:00:00Z',
    },
    messages: [],
  } as MailThreadDetail;
  const { rerender } = setup({ ...base, detail: first });
  await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
  rerender({
    ...base,
    detail: { ...first, thread: { ...first.thread, unreadCount: 0 } },
  });
  rerender({
    ...base,
    detail: {
      ...first,
      thread: {
        ...first.thread,
        messageCount: 202,
        lastMessageAt: '2026-09-15T00:01:00Z',
      },
    },
  });
  await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2));
});
