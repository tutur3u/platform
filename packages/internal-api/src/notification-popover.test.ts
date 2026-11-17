import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getUnreadNotificationCount,
  NOTIFICATION_BRIDGE_BODY_LIMIT,
  NOTIFICATION_RESTORE_LIMIT,
  listNotificationPage,
  markAllNotificationsRead,
  restoreNotificationsUnread,
  SAME_ORIGIN_NOTIFICATION_API,
  setNotificationRead,
} from './notification-popover';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function capture(body: unknown = { success: true }, status = 200) {
  const fetch = vi.fn(async () => json(body, status));
  return {
    fetch,
    options: { ...SAME_ORIGIN_NOTIFICATION_API, fetch } as const,
    call: (i = 0) =>
      fetch.mock.calls[i] as unknown as [string, RequestInit | undefined],
  };
}

const path = (url: string) => {
  const parsed = new URL(url, 'http://relative.invalid');
  return `${parsed.pathname}${parsed.search}`;
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('notification popover helpers', () => {
  it('keeps browser list requests on the current origin with the existing query shape', async () => {
    // A browser runtime: no configured server origin is applied.
    vi.stubGlobal('window', {});
    const api = capture({ notifications: [], count: 0, limit: 20, offset: 0 });
    await listNotificationPage(
      { wsId: 'ws-1', limit: 20, offset: 40, unreadOnly: true },
      {},
      api.options
    );
    const [url, init] = api.call();
    expect(url.startsWith('/api/v1/notifications?')).toBe(true);
    const params = new URL(url, 'http://x').searchParams;
    expect(Object.fromEntries(params)).toEqual({
      limit: '20',
      offset: '40',
      unreadOnly: 'true',
      readOnly: 'false',
      wsId: 'ws-1',
    });
    expect(init?.cache).toBe('no-store');
  });

  it('omits the workspace filter for account-wide counts', async () => {
    const api = capture({ count: 4 });
    await expect(
      getUnreadNotificationCount(undefined, {}, api.options)
    ).resolves.toBe(4);
    expect(path(api.call()[0])).toBe('/api/v1/notifications/unread-count');
  });

  it('sends read toggles, mark-all and conditional restores as PATCH bodies', async () => {
    const api = capture({ success: true, ids: ['a'], undo_revisions: ['r'] });
    await setNotificationRead('id/1', false, api.options);
    await markAllNotificationsRead('ws-1', api.options);
    await restoreNotificationsUnread(['a'], ['r'], api.options);
    expect(path(api.call(0)[0])).toBe('/api/v1/notifications/id%2F1');
    expect(
      api.fetch.mock.calls.map((_, i) =>
        JSON.parse(String(api.call(i)[1]?.body))
      )
    ).toEqual([
      { read: false },
      { wsId: 'ws-1', action: 'mark_all_read' },
      { action: 'restore_unread', ids: ['a'], revisions: ['r'] },
    ]);
  });

  it('surfaces server refusals as errors instead of success', async () => {
    const api = capture({ error: 'Invalid request body' }, 400);
    await expect(
      restoreNotificationsUnread(['a'], ['r'], api.options)
    ).rejects.toMatchObject({ status: 400 });
  });

  it('keeps the largest undo body under the smallest notification proxy cap', async () => {
    const uuid = (i: number) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    const pairs = Array.from({ length: NOTIFICATION_RESTORE_LIMIT }, (_, i) =>
      uuid(i)
    );
    const api = capture({ ids: [] });
    await restoreNotificationsUnread(pairs, pairs, api.options);
    const [, init] = api.call();
    expect(init?.method).toBe('PATCH');
    const bytes = new TextEncoder().encode(String(init?.body)).length;
    expect(NOTIFICATION_RESTORE_LIMIT).toBe(400);
    expect(bytes).toBe(31_249);
    expect(bytes).toBeLessThanOrEqual(NOTIFICATION_BRIDGE_BODY_LIMIT);
  });

  it.each([
    ['empty', [], []],
    ['over the limit', Array(401).fill('a'), Array(401).fill('r')],
    ['unpaired', ['a', 'b'], ['r']],
  ])(
    'refuses an undo that is %s without sending it',
    async (_name, ids, revisions) => {
      const api = capture({ ids: [] });
      await expect(
        restoreNotificationsUnread(ids, revisions, api.options)
      ).rejects.toBeInstanceOf(RangeError);
      expect(api.fetch).not.toHaveBeenCalled();
    }
  );
});
