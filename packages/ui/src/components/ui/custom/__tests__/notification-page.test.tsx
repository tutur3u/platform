import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationPage } from '../notification-page';
import { DEFAULT_NOTIFICATION_PAGE_ALL_LABELS } from '../notification-page-labels';
import { NotificationRuntime } from '../notification-runtime';
import {
  fakeApi,
  notification,
  stubBrowser,
} from './notification-popover-fixtures';

const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
);
vi.mock('@tuturuuu/ui/sonner', () => ({ toast }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <NotificationRuntime
        value={{
          params: { wsId: 'personal' },
          pathname: '/personal/notifications',
          router: { push: vi.fn(), refresh: vi.fn() },
          Link: ({ children, ...props }) => <a {...props}>{children}</a>,
          realtime: false,
        }}
      >
        <NotificationPage
          userId="user-1"
          taskWsId="personal"
          labels={DEFAULT_NOTIFICATION_PAGE_ALL_LABELS}
          settingsHref="/personal/settings/notifications"
        />
      </NotificationRuntime>
    </QueryClientProvider>
  );
  return { ...view, client };
}

const rows = () => [
  notification('a', 5, { type: 'task_mention' }),
  notification('b', 10, { type: 'mail_received' }),
  notification('c', 15, { type: 'time_tracking_request_approved' }),
];

const toolbar = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-notification-toolbar]')!;

/** Structure that must not change between states: controls, order, sizing. */
const toolbarShape = (el: HTMLElement) =>
  [...el.querySelectorAll('button, [role]')].map(
    (node) =>
      `${node.tagName}:${node.getAttribute('role') ?? ''}:${node.getAttribute('aria-label') ?? node.textContent?.replace(/\d+/g, '')}`
  );

describe('NotificationPage', () => {
  it('opens on Unread and groups rows into time sections', async () => {
    const api = fakeApi(rows());
    stubBrowser(api.fetch);
    renderPage();
    expect(await screen.findByText('Title a')).toBeInTheDocument();
    const list = api.calls.find(
      (c) => c.method === 'GET' && c.url.includes('/api/v1/notifications?')
    );
    expect(list?.url).toContain('unreadOnly=true');
    expect(screen.getByRole('button', { name: /^Unread/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
  });

  it('keeps the toolbar and row grid identical across loading, data, selection and empty', async () => {
    const data = rows();
    const api = fakeApi(data);
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetch = vi.fn(async (...args: Parameters<typeof api.fetch>) => {
      await gate;
      return api.fetch(...args);
    });
    stubBrowser(fetch as unknown as typeof globalThis.fetch);
    const { container } = renderPage();

    const bar = toolbar(container);
    expect(bar.className).toContain('h-11');
    const loadingShape = toolbarShape(bar);
    const loading = container.querySelector(
      '[data-notification-state="loading"]'
    );
    expect(loading?.className).toContain('min-h-108');
    // Skeleton rows use the same grid as selectable rows.
    const skeletonGrid = loading?.querySelector('li')?.className;
    expect(skeletonGrid).toContain(
      'grid-cols-[1.25rem_0.5rem_2rem_minmax(0,1fr)_auto]'
    );

    await act(async () => release());
    const row = await screen.findByText('Title a');
    expect(toolbar(container)).toBe(bar);
    expect(toolbarShape(bar)).toEqual(loadingShape);
    const li = row.closest('li')!;
    expect(li.className).toContain(
      'grid-cols-[1.25rem_0.5rem_2rem_minmax(0,1fr)_auto]'
    );

    // Selecting swaps the toolbar contents in the same fixed-height bar and
    // keeps the row on the same grid.
    const rowClass = li.className.replace(/\s+/g, ' ');
    fireEvent.click(within(li).getByRole('checkbox'));
    expect(toolbar(container)).toBe(bar);
    expect(bar.className).toContain('h-11');
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(li).toHaveAttribute('data-selected', 'true');
    expect(li.className.replace(/\s+/g, ' ')).toBe(rowClass);

    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(toolbarShape(bar)).toEqual(loadingShape);

    // Mark all read empties Unread into the same fixed region.
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    const empty = await waitFor(() => {
      const node = container.querySelector('[data-notification-state="empty"]');
      expect(node).not.toBeNull();
      return node!;
    });
    expect(empty.className).toContain('min-h-108');
    expect(toolbar(container)).toBe(bar);
  });

  it('selects with X and Shift+X and marks the selection read in bulk', async () => {
    const api = fakeApi(rows());
    stubBrowser(api.fetch);
    renderPage();
    const first = (await screen.findByText('Title a')).closest('li')!;
    first.focus();
    fireEvent.keyDown(first, { key: 'x' });
    const third = screen.getByText('Title c').closest('li')!;
    third.focus();
    fireEvent.keyDown(third, { key: 'x', shiftKey: true });
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    // Every selected row in Unread is already unread.
    expect(
      within(toolbar(document.body)).getByRole('button', {
        name: 'Mark as unread',
      })
    ).toBeDisabled();

    const { container } = { container: document.body };
    fireEvent.click(
      within(toolbar(container)).getByRole('button', { name: 'Mark as read' })
    );
    await waitFor(() =>
      expect(
        api.calls.filter(
          (c) =>
            c.method === 'PATCH' &&
            (c.body as { read?: boolean } | undefined)?.read === true
        )
      ).toHaveLength(3)
    );
    await waitFor(() =>
      expect(screen.queryByText('3 selected')).not.toBeInTheDocument()
    );
    // Unread is now empty, so select-all is disabled and focus moves to the
    // heading instead of the page body.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: 'Notifications' })
      )
    );
  });

  it('does not retry a failed next page until Retry', async () => {
    const data = Array.from({ length: 35 }, (_, i) =>
      notification(`n${i}`, i + 1)
    );
    const api = fakeApi(data);
    const pageCalls = () =>
      api.calls.filter(
        (c) => c.method === 'GET' && c.url.includes('offset=30')
      );
    const fetch = vi.fn(async (...args: Parameters<typeof api.fetch>) => {
      const response = await api.fetch(...args);
      return String(args[0]).includes('offset=30')
        ? new Response('{}', { status: 500 })
        : response;
    });
    stubBrowser(fetch as unknown as typeof globalThis.fetch);
    // The end of the list is always on screen.
    class VisibleObserver {
      constructor(private callback: IntersectionObserverCallback) {}
      observe() {
        this.callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver
        );
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal('IntersectionObserver', VisibleObserver);
    renderPage();
    expect(
      await screen.findByRole('button', { name: 'Retry' })
    ).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pageCalls()).toHaveLength(1);
  });

  it('clears the selection with Escape', async () => {
    const api = fakeApi(rows());
    stubBrowser(api.fetch);
    renderPage();
    const first = (await screen.findByText('Title a')).closest('li')!;
    first.focus();
    fireEvent.keyDown(first, { key: ' ' });
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    fireEvent.keyDown(first, { key: 'Escape' });
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(first);
  });

  it('groups by app', async () => {
    const api = fakeApi(rows());
    stubBrowser(api.fetch);
    renderPage();
    await screen.findByText('Title a');
    fireEvent.click(screen.getByRole('button', { name: 'App' }));
    for (const name of ['Tasks', 'Mail', 'Track'])
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
  });

  it('shows a retryable error in the fixed region', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/unread-count')
        ? new Response(JSON.stringify({ count: 0 }))
        : new Response('{}', { status: 500 })
    );
    stubBrowser(fetch as unknown as typeof globalThis.fetch);
    const { container } = renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-notification-state', 'error');
    expect(alert.className).toContain('min-h-108');
    expect(toolbar(container).className).toContain('h-11');
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it('opens the shortcuts dialog with ?', async () => {
    const api = fakeApi(rows());
    stubBrowser(api.fetch);
    renderPage();
    const first = (await screen.findByText('Title a')).closest('li')!;
    fireEvent.keyDown(first, { key: '?' });
    expect(
      await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })
    ).toBeInTheDocument();
  });
});
