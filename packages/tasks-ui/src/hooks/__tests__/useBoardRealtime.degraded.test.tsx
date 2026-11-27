/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createRealtimeClient } from '@tuturuuu/internal-api/realtime';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBoardRealtime } from '../useBoardRealtime';

const { toastMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/realtime', () => ({
  createRealtimeClient: vi.fn(),
}));

vi.mock('@tuturuuu/utils/constants', () => ({
  DEV_MODE: false,
}));

vi.mock('@tuturuuu/ui/hooks/use-toast', () => ({
  toast: toastMock,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('useBoardRealtime degraded state', () => {
  let queryClient: QueryClient;
  let subscribeCallback: ((status: string, err?: unknown) => void) | undefined;

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    toastMock.mockReset();
    subscribeCallback = undefined;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const mockChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((cb: (status: string, err?: unknown) => void) => {
        subscribeCallback = cb;
        return mockChannel;
      }),
      send: vi.fn().mockResolvedValue('ok'),
    };

    vi.mocked(createRealtimeClient).mockReturnValue({
      channel: vi.fn().mockReturnValue(mockChannel),
      removeChannel: vi.fn(),
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('marks realtime degraded on CHANNEL_ERROR and TIMED_OUT and recovers on SUBSCRIBED', () => {
    const { result } = renderHook(() => useBoardRealtime('board-1'), {
      wrapper,
    });

    expect(result.current.isDegraded).toBe(false);

    act(() => {
      subscribeCallback?.('CHANNEL_ERROR', new Error('Realtime unavailable'));
    });
    expect(result.current.isDegraded).toBe(true);

    act(() => {
      subscribeCallback?.('SUBSCRIBED');
    });
    expect(result.current.isDegraded).toBe(false);

    act(() => {
      subscribeCallback?.('TIMED_OUT');
    });
    expect(result.current.isDegraded).toBe(true);
  });

  it('clears degraded state when the hook is disabled or boardId becomes empty', () => {
    const { result, rerender } = renderHook(
      ({ boardId, enabled }: { boardId: string; enabled: boolean }) =>
        useBoardRealtime(boardId, { enabled }),
      {
        initialProps: { boardId: 'board-1', enabled: true },
        wrapper,
      }
    );

    act(() => {
      subscribeCallback?.('CHANNEL_ERROR', new Error('Realtime unavailable'));
    });
    expect(result.current.isDegraded).toBe(true);

    rerender({ boardId: 'board-1', enabled: false });
    expect(result.current.isDegraded).toBe(false);

    rerender({ boardId: 'board-1', enabled: true });
    act(() => {
      subscribeCallback?.('CHANNEL_ERROR', new Error('Realtime unavailable'));
    });
    expect(result.current.isDegraded).toBe(true);

    rerender({ boardId: '', enabled: true });
    expect(result.current.isDegraded).toBe(false);
  });
});
