import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useBoardRealtime } from '../useBoardRealtime';

const realtime = vi.hoisted(() => ({
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/realtime', () => ({
  createRealtimeClient: () => realtime,
}));
vi.mock('@tuturuuu/utils/constants', () => ({ DEV_MODE: false }));
vi.mock('@tuturuuu/ui/hooks/use-toast', () => ({ toast: vi.fn() }));
const translate = (key: string) => key;
vi.mock('next-intl', () => ({ useTranslations: () => translate }));
const channels: Array<{ topic: string; send: ReturnType<typeof vi.fn> }> = [];
const locals: Array<{ name: string; postMessage: ReturnType<typeof vi.fn> }> =
  [];
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);
beforeEach(() => {
  vi.useFakeTimers();
  channels.length = 0;
  locals.length = 0;
  vi.clearAllMocks();
  vi.stubGlobal(
    'BroadcastChannel',
    class {
      postMessage = vi.fn();
      close = vi.fn();
      onmessage = null;
      constructor(public name: string) {
        locals.push(this);
      }
    }
  );
  realtime.channel.mockImplementation((topic: string) => {
    const channel = { topic, send: vi.fn(), on: vi.fn(), subscribe: vi.fn() };
    channel.on.mockReturnValue(channel);
    channel.subscribe.mockReturnValue(channel);
    channels.push(channel);
    return channel;
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('sends new-board descriptions only to the new board after navigation', () => {
  const { result, rerender } = renderHook(
    ({ boardId }) => useBoardRealtime(boardId),
    { initialProps: { boardId: 'old-board' }, wrapper }
  );
  rerender({ boardId: 'private-board' });
  act(() => {
    result.current.broadcast('task:upsert', {
      task: { id: 'private-task', description: 'Private description' },
    });
    vi.advanceTimersByTime(50);
  });
  expect(channels[0]?.send).not.toHaveBeenCalled();
  expect(channels.at(-1)?.topic).toBe('board-realtime-private-board');
  expect(channels.at(-1)?.send).toHaveBeenCalledOnce();
});
it('discards buffered old-board payloads on navigation across both transports', () => {
  const { result, rerender } = renderHook(
    ({ boardId }) => useBoardRealtime(boardId),
    { initialProps: { boardId: 'old-board' }, wrapper }
  );
  act(() =>
    result.current.broadcast('task:upsert', {
      task: { id: 'old-task', description: 'Old description' },
    })
  );
  rerender({ boardId: 'private-board' });
  act(() => vi.advanceTimersByTime(50));
  expect(
    channels.every((channel) => channel.send.mock.calls.length === 0)
  ).toBe(true);
  expect(
    locals.every((channel) => channel.postMessage.mock.calls.length === 0)
  ).toBe(true);
});
it('does not let a retained old callback publish into the next board', () => {
  const { result, rerender } = renderHook(
    ({ boardId }) => useBoardRealtime(boardId),
    { initialProps: { boardId: 'old-board' }, wrapper }
  );
  const oldBroadcast = result.current.broadcast;
  rerender({ boardId: 'private-board' });
  act(() => {
    oldBroadcast('task:upsert', { task: { id: 'old-task' } });
    vi.advanceTimersByTime(50);
  });
  expect(
    channels.every((channel) => channel.send.mock.calls.length === 0)
  ).toBe(true);
  expect(
    locals.every((channel) => channel.postMessage.mock.calls.length === 0)
  ).toBe(true);
});
it('preserves same-board StrictMode subscription reuse', () => {
  const strictWrapper = ({ children }: { children: ReactNode }) => (
    <StrictMode>{wrapper({ children })}</StrictMode>
  );
  const { result } = renderHook(() => useBoardRealtime('same-board'), {
    wrapper: strictWrapper,
  });
  act(() => {
    result.current.broadcast('task:upsert', { task: { id: 'task' } });
    vi.advanceTimersByTime(50);
  });
  expect(realtime.channel).toHaveBeenCalledTimes(1);
  expect(channels[0]?.send).toHaveBeenCalledOnce();
});
