/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTIFICATION_REFRESH_INTERVAL_MS } from '../notification-subscription';
import {
  __resetNotificationSubscriptionRegistryForTests,
  useInfiniteNotifications,
  useNotificationSubscription,
} from '../use-notifications';

const createRealtimeClient = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/supabase/next/realtime-browser', () => ({
  createRealtimeClient,
}));

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe('notification API refresh subscriptions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });
  afterEach(() => {
    __resetNotificationSubscriptionRegistryForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps closed inbox requests lazy', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const client = new QueryClient();
    const hook = renderHook(
      () => useInfiniteNotifications({ enabled: false, unreadOnly: true }),
      { wrapper: wrapper(client) }
    );
    expect(fetch).not.toHaveBeenCalled();
    hook.unmount();
    client.clear();
  });

  it('shares one refresh per user and query client without opening a denied realtime channel', () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const first = renderHook(
      () => useNotificationSubscription(null, 'user-1'),
      { wrapper: wrapper(client) }
    );
    const second = renderHook(
      () => useNotificationSubscription('workspace', 'user-1'),
      { wrapper: wrapper(client) }
    );

    act(() => vi.advanceTimersByTime(NOTIFICATION_REFRESH_INTERVAL_MS));
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notifications'] });
    expect(createRealtimeClient).not.toHaveBeenCalled();
    first.unmount();
    act(() => vi.advanceTimersByTime(NOTIFICATION_REFRESH_INTERVAL_MS));
    expect(invalidate).toHaveBeenCalledTimes(2);
    second.unmount();
    act(() => vi.advanceTimersByTime(NOTIFICATION_REFRESH_INTERVAL_MS));
    expect(invalidate).toHaveBeenCalledTimes(2);
    client.clear();
  });

  it('refreshes every mounted query client and removes unmounted clients', () => {
    const a = new QueryClient();
    const b = new QueryClient();
    const invalidateA = vi.spyOn(a, 'invalidateQueries');
    const invalidateB = vi.spyOn(b, 'invalidateQueries');
    const first = renderHook(
      () => useNotificationSubscription(null, 'user-1'),
      { wrapper: wrapper(a) }
    );
    const second = renderHook(
      () => useNotificationSubscription(null, 'user-1'),
      { wrapper: wrapper(b) }
    );
    act(() => vi.advanceTimersByTime(NOTIFICATION_REFRESH_INTERVAL_MS));
    expect(invalidateA).toHaveBeenCalledTimes(1);
    expect(invalidateB).toHaveBeenCalledTimes(1);
    first.unmount();
    act(() => vi.advanceTimersByTime(NOTIFICATION_REFRESH_INTERVAL_MS));
    expect(invalidateA).toHaveBeenCalledTimes(1);
    expect(invalidateB).toHaveBeenCalledTimes(2);
    second.unmount();
    a.clear();
    b.clear();
  });

  it('pauses hidden tabs and refreshes when they become visible', () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const hook = renderHook(() => useNotificationSubscription(null, 'user-1'), {
      wrapper: wrapper(client),
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    act(() => vi.advanceTimersByTime(NOTIFICATION_REFRESH_INTERVAL_MS * 3));
    expect(invalidate).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(invalidate).toHaveBeenCalledTimes(1);
    hook.unmount();
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(invalidate).toHaveBeenCalledTimes(1);
    client.clear();
  });

  it('does not refresh without an actor and cleans up when signing out', () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const hook = renderHook(
      ({ user }) => useNotificationSubscription(null, user),
      {
        initialProps: { user: '' },
        wrapper: wrapper(client),
      }
    );
    act(() => vi.advanceTimersByTime(NOTIFICATION_REFRESH_INTERVAL_MS));
    expect(invalidate).not.toHaveBeenCalled();
    hook.rerender({ user: 'user-1' });
    act(() => vi.advanceTimersByTime(NOTIFICATION_REFRESH_INTERVAL_MS));
    expect(invalidate).toHaveBeenCalledTimes(1);
    hook.rerender({ user: '' });
    act(() => vi.advanceTimersByTime(NOTIFICATION_REFRESH_INTERVAL_MS));
    expect(invalidate).toHaveBeenCalledTimes(1);
    hook.unmount();
    client.clear();
  });
});
