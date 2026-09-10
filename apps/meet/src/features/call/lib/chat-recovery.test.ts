import { expect, it, vi } from 'vitest';
import { collectCallNotices } from './call-notifications';
import {
  countUnreadChatMessages,
  INITIAL_CALL_STATE,
  reduceCallState,
} from './call-state';
import { createRoomActions } from './room-actions';
import type { MeetSignaling } from './signaling';

it('replayed history does not duplicate, move the newest message, or notify again', () => {
  const message = {
    type: 'chat.message' as const,
    id: 'new',
    userId: 'other',
    displayName: 'Guest',
    body: 'Hello',
    createdAt: '2026-09-10T00:00:00Z',
  };
  const initial = {
    ...INITIAL_CALL_STATE,
    admission: 'admitted' as const,
    selfUserId: 'self',
  };
  const current = reduceCallState(initial, message);
  expect(reduceCallState(current, { ...message, replayed: true })).toBe(
    current
  );
  const restored = reduceCallState(current, {
    ...message,
    id: 'old',
    createdAt: '2026-09-09T00:00:00Z',
    replayed: true,
  });
  expect(restored.chat.map((entry) => entry.id)).toEqual(['old', 'new']);
  expect(collectCallNotices(current, restored)).toEqual([]);
  expect(countUnreadChatMessages(restored.chat, null)).toBe(1);
});
it('a manual retry after a lost receipt keeps the same client identity', async () => {
  vi.useFakeTimers();
  try {
    const request = vi.fn().mockRejectedValue(new Error('signaling_timeout'));
    const actions = createRoomActions({
      current: { request, isClosed: false } as unknown as MeetSignaling,
    });
    const failure = expect(actions.sendChat('Hello')).rejects.toThrow(
      'signaling_timeout'
    );
    await vi.runAllTimersAsync();
    await failure;
    const id = request.mock.calls[0]![0].clientMessageId;
    request.mockResolvedValue({ id: 'saved' });
    await actions.sendChat('Hello');
    expect(request.mock.calls.at(-1)![0].clientMessageId).toBe(id);
    await actions.sendChat('Hello');
    expect(request.mock.calls.at(-1)![0].clientMessageId).not.toBe(id);
  } finally {
    vi.useRealTimers();
  }
});

it('an old replay cannot evict a newer message at the retention limit', () => {
  const chat = Array.from({ length: 500 }, (_, index) => ({
    id: String(index),
    userId: 'other',
    displayName: 'Guest',
    body: 'Message',
    createdAt: new Date(Date.UTC(2026, 8, 10, 0, 0, index)).toISOString(),
  }));
  const restored = reduceCallState(
    { ...INITIAL_CALL_STATE, chat },
    {
      type: 'chat.message',
      id: 'old',
      userId: 'other',
      displayName: 'Guest',
      body: 'Old',
      createdAt: '2026-09-09T00:00:00Z',
      replayed: true,
    }
  );
  expect(restored.chat.map((entry) => entry.id)).toEqual(
    chat.map((entry) => entry.id)
  );
});

it('an old overlapping receipt cannot erase a newer failed-send identity', async () => {
  vi.useFakeTimers();
  try {
    let first!: (value: unknown) => void, second!: (value: unknown) => void;
    const request = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            first = r;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            second = r;
          })
      )
      .mockRejectedValue(new Error('signaling_timeout'));
    const actions = createRoomActions({
      current: { request, isClosed: false } as unknown as MeetSignaling,
    });
    const a = actions.sendChat('Hello'),
      b = actions.sendChat('Hello');
    first({ id: 'saved' });
    await a;
    const failed = expect(actions.sendChat('Hello')).rejects.toThrow(
      'signaling_timeout'
    );
    const nextId = request.mock.calls[2]![0].clientMessageId;
    second({ id: 'saved' });
    await b;
    await vi.runAllTimersAsync();
    await failed;
    request.mockResolvedValue({ id: 'second' });
    await actions.sendChat('Hello');
    expect(request.mock.calls.at(-1)![0].clientMessageId).toBe(nextId);
  } finally {
    vi.useRealTimers();
  }
});
