/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetNotificationSubscriptionRegistryForTests,
  UNREAD_COUNT_FALLBACK_INTERVAL_MS,
  useInfiniteNotifications,
  useNotificationSubscription,
  useUnreadCount,
} from '../use-notifications';

type RealtimePayload = {
  new?: {
    data?: {
      action_taken?: boolean;
    };
  };
};

const {
  channelMock,
  createRealtimeClientMock,
  postgresCallbacks,
  removeChannelMock,
  subscribeMock,
} = vi.hoisted(() => {
  const postgresCallbacks: Array<(payload: RealtimePayload) => void> = [];
  const removeChannelMock = vi.fn();
  const subscribeMock = vi.fn();
  const channel = {
    on: vi.fn(
      (
        type: string,
        _config: Record<string, unknown>,
        callback: (payload: RealtimePayload) => void
      ) => {
        if (type === 'postgres_changes') {
          postgresCallbacks.push(callback);
        }

        return channel;
      }
    ),
    subscribe: subscribeMock,
  };

  const channelMock = vi.fn(() => channel);

  subscribeMock.mockReturnValue(channel);

  return {
    channelMock,
    createRealtimeClientMock: vi.fn(() => ({
      channel: channelMock,
      removeChannel: removeChannelMock,
    })),
    postgresCallbacks,
    removeChannelMock,
    subscribeMock,
  };
});

vi.mock('@tuturuuu/supabase/next/realtime-browser', () => ({
  createRealtimeClient: createRealtimeClientMock,
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('useNotificationSubscription', () => {
  beforeEach(() => {
    channelMock.mockClear();
    createRealtimeClientMock.mockClear();
    postgresCallbacks.length = 0;
    removeChannelMock.mockClear();
    subscribeMock.mockClear();
  });

  afterEach(() => {
    __resetNotificationSubscriptionRegistryForTests();
    vi.unstubAllGlobals();
  });

  it('defers notification list requests until the consumer enables them', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = createQueryClient();

    renderHook(
      () =>
        useInfiniteNotifications({
          enabled: false,
          unreadOnly: true,
        }),
      { wrapper: createWrapper(queryClient) }
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses realtime-first unread counts with a low-frequency fallback', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = createQueryClient();

    renderHook(() => useUnreadCount(undefined, { enabled: false }), {
      wrapper: createWrapper(queryClient),
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(UNREAD_COUNT_FALLBACK_INTERVAL_MS).toBe(5 * 60 * 1000);
  });

  it('shares one realtime channel across multiple consumers for the same user', async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    const first = renderHook(
      () => useNotificationSubscription(null, 'user-1'),
      { wrapper }
    );
    const second = renderHook(
      () => useNotificationSubscription('workspace-1', 'user-1'),
      { wrapper }
    );

    await waitFor(() => {
      expect(channelMock).toHaveBeenCalledTimes(1);
      expect(subscribeMock).toHaveBeenCalledTimes(1);
    });

    first.unmount();

    expect(removeChannelMock).not.toHaveBeenCalled();

    second.unmount();

    expect(removeChannelMock).toHaveBeenCalledTimes(1);
  });

  it('invalidates every mounted query client from the shared subscription', async () => {
    const firstQueryClient = createQueryClient();
    const secondQueryClient = createQueryClient();
    const firstInvalidate = vi.spyOn(firstQueryClient, 'invalidateQueries');
    const secondInvalidate = vi.spyOn(secondQueryClient, 'invalidateQueries');

    const first = renderHook(
      () => useNotificationSubscription(null, 'user-1'),
      { wrapper: createWrapper(firstQueryClient) }
    );
    const second = renderHook(
      () => useNotificationSubscription('workspace-1', 'user-1'),
      { wrapper: createWrapper(secondQueryClient) }
    );

    await waitFor(() => {
      expect(postgresCallbacks).toHaveLength(3);
    });

    postgresCallbacks[0]?.({});

    expect(firstInvalidate).toHaveBeenCalledWith({
      queryKey: ['notifications'],
    });
    expect(firstInvalidate).toHaveBeenCalledWith({
      queryKey: ['notifications', 'unread-count'],
    });
    expect(secondInvalidate).toHaveBeenCalledWith({
      queryKey: ['notifications'],
    });
    expect(secondInvalidate).toHaveBeenCalledWith({
      queryKey: ['notifications', 'unread-count'],
    });

    first.unmount();
    second.unmount();
  });
});
