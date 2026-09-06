import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { EventEmitter } from 'eventemitter3';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  read: vi.fn(),
  store: vi.fn(),
  remove: vi.fn(),
  report: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  readLiveSessionHandle: mocks.read,
  storeLiveSessionHandle: mocks.store,
  deleteLiveSessionHandle: mocks.remove,
  reportLiveUsage: mocks.report,
}));
vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/(dashboard)/assistant/audio/multimodal-live-client',
  () => ({
    MultimodalLiveClient: class extends EventEmitter {
      ws: object | null = null;
      async connect(config: unknown) {
        await mocks.connect(config);
        this.ws = {};
        return true;
      }
      disconnect() {
        this.ws = null;
      }
      sendToolResponse() {}
    },
  })
);
vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/(dashboard)/assistant/audio/utils',
  () => ({ audioContext: () => new Promise(() => {}) })
);

import { useLiveAPI } from './use-live-api';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      {children}
    </QueryClientProvider>
  );
}
describe('live connection recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.connect.mockResolvedValue(true);
    mocks.read.mockResolvedValue({ sessionHandle: null });
    mocks.store.mockResolvedValue({});
    mocks.remove.mockResolvedValue({});
    mocks.report.mockResolvedValue({ remainingReservedCredits: 1000 });
  });
  afterEach(() => vi.useRealTimers());
  const options = {
    apiKey: 'ephemeral',
    wsId: 'workspace-a',
    scopeKey: 'assistant:web-dashboard',
  };
  it('does not resume a previous billing reservation from persisted storage', async () => {
    mocks.read.mockResolvedValue({ sessionHandle: 'previous-reservation' });
    const { result } = renderHook(
      () => useLiveAPI({ ...options, liveSessionId: 'new-reservation' }),
      { wrapper }
    );
    await act(async () => result.current.connect());
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.connect).toHaveBeenCalledWith({
      model: 'gemini-3.1-flash-live-preview',
    });
  });
  it('recovers using the last resumable handle', async () => {
    const { result } = renderHook(() => useLiveAPI(options), { wrapper });
    await act(async () => result.current.connect());
    act(() => {
      result.current.client.emit('sessionresumptionupdate', {
        resumable: true,
        newHandle: 'resume-1',
      });
      result.current.client.emit('close', { reason: 'network' });
    });
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(mocks.connect).toHaveBeenLastCalledWith(
      expect.objectContaining({ sessionResumption: { handle: 'resume-1' } })
    );
    expect(result.current.connectionStatus).toBe('connected');
  });
  it('never reconnects after explicit disconnect during backoff', async () => {
    const { result } = renderHook(() => useLiveAPI(options), { wrapper });
    await act(async () => result.current.connect());
    act(() => {
      result.current.client.emit('sessionresumptionupdate', {
        resumable: true,
        newHandle: 'resume-2',
      });
      result.current.client.emit('close', { reason: 'network' });
    });
    await act(async () => result.current.disconnect());
    await act(async () => vi.advanceTimersByTimeAsync(10000));
    expect(mocks.connect).toHaveBeenCalledOnce();
    expect(result.current.connectionStatus).toBe('disconnected');
  });
  it('bounds failed reconnections even when attempts do not emit close', async () => {
    const { result } = renderHook(() => useLiveAPI(options), { wrapper });
    await act(async () => result.current.connect());
    mocks.connect.mockRejectedValue(new Error('offline'));
    act(() => {
      result.current.client.emit('sessionresumptionupdate', {
        resumable: true,
        newHandle: 'resume-3',
      });
      result.current.client.emit('close', { reason: 'network' });
    });
    await act(async () => vi.advanceTimersByTimeAsync(10000));
    expect(mocks.connect).toHaveBeenCalledTimes(4);
    expect(result.current.connectionStatus).toBe('disconnected');
  });
});
