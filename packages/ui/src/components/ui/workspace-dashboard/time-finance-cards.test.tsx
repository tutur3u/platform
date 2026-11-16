import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  running: vi.fn(),
  stats: vi.fn(),
  goals: vi.fn(),
  days: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/time-tracking', () => ({
  getCurrentUserRunningTimeTrackingSession: api.running,
  getCurrentUserTimeTrackingStats: api.stats,
  listCurrentUserTimeTrackingGoals: api.goals,
  getCurrentUserTimeTrackingDailyTotals: api.days,
  stopCurrentUserTimeTrackingSession: api.stop,
  pauseCurrentUserTimeTrackingSession: api.pause,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations:
    () => (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
}));

import { secondsSince, splitDuration } from './dashboard-model';
import { FinanceMonthCard } from './finance-month-card';
import { TimeCard } from './time-card';

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

describe('TimeCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.goals.mockResolvedValue([]);
    api.days.mockResolvedValue([]);
  });

  it('shows the running timer and totals for the viewer only', async () => {
    api.running.mockResolvedValue({
      id: 's1',
      title: 'Prepare quarterly launch checklist for every regional team',
      start_time: new Date(Date.now() - 42 * 60_000).toISOString(),
    });
    api.stats.mockResolvedValue({
      todayTime: 3 * 3600 + 42 * 60,
      weekTime: 21 * 3600 + 10 * 60,
      monthTime: 0,
      streak: 0,
    });
    wrap(<TimeCard wsId="ws1" trackHref="https://track/ws1" />);

    expect(screen.getByRole('status')).toHaveTextContent('loading');
    expect(
      await screen.findByText('duration:{"hours":3,"minutes":42}')
    ).toBeInTheDocument();
    expect(screen.getByText('duration:{"hours":21,"minutes":10}')).toBeInTheDocument();
    expect(screen.getByText('timer_running')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /track/ })).toHaveAttribute(
      'href',
      'https://track/ws1'
    );
    expect(api.running).toHaveBeenCalledWith('ws1', expect.anything());
    const [wsId, query] = api.stats.mock.calls[0]!;
    expect(wsId).toBe('ws1');
    expect(query).toEqual({ timezone: expect.any(String) });
    expect(query).not.toHaveProperty('userId');
  });

  it('pauses and stops only the viewer session through the existing route', async () => {
    api.running.mockResolvedValue({
      id: 'session-1',
      title: 'Deep work',
      start_time: new Date().toISOString(),
    });
    api.stats.mockResolvedValue({ todayTime: 0, weekTime: 0, monthTime: 0, streak: 0 });
    api.pause.mockResolvedValue({ session: null });
    api.stop.mockResolvedValue({ session: null });
    wrap(<TimeCard wsId="ws1" trackHref="/track" />);

    fireEvent.click(await screen.findByRole('button', { name: /timer_pause/ }));
    await waitFor(() => expect(api.pause).toHaveBeenCalledWith('ws1', 'session-1'));
    // Both actions are disabled while one is in flight.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /timer_stop/ })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: /timer_stop/ }));
    await waitFor(() => expect(api.stop).toHaveBeenCalledWith('ws1', 'session-1'));
  });

  it('shows a truthful setup state without a goal, and real progress with one', async () => {
    api.running.mockResolvedValue(null);
    api.stats.mockResolvedValue({ todayTime: 3 * 3600, weekTime: 0, monthTime: 0, streak: 0 });
    const { unmount } = wrap(<TimeCard wsId="ws1" trackHref="https://track/ws1" />);

    expect(await screen.findByText('goal_unset')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'goal_set_up' })).toHaveAttribute(
      'href',
      'https://track/ws1'
    );
    expect(screen.queryByRole('progressbar')).toBeNull();
    unmount();

    api.goals.mockResolvedValue([
      { id: 'cat', is_active: true, category_id: 'c1', daily_goal_minutes: 30, weekly_goal_minutes: null },
      { id: 'all', is_active: true, category_id: null, daily_goal_minutes: 240, weekly_goal_minutes: null },
    ]);
    wrap(<TimeCard wsId="ws2" trackHref="/track" />);
    const bar = await screen.findByRole('progressbar');
    // 3h of a 4h overall goal; the 30 min category goal is not used.
    expect(bar).toHaveAttribute('aria-valuenow', '75');
  });

  it('draws seven days from returned totals only', async () => {
    api.running.mockResolvedValue(null);
    api.stats.mockResolvedValue({ todayTime: 0, weekTime: 0, monthTime: 0, streak: 0 });
    api.days.mockResolvedValue([]);
    wrap(<TimeCard wsId="ws3" trackHref="/track" />);

    const week = await screen.findByRole('list', { name: 'week_label' });
    expect(week.querySelectorAll('li')).toHaveLength(7);
    expect(week).toHaveTextContent('duration:{"hours":0,"minutes":0}');
    const [, query] = api.days.mock.calls[0]!;
    expect(query).toEqual({
      dateFrom: expect.any(String),
      dateTo: expect.any(String),
      timezone: expect.any(String),
    });
  });

  it('fails with Retry and recovers both reads', async () => {
    api.running.mockRejectedValueOnce(new Error('down')).mockResolvedValue(null);
    api.stats.mockResolvedValue({ todayTime: 0, weekTime: 0, monthTime: 0, streak: 0 });
    wrap(<TimeCard wsId="ws1" trackHref="/track" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('time_error');
    fireEvent.click(screen.getByRole('button', { name: /retry/ }));
    expect(await screen.findByText('no_timer')).toBeInTheDocument();
  });
});

describe('FinanceMonthCard', () => {
  it('formats both totals and says when amounts were redacted', () => {
    render(
      <FinanceMonthCard
        financeHref="https://finance/ws1"
        state={{
          status: 'ready',
          income: 18_200_000,
          expense: 12_480_000,
          currency: 'VND',
          locale: 'en',
          redacted: true,
          monthLabel: 'November',
          timeZone: 'Asia/Ho_Chi_Minh',
          recent: [
            { id: 't1', label: 'Groceries', amount: -320_000, takenAt: '2026-11-16T03:00:00Z' },
            { id: 't2', label: null, amount: null, takenAt: '2026-11-15T03:00:00Z' },
          ],
        }}
      />
    );
    expect(screen.getByRole('region', { name: 'November' })).toBeInTheDocument();
    expect(screen.getByText(/12,480,000/)).toBeInTheDocument();
    expect(screen.getByText(/18,200,000/)).toBeInTheDocument();
    expect(screen.getByText('finance_redacted')).toBeInTheDocument();
    const recent = screen.getByRole('list', { name: 'recent_transactions' });
    expect(recent.querySelectorAll('li')).toHaveLength(2);
    expect(recent).toHaveTextContent('Groceries');
    expect(recent).toHaveTextContent('untitled_transaction');
    // A withheld amount is announced as hidden, never shown as zero.
    expect(recent).toHaveTextContent('amount_hidden');
    expect(screen.queryByRole('link', { name: /log_transaction/ })).toBeNull();
  });

  it('offers Log only when the adapter passes the create flow', () => {
    render(
      <FinanceMonthCard
        financeHref="/finance"
        logHref="https://finance/ws1/transactions?create=transaction"
        state={{
          status: 'ready',
          income: 0,
          expense: 0,
          currency: 'USD',
          locale: 'en',
          redacted: false,
          monthLabel: 'November',
          timeZone: 'UTC',
          recent: [],
        }}
      />
    );
    expect(screen.getByRole('link', { name: /log_transaction/ })).toHaveAttribute(
      'href',
      'https://finance/ws1/transactions?create=transaction'
    );
    expect(screen.getByText('no_transactions')).toBeInTheDocument();
  });

  it('renders the injected Retry inside an alert on error', () => {
    render(
      <FinanceMonthCard
        financeHref="/finance"
        state={{ status: 'error' }}
        retry={<button type="button">retry</button>}
      />
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('finance_error');
    expect(alert).toContainElement(screen.getByRole('button', { name: 'retry' }));
  });
});

describe('duration helpers', () => {
  it('splits seconds and never goes negative', () => {
    expect(splitDuration(3 * 3600 + 42 * 60 + 59)).toEqual({ hours: 3, minutes: 42 });
    expect(splitDuration(-5)).toEqual({ hours: 0, minutes: 0 });
    const now = new Date('2026-11-16T12:00:00Z');
    expect(secondsSince('2026-11-16T11:59:00Z', now)).toBe(60);
    expect(secondsSince('2026-11-16T12:05:00Z', now)).toBe(0);
    expect(secondsSince(null, now)).toBe(0);
  });
});
