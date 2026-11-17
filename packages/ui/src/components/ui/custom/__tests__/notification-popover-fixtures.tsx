import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { Notification } from '@tuturuuu/ui/hooks/use-notifications';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { NotificationRuntime } from '../notification-runtime';
import SatelliteNotificationPopover from '../satellite-notification-popover';

export const WS = 'aaaaaaaa-0000-4000-8000-000000000001';

export function notification(
  id: string,
  minutesAgo: number,
  extra: Partial<Notification> = {}
): Notification {
  return {
    id,
    ws_id: WS,
    user_id: 'user-1',
    type: 'task_assigned',
    title: `Title ${id}`,
    description: null,
    data: {},
    entity_type: null,
    entity_id: null,
    read_at: null,
    created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    created_by: null,
    actor: null,
    ...extra,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * A stateful fake of the notification API with the server's filter and
 * conditional-restore semantics, recording every request so tests can assert
 * request counts and bodies.
 */
export function fakeApi(
  rows: Notification[],
  unreadCount = rows.filter((n) => !n.read_at).length
) {
  let unread = unreadCount;
  let revisionCounter = 0;
  const revisions = new Map<string, string>();
  const calls: { url: string; method: string; body?: unknown }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    if (url.includes('/unread-count')) return json({ count: unread });
    if (method === 'GET') {
      const params = new URL(url, 'http://x').searchParams;
      const list =
        params.get('unreadOnly') === 'true'
          ? rows.filter((n) => !n.read_at)
          : rows;
      const offset = Number(params.get('offset'));
      const limit = Number(params.get('limit'));
      return json({
        notifications: list.slice(offset, offset + limit),
        count: list.length,
        limit,
        offset,
      });
    }
    // Models the per-row database revision: every read-state change of a
    // row gives it a new opaque value.
    if (body?.action === 'mark_all_read') {
      const changed = rows.filter((n) => !n.read_at);
      for (const n of changed) {
        n.read_at = 'server-read';
        revisions.set(n.id, `rev-${++revisionCounter}`);
      }
      unread = 0;
      return json({
        success: true,
        ids: changed.map((n) => n.id),
        undo_revisions: changed.map((n) => revisions.get(n.id)),
      });
    }
    if (body?.action === 'restore_unread') {
      const restored = rows.filter(
        (n) =>
          body.ids.includes(n.id) &&
          n.read_at &&
          body.revisions.includes(revisions.get(n.id))
      );
      for (const n of restored) revisions.set(n.id, `rev-${++revisionCounter}`);
      for (const n of restored) n.read_at = null;
      unread += restored.length;
      return json({ ids: restored.map((n) => n.id) });
    }
    const id = url.split('/').at(-1);
    const target = rows.find((n) => n.id === id);
    if (method === 'PATCH' && target && typeof body?.read === 'boolean') {
      if (!target.read_at !== !body.read) {
        unread += body.read ? -1 : 1;
        revisions.set(target.id, `rev-${++revisionCounter}`);
      }
      target.read_at = body.read ? 'server-read' : null;
    }
    return json({ success: true });
  });
  return { fetch, calls };
}

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

export function stubBrowser(fetch: typeof globalThis.fetch) {
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('ResizeObserver', NoopObserver);
  vi.stubGlobal('IntersectionObserver', NoopObserver);
}

export function renderPopover({
  realtime = true,
  pollIntervalMs,
  wsId = WS,
  wrap = (popover) => popover,
  hostApp,
}: {
  realtime?: boolean;
  pollIntervalMs?: number;
  wsId?: string;
  wrap?: (popover: ReactNode) => ReactNode;
  hostApp?: 'mail';
} = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = { push: vi.fn(), refresh: vi.fn() };
  const view = render(
    <QueryClientProvider client={client}>
      <NotificationRuntime
        value={{
          params: { wsId },
          pathname: `/${wsId}`,
          hostApp,
          router,
          Link: ({ children, ...props }) => <a {...props}>{children}</a>,
          realtime,
        }}
      >
        {wrap(
          <SatelliteNotificationPopover
            userId="user-1"
            pollIntervalMs={pollIntervalMs}
          />
        )}
      </NotificationRuntime>
    </QueryClientProvider>
  );
  return { ...view, client, router };
}
