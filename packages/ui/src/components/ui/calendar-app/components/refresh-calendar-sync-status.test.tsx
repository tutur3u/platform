import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import {
  getWorkspaceCalendarSyncStatus,
  syncWorkspaceCalendar,
} from '@tuturuuu/internal-api/calendar';
import type { CalendarSyncStatusResponse } from '@tuturuuu/internal-api/calendar-sync';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calendarSyncStatusQueryOptions,
  refreshCalendarSyncStatus,
} from './refresh-calendar-sync-status';

vi.mock('@tuturuuu/internal-api/calendar', () => ({
  getWorkspaceCalendarSyncStatus: vi.fn(),
  syncWorkspaceCalendar: vi.fn(),
}));
const interval = 5 * 60_000;
let client: QueryClient;
let status: CalendarSyncStatusResponse;
const getStatus = vi.mocked(getWorkspaceCalendarSyncStatus);
const sync = vi.mocked(syncWorkspaceCalendar);
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-11T12:00:00Z'));
  focusManager.setFocused(true);
  onlineManager.setOnline(true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  status = {
    health: {
      state: 'degraded',
      reason: 'sync_stale',
      currentlyRunning: false,
      lastSuccessAt: null,
      lastFailureAt: null,
      retryAfterSeconds: null,
    },
    accountsSummary: { total: 1, google: 1, microsoft: 0 },
    connectionsSummary: { total: 2, enabled: 2 },
  };
  getStatus.mockReset().mockImplementation(async () => structuredClone(status));
  sync.mockReset().mockImplementation(async () => {
    status.health = {
      ...status.health,
      state: 'healthy',
      reason: 'ok',
      lastSuccessAt: new Date().toISOString(),
    };
    return { ok: true };
  });
});
afterEach(() => {
  client.clear();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  vi.useRealTimers();
});

describe('automatic provider synchronization', () => {
  it('imports stale calendars and refreshes every loaded event range without touching other workspaces', async () => {
    client.setQueryData(['databaseCalendarEvents', 'ws', 'week'], []);
    client.setQueryData(['databaseCalendarEvents', 'ws', 'month'], []);
    client.setQueryData(['databaseCalendarEvents', 'other'], []);
    const result = await refreshCalendarSyncStatus(client, 'ws');
    expect(sync).toHaveBeenCalledExactlyOnceWith('ws');
    expect(result.health.state).toBe('healthy');
    expect(
      client.getQueryState(['databaseCalendarEvents', 'ws', 'week'])
        ?.isInvalidated
    ).toBe(true);
    expect(
      client.getQueryState(['databaseCalendarEvents', 'ws', 'month'])
        ?.isInvalidated
    ).toBe(true);
    expect(
      client.getQueryState(['databaseCalendarEvents', 'other'])?.isInvalidated
    ).toBe(false);
  });

  it.each(['paused', 'disconnected', 'syncing'] as const)(
    'does not start a sync when %s',
    async (state) => {
      status.health.state = state;
      status.health.currentlyRunning = state === 'syncing';
      await refreshCalendarSyncStatus(client, 'ws');
      expect(sync).not.toHaveBeenCalled();
    }
  );
  it.each(['auth', 'reconnect_required', 'configuration'])(
    'leaves %s failures for recovery',
    async (reason) => {
      status.health.reason = reason;
      await refreshCalendarSyncStatus(client, 'ws');
      expect(sync).not.toHaveBeenCalled();
    }
  );
  it('honors cooldowns, disabled calendars and the active-sync switch', async () => {
    status.health.retryAfterSeconds = 30;
    await refreshCalendarSyncStatus(client, 'ws');
    status.health.retryAfterSeconds = null;
    status.connectionsSummary.enabled = 0;
    await refreshCalendarSyncStatus(client, 'ws');
    status.connectionsSummary.enabled = 2;
    await refreshCalendarSyncStatus(client, 'ws', true);
    expect(sync).not.toHaveBeenCalled();
  });
  it('waits for an in-flight manual sync', async () => {
    let finish!: () => void;
    const mutation = client.getMutationCache().build(client, {
      mutationKey: ['calendar-provider-sync', 'ws'],
      mutationFn: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    });
    const pending = mutation.execute(undefined);
    await vi.advanceTimersByTimeAsync(0);
    await refreshCalendarSyncStatus(client, 'ws');
    expect(sync).not.toHaveBeenCalled();
    finish();
    await pending;
  });
  it('waits until healthy calendars are five minutes old', async () => {
    status.health.state = 'healthy';
    status.health.lastSuccessAt = new Date().toISOString();
    await refreshCalendarSyncStatus(client, 'ws');
    expect(sync).not.toHaveBeenCalled();
    vi.advanceTimersByTime(interval);
    await refreshCalendarSyncStatus(client, 'ws');
    expect(sync).toHaveBeenCalledOnce();
  });
  it('deduplicates overlapping controls while exposing neutral syncing state', async () => {
    let finish!: () => void;
    sync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ ok: true });
        })
    );
    const first = refreshCalendarSyncStatus(client, 'ws');
    await vi.advanceTimersByTimeAsync(0);
    expect(
      client.getQueryData<CalendarSyncStatusResponse>([
        'calendar-sync-status',
        'ws',
      ])?.health.currentlyRunning
    ).toBe(true);
    await refreshCalendarSyncStatus(client, 'ws');
    expect(sync).toHaveBeenCalledOnce();
    finish();
    await first;
  });
  it('backs off after partial failures and still refreshes imported events', async () => {
    sync.mockResolvedValue({ ok: false, partialFailure: true });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await refreshCalendarSyncStatus(client, 'ws');
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['databaseCalendarEvents', 'ws'],
    });
    vi.advanceTimersByTime(interval);
    await refreshCalendarSyncStatus(client, 'ws');
    expect(sync).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(interval);
    await refreshCalendarSyncStatus(client, 'ws');
    expect(sync).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(interval * 2);
    await refreshCalendarSyncStatus(client, 'ws');
    expect(sync).toHaveBeenCalledTimes(2);
  });
  it('handles network failures quietly and respects provider retry-after', async () => {
    sync.mockRejectedValueOnce(new Error('Network unavailable'));
    await expect(
      refreshCalendarSyncStatus(client, 'ws')
    ).resolves.toBeDefined();
    vi.advanceTimersByTime(interval * 2);
    sync.mockResolvedValueOnce({ ok: false, retryAfterSeconds: 3600 });
    await refreshCalendarSyncStatus(client, 'ws');
    vi.advanceTimersByTime(interval * 7);
    await refreshCalendarSyncStatus(client, 'ws');
    expect(sync).toHaveBeenCalledTimes(2);
  });
  it('does not sync while hidden or offline', async () => {
    focusManager.setFocused(false);
    await refreshCalendarSyncStatus(client, 'ws');
    focusManager.setFocused(true);
    onlineManager.setOnline(false);
    await refreshCalendarSyncStatus(client, 'ws');
    expect(sync).not.toHaveBeenCalled();
  });
});

it('polls while open and catches up on focus and reconnect without a manual click', async () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    () => useQuery(calendarSyncStatusQueryOptions(client, 'ws')),
    { wrapper }
  );
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(sync).toHaveBeenCalledTimes(1);
  await act(() => vi.advanceTimersByTimeAsync(interval));
  expect(sync).toHaveBeenCalledTimes(2);
  act(() => focusManager.setFocused(false));
  await act(() => vi.advanceTimersByTimeAsync(interval * 2));
  expect(sync).toHaveBeenCalledTimes(2);
  await act(async () => {
    focusManager.setFocused(true);
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(sync).toHaveBeenCalledTimes(3);
  act(() => onlineManager.setOnline(false));
  await act(() => vi.advanceTimersByTimeAsync(interval * 2));
  expect(sync).toHaveBeenCalledTimes(3);
  await act(async () => {
    onlineManager.setOnline(true);
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(sync).toHaveBeenCalledTimes(4);
  view.unmount();
  await act(() => vi.advanceTimersByTimeAsync(interval * 2));
  expect(sync).toHaveBeenCalledTimes(4);
});
