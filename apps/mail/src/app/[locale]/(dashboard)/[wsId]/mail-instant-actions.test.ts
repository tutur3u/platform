// @vitest-environment jsdom
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type {
  MailThreadDetail,
  MailThreadSummary,
  MailThreadsResponse,
} from '@tuturuuu/internal-api';
import { createElement, type ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ update: vi.fn(), bulk: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({
  updateMailThreadState: mocks.update,
  bulkUpdateMailThreads: mocks.bulk,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { snapshotMailThreads } from './mail-thread-optimistic';
import { useMailThreadActions } from './use-mail-thread-actions';
import { useMailViewedThreadRead } from './use-mail-viewed-thread-read';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function deferred() {
  let resolve!: (value: object) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<object>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const rows = ['a', 'b'].map((id) => ({
  id,
  unreadCount: 1,
  inboundCount: 1,
})) as MailThreadSummary[];
const listKey = ['mail', 'ws', 'box', 'threads', 'inbox', null, null, ''];
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(listKey, {
    pages: [{ threads: rows, pagination: { total: 2 } }],
    pageParams: [1],
  });
  client.setQueryData(['mail', 'ws', 'box', 'thread', 'a'], {
    thread: rows[0],
    messages: [{ id: 'm', unread: true, direction: 'inbound' }],
  });
  const invalidateMailbox = vi.fn(async () => {});
  const hook = renderHook(
    () => {
      const detail = client.getQueryData<MailThreadDetail>([
        'mail',
        'ws',
        'box',
        'thread',
        'a',
      ]);
      useMailViewedThreadRead({
        workspaceId: 'ws',
        mailboxId: 'box',
        threadId: 'a',
        detail,
        blocked: false,
        threads: rows,
      });
      return useMailThreadActions({
        workspaceId: 'ws',
        activeMailboxId: 'box',
        threadId: 'a',
        threads: rows,
        folder: 'inbox',
        selectedThreads: new Set(),
        setSelectedThreads: vi.fn(),
        closeThread: vi.fn(),
        reopenThread: vi.fn(),
        invalidateMailbox,
      });
    },
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    }
  );
  const ids = () =>
    client
      .getQueryData<{ pages: MailThreadsResponse[] }>(listKey)
      ?.pages[0]?.threads.map((row) => row.id);
  return { ...hook, client, ids, invalidateMailbox };
}

it.each(['resolve', 'reject'] as const)(
  'archives immediately during automatic read and preserves archive when read %s',
  async (outcome) => {
    const read = deferred();
    const archive = deferred();
    mocks.update
      .mockReturnValueOnce(read.promise)
      .mockReturnValueOnce(archive.promise);
    const hook = setup();
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(hook.result.current.actionPending).toBe(false);
    act(() => hook.result.current.mutateThread('archive'));
    await waitFor(() => expect(hook.ids()).toEqual(['b']));
    expect(mocks.update).toHaveBeenCalledTimes(1);
    await act(async () => {
      if (outcome === 'resolve') read.resolve({});
      else read.reject(new Error('offline'));
    });
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2));
    expect(hook.ids()).toEqual(['b']);
    expect(mocks.update).toHaveBeenLastCalledWith('ws', 'box', 'a', {
      action: 'archive',
    });
    await act(async () => archive.resolve({}));
    await waitFor(() => expect(hook.invalidateMailbox).toHaveBeenCalledOnce());
  }
);

it('persists explicit unread after the automatic read without disabling the optimistic toggle', async () => {
  const read = deferred();
  mocks.update.mockReturnValueOnce(read.promise).mockResolvedValueOnce({});
  const hook = setup();
  await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
  act(() => hook.result.current.mutateThread('mark_unread'));
  await waitFor(() =>
    expect(
      hook.client.getQueryData<MailThreadDetail>([
        'mail',
        'ws',
        'box',
        'thread',
        'a',
      ])?.thread.unreadCount
    ).toBe(1)
  );
  await act(async () => read.resolve({}));
  await waitFor(() =>
    expect(mocks.update).toHaveBeenLastCalledWith('ws', 'box', 'a', {
      action: 'mark_unread',
    })
  );
});

it.each(['a', 'b'])(
  'does not cancel an initial body request for %s during an optimistic action on a',
  async (id) => {
    const client = new QueryClient();
    const body = deferred();
    const hook = renderHook(
      () =>
        useQuery({
          queryKey: ['mail', 'ws', 'box', 'thread', id],
          queryFn: () => body.promise,
        }),
      {
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(QueryClientProvider, { client }, children),
      }
    );
    await act(async () => {
      await snapshotMailThreads({
        queryClient: client,
        workspaceId: 'ws',
        activeMailboxId: 'box',
        ids: new Set(['a']),
        action: 'star',
        folder: 'inbox',
        threads: rows,
      });
    });
    await act(async () => body.resolve({ body: 'Loaded delivery' }));
    await waitFor(() =>
      expect(hook.result.current.data).toEqual({ body: 'Loaded delivery' })
    );
  }
);
