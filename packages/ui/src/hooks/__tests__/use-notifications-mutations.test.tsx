/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type NotificationPages,
  notificationKeys,
} from '../notification-cache';
import type { Notification } from '../notification-types';
import {
  useMarkAllAsRead,
  useUndoMarkAllAsRead,
  useUpdateNotification,
} from '../use-notifications';

const WS_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const WS_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const USER = 'user-1';

// Server order is newest first: a1, a22, b1.
const CREATED: Record<string, string> = {
  a1: '2026-11-16T10:05:00.000Z',
  a22: '2026-11-16T10:04:00.000Z',
  b1: '2026-11-16T10:03:00.000Z',
};

const row = (id: string, extra: Partial<Notification> = {}): Notification => ({
  id,
  ws_id: WS_A,
  user_id: USER,
  type: 'task_assigned',
  title: id,
  description: null,
  data: {},
  entity_type: null,
  entity_id: null,
  read_at: null,
  created_at: CREATED[id] ?? '2026-11-16T09:00:00.000Z',
  created_by: null,
  actor: null,
  ...extra,
});

const one = (rows: Notification[], count = rows.length): NotificationPages => ({
  pages: [{ notifications: rows, count, limit: 20, offset: 0 }],
  pageParams: [0],
});
const idsOf = (client: QueryClient, key: readonly unknown[]) =>
  client
    .getQueryData<NotificationPages>(key)
    ?.pages.flatMap((p) => p.notifications.map((n) => n.id));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const keys = {
    unreadA: notificationKeys.list('unread', WS_A, USER),
    allA: notificationKeys.list('all', WS_A, USER),
    unreadB: notificationKeys.list('unread', WS_B, USER),
    countA: notificationKeys.unreadCount(WS_A, USER),
    countB: notificationKeys.unreadCount(WS_B, USER),
    countAll: notificationKeys.unreadCount(undefined, USER),
  };
  client.setQueryData(keys.unreadA, one([row('a1'), row('a22')]));
  client.setQueryData(keys.allA, one([row('a1'), row('a22')]));
  client.setQueryData(keys.unreadB, one([row('b1', { ws_id: WS_B })]));
  client.setQueryData(keys.countA, 2);
  client.setQueryData(keys.countB, 1);
  client.setQueryData(keys.countAll, 3);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, keys, wrapper };
}

afterEach(() => vi.unstubAllGlobals());

describe('useUpdateNotification', () => {
  it('moves one row and adjusts only the counts whose scope contains it', async () => {
    const { client, keys, wrapper } = setup();
    const response = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => response.promise)
    );
    const { result } = renderHook(
      () => useUpdateNotification({ cacheScope: USER }),
      { wrapper }
    );
    act(() => result.current.mutate({ id: 'a1', read: true }));
    await vi.waitFor(() =>
      expect(idsOf(client, keys.unreadA)).toEqual(['a22'])
    );
    expect(idsOf(client, keys.allA)).toEqual(['a1', 'a22']);
    expect(client.getQueryData(keys.countA)).toBe(1);
    expect(client.getQueryData(keys.countAll)).toBe(2);
    expect(client.getQueryData(keys.countB)).toBe(1);
    expect(idsOf(client, keys.unreadB)).toEqual(['b1']);
    response.resolve(json({ success: true }));
  });

  it('rolls back on failure but never over newer server data', async () => {
    const { client, keys, wrapper } = setup();
    const response = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => response.promise)
    );
    const { result } = renderHook(
      () => useUpdateNotification({ cacheScope: USER }),
      { wrapper }
    );
    act(() => result.current.mutate({ id: 'a1', read: true }));
    await vi.waitFor(() =>
      expect(idsOf(client, keys.unreadA)).toEqual(['a22'])
    );
    // A refresh lands while the request is in flight: the server says a1 was
    // read elsewhere. That list must keep the server's answer.
    client.setQueryData(keys.allA, one([row('a1', { read_at: 'remote' })]));
    response.resolve(json({ error: 'nope' }, 500));
    await vi.waitFor(() => expect(result.current.isError).toBe(true));
    expect(idsOf(client, keys.unreadA)).toEqual(['a1', 'a22']);
    expect(
      client.getQueryData<NotificationPages>(keys.allA)?.pages[0]
        ?.notifications[0]?.read_at
    ).toBe('remote');
    // Counts are re-read from the server rather than guessed.
    expect(client.getQueryState(keys.countA)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.countB)?.isInvalidated).toBe(false);
  });
});

describe('mark all read and undo', () => {
  it('marks only the requested workspace and keeps other counts', async () => {
    const { client, keys, wrapper } = setup();
    const response = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => response.promise)
    );
    const { result } = renderHook(
      () => useMarkAllAsRead({ cacheScope: USER }),
      { wrapper }
    );
    act(() => result.current.mutate(WS_A));
    await vi.waitFor(() => expect(idsOf(client, keys.unreadA)).toEqual([]));
    expect(client.getQueryData(keys.countA)).toBe(0);
    expect(client.getQueryData(keys.countB)).toBe(1);
    expect(idsOf(client, keys.unreadB)).toEqual(['b1']);
    response.resolve(
      json({ success: true, ids: ['a1', 'a22'], undo_revisions: ['r1', 'r2'] })
    );
    await vi.waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      scope: WS_A,
      ids: ['a1', 'a22'],
      undoRevisions: ['r1', 'r2'],
    });
  });

  it('offers no undo when the server does not report what changed', async () => {
    const { wrapper } = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ success: true }))
    );
    const { result } = renderHook(
      () => useMarkAllAsRead({ cacheScope: USER }),
      { wrapper }
    );
    await act(() => result.current.mutateAsync(WS_A));
    await vi.waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.ids).toBeNull();
  });

  it('marks all read but offers no undo above the shared restore limit', async () => {
    const { wrapper } = setup();
    const many = Array.from({ length: 401 }, (_, i) => `id-${i}`);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({ success: true, ids: many, undo_revisions: many })
      )
    );
    const { result } = renderHook(
      () => useMarkAllAsRead({ cacheScope: USER }),
      { wrapper }
    );
    await act(() => result.current.mutateAsync(WS_A));
    await vi.waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      scope: WS_A,
      ids: null,
      undoRevisions: null,
    });
  });

  it('restores the mark-all failure without dropping rows', async () => {
    const { client, keys, wrapper } = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ error: 'x' }, 500))
    );
    const { result } = renderHook(
      () => useMarkAllAsRead({ cacheScope: USER }),
      { wrapper }
    );
    await act(() => result.current.mutateAsync(WS_A).catch(() => {}));
    expect(idsOf(client, keys.unreadA)).toEqual(['a1', 'a22']);
    expect(client.getQueryState(keys.countA)?.isInvalidated).toBe(true);
  });

  it('undoes with row revisions and shows only server-restored rows', async () => {
    const { client, keys, wrapper } = setup();
    const read = { read_at: '2026-11-16T10:10:00.000Z' };
    client.setQueryData(keys.allA, one([row('a1', read), row('a22', read)]));
    // a22 was read again elsewhere after the mark-all: the server keeps it.
    const fetch = vi.fn(async () => json({ ids: ['a1'] }));
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(
      () => useUndoMarkAllAsRead({ cacheScope: USER }),
      { wrapper }
    );
    const outcome = await act(() =>
      result.current.mutateAsync({
        scope: WS_A,
        ids: ['a1', 'a22'],
        undoRevisions: ['r1', 'r2'],
      })
    );
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      action: 'restore_unread',
      ids: ['a1', 'a22'],
      revisions: ['r1', 'r2'],
    });
    expect(outcome).toEqual({ requested: 2, restored: ['a1'] });
    // No optimistic flip: the cache is re-read for the scope instead.
    expect(
      client
        .getQueryData<NotificationPages>(keys.allA)
        ?.pages[0]?.notifications.every((n) => n.read_at === read.read_at)
    ).toBe(true);
    expect(client.getQueryState(keys.allA)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.countA)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.unreadB)?.isInvalidated).toBe(false);
  });

  it('refuses to undo without revisions and sends nothing', async () => {
    const { wrapper } = setup();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(
      () => useUndoMarkAllAsRead({ cacheScope: USER }),
      { wrapper }
    );
    await expect(
      act(() =>
        result.current.mutateAsync({
          scope: WS_A,
          ids: ['a1'],
          undoRevisions: null,
        })
      )
    ).rejects.toThrow('This change cannot be undone');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('refresh while a change is pending', () => {
  it('reconciles once, after the last concurrent toggle settles', async () => {
    const { client, wrapper } = setup();
    const first = deferred<Response>();
    const second = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise)
    );
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(
      () => useUpdateNotification({ cacheScope: USER }),
      { wrapper }
    );
    act(() => {
      void result.current.mutateAsync({ id: 'a1', read: true });
      void result.current.mutateAsync({ id: 'a22', read: true });
    });
    await vi.waitFor(() => expect(client.isMutating()).toBe(2));
    first.resolve(json({ success: true }));
    await vi.waitFor(() => expect(client.isMutating()).toBe(1));
    expect(invalidate).not.toHaveBeenCalled();
    second.resolve(json({ success: true }));
    await vi.waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
  });
});
