import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimeTracker } from './use-time-tracker';

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const session = {
  id: 'running-session',
  title: 'Work',
  start_time: '2026-08-10T00:00:05.000Z',
  is_running: true,
};

function renderTracker() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  let running = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      let body: unknown = {};
      if (init?.method === 'PATCH') {
        running = false;
        body = {
          session: { ...session, is_running: false, duration_seconds: 5 },
        };
      } else if (url.includes('type=running')) {
        body = { session: running ? session : null };
      } else if (url.includes('type=stats')) {
        body = {
          stats: { todayTime: 0, weekTime: 0, monthTime: 0, streak: 0 },
        };
      }
      return new Response(JSON.stringify(body), { status: 200 });
    })
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useTimeTracker({ wsId: 'workspace-1' }), { wrapper });
}

describe('time tracker timer ownership', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T00:00:10.000Z'));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('cancels the running-session interval on unmount', async () => {
    const { result, unmount } = renderTracker();
    await act(() => result.current.fetchData());
    expect(result.current.elapsedTime).toBe(5);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.elapsedTime).toBe(6);
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('expires the completion celebration after exactly three seconds', async () => {
    const { result } = renderTracker();
    await act(() => result.current.fetchData());
    await act(() => result.current.stopTimer());
    expect(result.current.justCompleted?.id).toBe(session.id);

    await act(() => vi.advanceTimersByTimeAsync(2999));
    expect(result.current.justCompleted?.id).toBe(session.id);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(result.current.justCompleted).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['unmount', 'dismiss'] as const)(
    'cancels the completion timeout on %s before jsdom teardown',
    async (action) => {
      const { result, unmount } = renderTracker();
      await act(() => result.current.fetchData());
      await act(() => result.current.stopTimer());
      expect(result.current.justCompleted?.id).toBe(session.id);
      expect(vi.getTimerCount()).toBe(1);

      if (action === 'unmount') unmount();
      else act(() => result.current.clearJustCompleted());

      expect(vi.getTimerCount()).toBe(0);
      await act(() => vi.advanceTimersByTimeAsync(3000));
    }
  );
});
