import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import {
  applyNotificationToList,
  invalidateScope,
  markListRead,
  type NotificationPages,
  notificationKeys,
  trimClosedList,
} from '../notification-cache';
import type { Notification } from '../notification-types';

const WS_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const WS_B = 'bbbbbbbb-0000-4000-8000-000000000002';

function n(id: string, minutesAgo: number, extra: Partial<Notification> = {}) {
  return {
    id,
    ws_id: WS_A,
    user_id: 'user-1',
    type: 'task_assigned',
    title: id,
    description: null,
    data: {},
    entity_type: 'task',
    entity_id: `task-${id}`,
    read_at: null,
    created_at: new Date(
      Date.UTC(2026, 10, 16, 12, 0) - minutesAgo * 60_000
    ).toISOString(),
    created_by: null,
    actor: null,
    ...extra,
  } satisfies Notification;
}

function pages(
  rows: Notification[][],
  count = rows.flat().length
): NotificationPages {
  let offset = 0;
  return {
    pages: rows.map((notifications) => {
      const page = { notifications, count, limit: 2, offset };
      offset += notifications.length;
      return page;
    }),
    pageParams: rows.map((_, i) => i * 2),
  };
}

const unreadA = { scope: WS_A, unreadOnly: true, readOnly: false };
const allEverywhere = { scope: 'all', unreadOnly: false, readOnly: false };
const ids = (data: NotificationPages) =>
  data.pages.flatMap((p) => p.notifications.map((x) => x.id));

describe('applyNotificationToList', () => {
  it('removes a read row from Unread and lowers the total on every page', () => {
    const data = pages([[n('1', 1), n('2', 2)], [n('3', 3)]], 5);
    const next = applyNotificationToList(data, unreadA, {
      ...n('2', 2),
      read_at: '2026-11-16T12:00:00.000Z',
    });
    expect(ids(next)).toEqual(['1', '3']);
    expect(next.pages.map((p) => p.count)).toEqual([4, 4]);
  });

  it('inserts a row marked unread at its server position, not at the top', () => {
    const data = pages([[n('1', 1), n('3', 30)]], 2);
    const next = applyNotificationToList(data, unreadA, n('2', 10));
    expect(ids(next)).toEqual(['1', '2', '3']);
    expect(next.pages[0]!.count).toBe(3);
  });

  it('does not insert past the loaded range when more pages exist', () => {
    const data = pages([[n('1', 1), n('2', 2)]], 9);
    const next = applyNotificationToList(data, unreadA, n('old', 999));
    expect(ids(next)).toEqual(['1', '2']);
    expect(next.pages[0]!.count).toBe(10);
  });

  it('ignores notifications from another workspace', () => {
    const data = pages([[n('1', 1)]]);
    const next = applyNotificationToList(
      data,
      unreadA,
      n('b', 0, { ws_id: WS_B })
    );
    expect(next).toBe(data);
  });

  it('keeps untouched rows referentially stable', () => {
    const first = n('1', 1);
    const data = pages([[first, n('2', 2)]]);
    const next = applyNotificationToList(data, allEverywhere, {
      ...n('2', 2),
      read_at: '2026-11-16T12:00:00.000Z',
    });
    expect(next.pages[0]!.notifications[0]).toBe(first);
  });
});

describe('markListRead', () => {
  it('empties an Unread list the mark-all fully covers', () => {
    const data = pages([[n('1', 1), n('2', 2)]], 40);
    const { data: next, exact } = markListRead(data, unreadA, WS_A, 'now');
    expect(ids(next)).toEqual([]);
    expect(next.pages[0]!.count).toBe(0);
    expect(exact).toBe(true);
  });

  it('only touches the marked workspace inside an account-wide list', () => {
    const data = pages(
      [[n('a', 1), n('b', 2, { ws_id: WS_B }), n('u', 3, { ws_id: null })]],
      30
    );
    const key = { scope: 'all', unreadOnly: true, readOnly: false };
    const { data: next, exact } = markListRead(data, key, WS_A, 'now');
    expect(ids(next)).toEqual(['b', 'u']);
    // Unloaded unread rows of WS_A may exist; the total is not trusted.
    expect(exact).toBe(false);
    expect(next.pages[0]!.count).toBe(29);
  });
});

describe('invalidateScope', () => {
  it('reconciles only lists and counts that can hold the changed scope', async () => {
    const client = new QueryClient();
    const keys = {
      countA: notificationKeys.unreadCount(WS_A, 'user-1'),
      countB: notificationKeys.unreadCount(WS_B, 'user-1'),
      countAll: notificationKeys.unreadCount(undefined, 'user-1'),
      listB: notificationKeys.list('unread', WS_B, 'user-1'),
      otherActor: notificationKeys.unreadCount(WS_A, 'user-2'),
    };
    for (const key of Object.values(keys)) client.setQueryData(key, 1);
    await invalidateScope(client, WS_A, 'user-1');
    const stale = (key: readonly unknown[]) =>
      client.getQueryState(key)?.isInvalidated;
    expect(stale(keys.countA)).toBe(true);
    expect(stale(keys.countAll)).toBe(true);
    expect(stale(keys.countB)).toBe(false);
    expect(stale(keys.listB)).toBe(false);
    expect(stale(keys.otherActor)).toBe(false);
  });
});

describe('trimClosedList', () => {
  it('keeps one page so a reopen refetches a single request', () => {
    const client = new QueryClient();
    const key = notificationKeys.list('all', undefined, 'user-1');
    client.setQueryData(key, pages([[n('1', 1), n('2', 2)], [n('3', 3)]], 3));
    trimClosedList(client, key);
    const data = client.getQueryData<NotificationPages>(key)!;
    expect(data.pages).toHaveLength(1);
    expect(data.pageParams).toEqual([0]);
  });
});
