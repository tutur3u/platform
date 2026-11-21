// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, type Locale } from '../i18n';
import type { ShipRead } from '../native/ship-client';
import { ShipPage } from './ship-page';
import { NOW, snapshot, source } from './test-fixtures';

const server = vi.hoisted(() => ({ loadShip: vi.fn(), checkShipNow: vi.fn() }));
vi.mock('./server', () => server);
// Navigation links need a router; shell-nav.test.ts covers the entries.
vi.mock('../components/shell', () => ({
  Shell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Preferences: () => null,
  PageHeader: ({
    title,
    actions,
  }: {
    title: ReactNode;
    actions?: ReactNode;
  }) => (
    <header>
      <h1>{title}</h1>
      {actions}
    </header>
  ),
}));
vi.mock('../fleet/clock', () => ({ useNow: () => NOW }));

function show(initial: ShipRead, locale: Locale = 'en') {
  server.loadShip.mockResolvedValue(initial);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider locale={locale}>
        <ShipPage initial={initial} serverNow={NOW} />
      </I18nProvider>
    </QueryClientProvider>
  );
}

const ready = (snap = snapshot()): ShipRead => ({
  kind: 'ready',
  snapshot: snap,
  servedAt: new Date(NOW).toISOString(),
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
});

describe('Ship page', () => {
  it('shows live, staging, CI, the release gap and a freshness stamp per row', () => {
    show(ready());
    expect(screen.getByText('Checked 40 s ago, next in 1 min')).toBeTruthy();
    expect(screen.getByText('Deploy failed')).toBeTruthy();
    expect(screen.getAllByText('CI failed').length).toBeGreaterThan(0);
    expect(screen.getByText('Worker runs ddddddd')).toBeTruthy();
    expect(screen.getByText('Not in production yet')).toBeTruthy();
    expect(screen.getAllByText('14 commits')).toHaveLength(2); // stat and row
    expect(screen.getByText('No staging environment')).toBeTruthy();
    expect(screen.getAllByText('Checked 40 s ago').length).toBe(5);
    expect(screen.getAllByText('Source not configured')).toHaveLength(2);
    expect(screen.getByText('Calendar bbbbbbb')).toBeTruthy();
    expect(screen.queryByText(/cached/i)).toBeNull();
  });

  it('marks rows partial when a source fails and keeps the rest current', () => {
    show(
      ready(
        snapshot({
          sources: [
            source('github:tutur3u/platform'),
            source('github:upskii/platform'),
            source('cloudflare', {
              state: 'error',
              problem: 'http',
              okAt: null,
            }),
          ],
        })
      )
    );
    expect(screen.getByText(/Some sources are unavailable/)).toBeTruthy();
    expect(
      screen.getAllByText('Partial: Workers unavailable, rest 40 s ago').length
    ).toBe(3);
  });

  it('hides rows when every source is down until the stale snapshot is asked for', () => {
    show(
      ready(
        snapshot({
          sources: [
            source('github:tutur3u/platform', {
              state: 'error',
              okAt: '2026-11-22T09:38:00.000Z',
            }),
            source('github:upskii/platform', { state: 'error', okAt: null }),
            source('cloudflare', {
              state: 'backoff',
              okAt: null,
              retryAt: '2026-11-22T10:10:00.000Z',
            }),
          ],
        })
      )
    );
    expect(screen.getByRole('alert').textContent).toContain(
      '16:38 ICT (23 min ago)'
    );
    expect(screen.queryByText('Web')).toBeNull();
    fireEvent.click(screen.getByText('View the 16:38 snapshot, marked stale'));
    expect(screen.getByText('Web')).toBeTruthy();
    expect(
      screen.getAllByText('Stale: last check 23 min ago').length
    ).toBeGreaterThan(0);
  });

  it('runs Check now, reads fresh and reports a rate limit', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    server.checkShipNow.mockResolvedValueOnce({ state: 'checked' });
    show(ready());
    fireEvent.click(screen.getByText('Check now'));
    await waitFor(() =>
      expect(screen.getByText('Checked just now')).toBeTruthy()
    );
    await waitFor(() =>
      expect(server.loadShip).toHaveBeenCalledWith({ data: { fresh: true } })
    );
    server.checkShipNow.mockResolvedValueOnce({
      state: 'rate_limited',
      retryAfterMs: 20_000,
    });
    fireEvent.click(screen.getByText('Check now'));
    await waitFor(() =>
      expect(
        screen.getByText('Checked moments ago. Try again in 20 s.')
      ).toBeTruthy()
    );
  });

  it('renders the uncollected, load-error and Vietnamese states', () => {
    show({ kind: 'uncollected' });
    expect(screen.getByText('No ship check has run yet')).toBeTruthy();
    cleanup();
    show({ kind: 'error', reason: 'unavailable' });
    expect(screen.getByRole('alert').textContent).toContain(
      'Web did not answer'
    );
    cleanup();
    show(ready(), 'vi');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Phát hành'
    );
    expect(screen.getByText('Triển khai lỗi')).toBeTruthy();
  });
});
