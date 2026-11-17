import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  NOTIFICATION_MUTATION_KEY,
  notificationKeys,
} from '@tuturuuu/ui/hooks/use-notifications';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fakeApi,
  notification,
  renderPopover,
  stubBrowser,
  WS,
} from './notification-popover-fixtures';

const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
);
vi.mock('@tuturuuu/ui/sonner', () => ({ toast }));

const navigation = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock('../notification-targets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../notification-targets')>()),
  navigateToNotificationTarget: (href: string) => navigation.calls.push(href),
}));

const lists = (calls: { url: string; method: string }[]) =>
  calls.filter(
    (c) => c.method === 'GET' && c.url.startsWith('/api/v1/notifications?')
  );

async function openPopover() {
  const bell = await screen.findByRole('button', { name: /^Notifications/ });
  await waitFor(() => expect(bell).toBeEnabled());
  fireEvent.click(bell);
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  await screen.findByRole('dialog');
  return bell;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('notification popover', () => {
  it('requests only the unread count while closed, independent of list rows', async () => {
    const api = fakeApi([notification('n1', 1), notification('n2', 2)], 7);
    stubBrowser(api.fetch);
    renderPopover();
    await screen.findByRole('button', { name: 'Notifications, 7 unread' });
    expect(api.calls.map((c) => c.url)).toEqual([
      `/api/v1/notifications/unread-count?wsId=${WS}`,
    ]);

    await openPopover();
    await screen.findByText('Title n1');
    // The Unread tab shows the server count, not the loaded row count.
    expect(screen.getByRole('tab', { name: /Unread/ })).toHaveTextContent('7');
    const [first, ...rest] = lists(api.calls);
    expect(rest).toHaveLength(0);
    const params = new URL(first!.url, 'http://x').searchParams;
    expect(params.get('unreadOnly')).toBe('true');
    expect(params.get('wsId')).toBe(WS);
  });

  it('moves focus by keyboard, toggles with E and returns focus on Escape', async () => {
    const api = fakeApi([
      notification('n1', 1),
      notification('n2', 2),
      notification('n3', 3),
    ]);
    stubBrowser(api.fetch);
    renderPopover();
    const bell = await openPopover();
    const row = (id: string) =>
      document.querySelector(`[data-notification-row="${id}"]`);
    await waitFor(() => expect(document.activeElement).toBe(row('n1')));

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(row('n2'));
    expect(row('n2')).toHaveAttribute('tabindex', '0');
    expect(row('n1')).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(document.activeElement!, { key: 'e' });
    await waitFor(() => expect(row('n2')).toBeNull());
    // The read row left Unread; focus stays in the list.
    expect(document.activeElement).toBe(row('n3'));
    expect(
      api.calls.find((c) => c.method === 'PATCH' && c.url.endsWith('/n2'))?.body
    ).toEqual({ read: true });
    expect(await screen.findByText('Marked as read')).toBeInTheDocument();

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(bell);
  });

  it('marks all read in the route workspace and undoes with row revisions', async () => {
    const api = fakeApi([notification('n1', 1), notification('n2', 2)]);
    stubBrowser(api.fetch);
    renderPopover();
    await openPopover();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Mark all as read' })
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(
      api.calls.find((c) => c.body && (c.body as any).action)?.body
    ).toEqual({ wsId: WS, action: 'mark_all_read' });
    const [message, options] = toast.success.mock.calls[0]!;
    expect(message).toBe('Marked all as read');

    options.action.onClick();
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Restored as unread')
    );
    expect(
      api.calls.find((c) => (c.body as any)?.action === 'restore_unread')?.body
    ).toEqual({
      action: 'restore_unread',
      ids: ['n1', 'n2'],
      revisions: ['rev-1', 'rev-2'],
    });
  });

  it('keeps a row changed elsewhere after the mark-all and says so', async () => {
    const api = fakeApi([notification('n1', 1), notification('n2', 2)]);
    stubBrowser(api.fetch);
    renderPopover();
    await openPopover();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Mark all as read' })
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    // Another device unreads and reads n1 again before Undo (A-B-A).
    const patch = (read: boolean) =>
      api.fetch('/api/v1/notifications/n1', {
        method: 'PATCH',
        body: JSON.stringify({ read }),
      });
    await patch(false);
    await patch(true);

    toast.success.mock.calls[0]![1].action.onClick();
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        'Restored. Some notifications changed elsewhere and were kept.'
      )
    );
    expect(toast.success).not.toHaveBeenCalledWith('Restored as unread');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Notifications, 1 unread' })
      ).toBeInTheDocument()
    );
  });

  it('reports a refused undo instead of claiming the rows were restored', async () => {
    const api = fakeApi([notification('n1', 1)]);
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      String(init?.body ?? '').includes('restore_unread')
        ? new Response(JSON.stringify({ error: 'Invalid request body' }), {
            status: 400,
          })
        : api.fetch(input, init)
    );
    stubBrowser(fetch);
    renderPopover();
    await openPopover();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Mark all as read' })
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    toast.success.mock.calls[0]![1].action.onClick();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Couldn’t undo')
    );
    expect(toast.success).not.toHaveBeenCalledWith('Restored as unread');
  });

  it('offers no undo when the server cannot report what it changed', async () => {
    const api = fakeApi([notification('n1', 1)]);
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      String(init?.body ?? '').includes('mark_all_read')
        ? new Response(JSON.stringify({ success: true, ids: null }), {
            headers: { 'Content-Type': 'application/json' },
          })
        : api.fetch(input, init)
    );
    stubBrowser(fetch);
    renderPopover();
    await openPopover();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Mark all as read' })
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(toast.success.mock.calls[0]![1].action).toBeUndefined();
  });

  it('reports a failed first load and retries on request', async () => {
    const api = fakeApi([notification('n1', 1)]);
    let failing = true;
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      failing && String(input).startsWith('/api/v1/notifications?')
        ? new Response('{}', { status: 500 })
        : api.fetch(input, init)
    );
    stubBrowser(fetch);
    renderPopover();
    await openPopover();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Couldn’t load notifications');
    failing = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Title n1')).toBeInTheDocument();
  });

  it('shows the caught-up state and switches to All', async () => {
    const api = fakeApi([notification('n1', 1, { read_at: 'x' })], 0);
    stubBrowser(api.fetch);
    renderPopover();
    await openPopover();
    fireEvent.click(await screen.findByRole('button', { name: 'Show all' }));
    expect(await screen.findByText('Title n1')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it.each([
    [true, undefined, 15 * 60_000],
    [false, 30_000, 30_000],
  ])(
    'keeps the count freshness policy (realtime %s)',
    async (realtime, pollIntervalMs, expected) => {
      stubBrowser(fakeApi([]).fetch);
      const { client } = renderPopover({ realtime, pollIntervalMs });
      await screen.findByRole('button', { name: /^Notifications/ });
      const query = client
        .getQueryCache()
        .find({ queryKey: notificationKeys.unreadCount(WS, 'user-1') });
      const interval = query?.observers[0]?.options.refetchInterval;
      const resolved =
        typeof interval === 'function' ? interval(query!) : interval;
      expect(resolved).toBe(expected);
    }
  );
});

describe('notification refresh while a read change is in flight', () => {
  it('pauses the count poll and focus refresh until the change settles', async () => {
    stubBrowser(fakeApi([]).fetch);
    const { client } = renderPopover({
      realtime: false,
      pollIntervalMs: 30_000,
    });
    await screen.findByRole('button', { name: /^Notifications/ });
    const query = client
      .getQueryCache()
      .find({ queryKey: notificationKeys.unreadCount(WS, 'user-1') })!;
    const options = query.observers[0]!.options;
    const interval = options.refetchInterval as (q: typeof query) => unknown;
    const onFocus = options.refetchOnWindowFocus as (
      q: typeof query
    ) => unknown;
    expect(interval(query)).toBe(30_000);
    expect(onFocus(query)).toBe(true);
    const pending = client.getMutationCache().build(client, {
      mutationKey: NOTIFICATION_MUTATION_KEY,
      mutationFn: () => new Promise(() => {}),
    });
    void pending.execute(undefined);
    await vi.waitFor(() => expect(interval(query)).toBe(false));
    expect(onFocus(query)).toBe(false);
  });
});

describe('open in context', () => {
  it('sends the read change before opening the mail thread in Mail', async () => {
    navigation.calls.length = 0;
    const mailbox = 'bbbbbbbb-0000-4000-8000-000000000001';
    const thread = 'bbbbbbbb-0000-4000-8000-000000000002';
    const api = fakeApi([
      notification('m1', 1, {
        type: 'mail_received',
        ws_id: null,
        entity_type: 'mail_message',
        data: { mailboxId: mailbox, threadId: thread },
      }),
      notification('s1', 2, { type: 'system_announcement' }),
    ]);
    stubBrowser(api.fetch);
    renderPopover();
    await openPopover();
    await screen.findByText('Title m1');
    // System rows have nothing to open.
    expect(screen.getAllByRole('button', { name: /^Open in / })).toHaveLength(
      1
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open in Mail' }));
    await waitFor(() => expect(navigation.calls).toHaveLength(1));
    const patch = api.calls.findIndex((c) => c.method === 'PATCH');
    expect(patch).toBeGreaterThanOrEqual(0);
    expect(api.calls[patch]?.body).toMatchObject({ read: true });
    const url = new URL(navigation.calls[0]!);
    expect(url.pathname.endsWith('/personal')).toBe(true);
    expect(url.searchParams.get('mailbox')).toBe(mailbox);
    expect(url.searchParams.get('thread')).toBe(thread);
  });
});
