// @vitest-environment jsdom
import {
  type InfiniteData,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type {
  MailThreadSummary,
  MailThreadsResponse,
} from '@tuturuuu/internal-api';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  bulk: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  updateMailThreadState: mocks.update,
  bulkUpdateMailThreads: mocks.bulk,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: mocks.error } }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { useMailThreadActions } from './use-mail-thread-actions';

const key = ['mail', 'ws', 'box', 'threads', 'inbox', null, null, ''];
const rows = ['a', 'b', 'c'].map((id) => ({
  id,
  unreadCount: 1,
  starred: false,
})) as MailThreadSummary[];
function deferred() {
  let resolve!: (value: object) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<object>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  client.setQueryData<InfiniteData<MailThreadsResponse>>(key, {
    pageParams: [1],
    pages: [
      {
        threads: rows,
        pagination: {
          page: 1,
          pageSize: 40,
          total: 3,
          hasMore: false,
          truncated: false,
        },
      },
    ],
  });
  client.setQueryData(['mail', 'ws', 'bootstrap-counts'], { box: 3 });
  const invalidateMailbox = vi.fn(async () => {});
  const reopenThread = vi.fn();
  const props = {
    activeMailboxId: 'box' as string | null,
    workspaceId: 'ws',
    threadId: 'a',
    threads: rows,
    folder: 'inbox' as const,
    closeThread: vi.fn(),
    reopenThread,
    invalidateMailbox,
    selectedThreads: new Set<string>(),
    setSelectedThreads: vi.fn(),
  };
  const hook = renderHook(useMailThreadActions, {
    initialProps: props,
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  });
  const ids = () =>
    client
      .getQueryData<InfiniteData<MailThreadsResponse>>(key)
      ?.pages[0]?.threads.map((row) => row.id);
  return { ...hook, client, props, ids, invalidateMailbox, reopenThread };
}
beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});
afterEach(cleanup);
describe('concurrent archive navigation', () => {
  it('allows the next email while the first waits and reconciles only after both finish', async () => {
    const a = deferred();
    const b = deferred();
    mocks.update.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const hook = setup();
    act(() => {
      hook.result.current.mutateThread('archive');
      hook.result.current.mutateThread('archive');
    });
    await waitFor(() => expect(hook.reopenThread).toHaveBeenCalledWith('b'));
    expect(mocks.update).toHaveBeenCalledTimes(1);
    hook.rerender({ ...hook.props, threadId: 'b', threads: rows.slice(1) });
    expect(hook.result.current.actionPending).toBe(false);
    act(() => hook.result.current.mutateThread('archive'));
    await waitFor(() => expect(hook.ids()).toEqual(['c']));
    await act(async () => a.resolve({}));
    expect(hook.invalidateMailbox).not.toHaveBeenCalled();
    expect(hook.ids()).toEqual(['c']);
    await act(async () => b.resolve({}));
    await waitFor(() =>
      expect(hook.invalidateMailbox).toHaveBeenCalledTimes(1)
    );
  });
  it('restores only a failed email while another archive succeeds out of order', async () => {
    const a = deferred();
    const b = deferred();
    mocks.update.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const hook = setup();
    act(() => hook.result.current.mutateThread('archive'));
    await waitFor(() => expect(hook.ids()).toEqual(['b', 'c']));
    hook.rerender({ ...hook.props, threadId: 'b', threads: rows.slice(1) });
    act(() => hook.result.current.mutateThread('archive'));
    await waitFor(() => expect(hook.ids()).toEqual(['c']));
    hook.rerender({ ...hook.props, threadId: 'c', threads: rows.slice(2) });
    await act(async () => b.resolve({}));
    expect(hook.invalidateMailbox).not.toHaveBeenCalled();
    await act(async () => a.reject(new Error('offline')));
    await waitFor(() => expect(hook.ids()).toEqual(['a', 'c']));
    expect(
      hook.client.getQueryData(['mail', 'ws', 'bootstrap-counts'])
    ).toEqual({ box: 2 });
    expect(
      hook.client.getQueryData<InfiniteData<MailThreadsResponse>>(key)?.pages[0]
        ?.pagination.total
    ).toBe(2);
    expect(hook.reopenThread).not.toHaveBeenCalledWith('a');
    expect(hook.invalidateMailbox).toHaveBeenCalledTimes(1);
  });
});

it('reconciles when concurrent requests finish in the same microtask', async () => {
  const a = deferred();
  const b = deferred();
  mocks.update.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  const hook = setup();
  act(() => hook.result.current.mutateThread('archive', 'a'));
  await waitFor(() => expect(hook.ids()).toEqual(['b', 'c']));
  act(() => hook.result.current.mutateThread('archive', 'b'));
  await waitFor(() => expect(hook.ids()).toEqual(['c']));
  await act(async () => {
    a.resolve({});
    b.resolve({});
  });
  await waitFor(() => expect(hook.invalidateMailbox).toHaveBeenCalledTimes(1));
});

it('pins rollback and reconciliation to the original mailbox after navigation', async () => {
  const request = deferred();
  mocks.update.mockReturnValueOnce(request.promise);
  const hook = setup();
  act(() => hook.result.current.mutateThread('archive'));
  await waitFor(() => expect(hook.ids()).toEqual(['b', 'c']));
  const otherInvalidate = vi.fn(async () => {});
  hook.rerender({
    ...hook.props,
    activeMailboxId: 'other',
    threadId: 'other-thread',
    invalidateMailbox: otherInvalidate,
  });
  expect(hook.result.current.actionPending).toBe(false);
  await act(async () => request.reject(new Error('offline')));
  await waitFor(() => expect(hook.ids()).toEqual(['a', 'b', 'c']));
  expect(mocks.update).toHaveBeenCalledWith('ws', 'box', 'a', {
    action: 'archive',
  });
  expect(hook.invalidateMailbox).toHaveBeenCalledTimes(1);
  expect(otherInvalidate).not.toHaveBeenCalled();
  expect(hook.result.current.syncState).toBe('idle');
  expect(hook.reopenThread).not.toHaveBeenCalledWith('a');
});

it('does not send single or bulk actions during an unresolved mailbox transition', async () => {
  const hook = setup();
  hook.rerender({
    ...hook.props,
    activeMailboxId: null,
    selectedThreads: new Set(['a']),
  });
  await act(async () => {
    hook.result.current.mutateThread('archive');
    hook.result.current.bulkMutation.mutate('archive');
  });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.bulk).not.toHaveBeenCalled();
  expect(hook.ids()).toEqual(['a', 'b', 'c']);
  expect(hook.result.current.syncState).toBe('idle');
});
