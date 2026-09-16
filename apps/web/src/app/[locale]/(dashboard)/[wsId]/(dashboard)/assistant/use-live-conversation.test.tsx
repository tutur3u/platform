import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useLiveConversation } from './use-live-conversation';

const state = vi.hoisted(() => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const client = {
    seedConversation: vi.fn(),
    on(event: string, callback: (...args: unknown[]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(callback);
      return client;
    },
    off(event: string, callback: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(callback);
      return client;
    },
  };
  return { client, listeners, connected: false };
});
vi.mock('@/hooks/use-live-api', () => ({ useLiveAPIContext: () => state }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
beforeEach(() => {
  state.listeners.clear();
  state.connected = false;
  state.client.seedConversation.mockClear();
});

it('seeds existing context and emits one ended notice after disconnect plus unmount', () => {
  const onChange = vi.fn();
  const { rerender, unmount } = renderHook(() =>
    useLiveConversation(onChange, [
      {
        id: 'old',
        role: 'user',
        parts: [{ type: 'text', text: 'Plan my launch' }],
      },
    ])
  );
  state.connected = true;
  rerender();
  expect(state.client.seedConversation).toHaveBeenCalledOnce();
  expect(JSON.stringify(state.client.seedConversation.mock.calls)).toContain(
    'Plan my launch'
  );
  expect(JSON.stringify(onChange.mock.lastCall)).toContain('timeline_started');
  act(() => {
    state.listeners.get('close')?.forEach((callback) => {
      callback();
    });
  });
  unmount();
  const messages = onChange.mock.lastCall?.[0];
  expect(
    messages
      .flatMap(
        (message: { parts: { type: string; data?: { status: string } }[] }) =>
          message.parts
      )
      .filter(
        (part: { data?: { status: string } }) => part.data?.status === 'ended'
      )
  ).toHaveLength(1);
});

it('records intentional disconnect and reconnect even without a socket close event', () => {
  const onChange = vi.fn();
  const { rerender, unmount } = renderHook(() => useLiveConversation(onChange));
  state.connected = true;
  rerender();
  state.connected = false;
  rerender();
  state.connected = true;
  rerender();
  const statuses = onChange.mock.lastCall?.[0]
    .flatMap((message: { parts: { data?: { status: string } }[] }) =>
      message.parts.map((part) => part.data?.status)
    )
    .filter(Boolean);
  expect(statuses).toEqual(['started', 'ended', 'started']);
  unmount();
});

it('keeps background tools pending when speech is interrupted', () => {
  const onChange = vi.fn();
  state.connected = true;
  const { unmount } = renderHook(() => useLiveConversation(onChange));
  act(() => {
    state.listeners.get('toolcall')?.forEach((callback) => {
      callback({
        functionCalls: [{ id: 'read', name: 'get_my_tasks', args: {} }],
      });
    });
    state.listeners.get('interrupted')?.forEach((callback) => {
      callback();
    });
  });
  const tools = onChange.mock.lastCall?.[0]
    .flatMap(
      (message: { parts: { type: string; state?: string }[] }) => message.parts
    )
    .filter((part: { type: string }) => part.type === 'dynamic-tool');
  expect(tools).toEqual([
    expect.objectContaining({ state: 'input-available' }),
  ]);
  unmount();
});
