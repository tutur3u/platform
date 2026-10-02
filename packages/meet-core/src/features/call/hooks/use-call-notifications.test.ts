// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ info: vi.fn(), dismiss: vi.fn() }));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: mocks }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { type CallState, INITIAL_CALL_STATE } from '../lib/call-state';
import { useCallNotifications } from './use-call-notifications';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it.each([
  [false, false],
  [true, false],
  [false, true],
])(
  'plays unlocked sounds and respects mute (legacy WebKit: %s, shared audio: %s)',
  (legacy, suppressed) => {
    const start = vi.fn();
    class Audio {
      state = 'running';
      currentTime = 1;
      destination = {};
      resume = () => Promise.resolve();
      close = () => Promise.resolve();
      createOscillator = () => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        frequency: { setValueAtTime: vi.fn() },
        start,
        stop: vi.fn(),
      });
      createGain = () => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
      });
    }
    vi.stubGlobal('AudioContext', legacy ? undefined : Audio);
    vi.stubGlobal('webkitAudioContext', legacy ? Audio : undefined);
    const now = vi.spyOn(Date, 'now').mockReturnValue(10000);
    const initial: CallState = {
      ...INITIAL_CALL_STATE,
      admission: 'admitted',
      role: 'host',
      selfUserId: 'self',
    };
    const open = vi.fn();
    const { result, rerender } = renderHook(
      ({ state }) =>
        useCallNotifications(state, true, true, open, null, suppressed),
      { initialProps: { state: initial } }
    );
    act(() => document.dispatchEvent(new Event('pointerdown')));
    const peer = {
      userId: 'peer',
      displayName: 'Peer',
    } as MeetRealtimePresence;
    rerender({ state: { ...initial, participants: { peer } } });
    expect(mocks.info).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(suppressed ? 0 : 1);
    expect(mocks.info.mock.calls.at(-1)?.[1].id).toBeUndefined();
    act(() => result.current.toggleSound());
    now.mockReturnValue(13000);
    rerender({
      state: {
        ...initial,
        participants: { peer },
        stage: { ...initial.stage, raisedHandUserIds: ['peer'] },
      },
    });
    expect(mocks.info).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenCalledTimes(suppressed ? 0 : 1);
    act(() => mocks.info.mock.calls[1]![1].action.onClick());
    expect(open).toHaveBeenCalledWith('participants');
    rerender({
      state: {
        ...initial,
        participants: {
          peer,
          ...Object.fromEntries(
            [1, 2, 3, 4].map((n) => [
              `peer-${n}`,
              { ...peer, userId: `peer-${n}` },
            ])
          ),
        },
      },
    });
    expect(mocks.info).toHaveBeenCalledTimes(6);
  }
);

it('suppresses chat toasts in the open panel without replaying them on close', () => {
  const initial: CallState = {
    ...INITIAL_CALL_STATE,
    admission: 'admitted',
    role: 'host',
    selfUserId: 'self',
  };
  const open = vi.fn();
  const { rerender } = renderHook(
    ({ state, panel }: { state: CallState; panel: 'chat' | null }) =>
      useCallNotifications(state, true, true, open, panel),
    { initialProps: { state: initial, panel: 'chat' as 'chat' | null } }
  );
  const message = {
    id: 'one',
    body: 'Visible in chat',
    userId: 'peer',
    displayName: 'Peer',
    createdAt: '',
  };
  const next = { ...initial, chat: [message] };
  rerender({ state: next, panel: 'chat' });
  expect(mocks.info).not.toHaveBeenCalled();
  rerender({ state: next, panel: null });
  expect(mocks.info).not.toHaveBeenCalled();
  rerender({
    state: { ...next, chat: [...next.chat, { ...message, id: 'two' }] },
    panel: null,
  });
  expect(mocks.info).toHaveBeenCalledTimes(1);
  rerender({ state: next, panel: 'chat' });
  expect(mocks.dismiss).toHaveBeenCalledWith('chat:two');
});

it('replays hidden notices once when visibility returns without a room update', () => {
  let visibility = 'hidden';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
    () => visibility as DocumentVisibilityState
  );
  const initial: CallState = {
    ...INITIAL_CALL_STATE,
    admission: 'admitted',
    role: 'host',
    selfUserId: 'self',
  };
  const open = vi.fn();
  const { rerender } = renderHook(
    ({ state }) => useCallNotifications(state, true, true, open, null),
    { initialProps: { state: initial } }
  );
  rerender({
    state: {
      ...initial,
      chat: [
        {
          id: 'hidden',
          body: 'Waiting',
          userId: 'peer',
          displayName: 'Peer',
          createdAt: '',
        },
      ],
    },
  });
  expect(mocks.info).not.toHaveBeenCalled();
  visibility = 'visible';
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(mocks.info).toHaveBeenCalledOnce();
  expect(mocks.info.mock.calls[0]![1].id).toBe('chat:hidden');
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(mocks.info).toHaveBeenCalledOnce();
});

it('bounds hidden notices and discards them when the room disconnects', () => {
  let visibility = 'hidden';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
    () => visibility as DocumentVisibilityState
  );
  const initial: CallState = {
    ...INITIAL_CALL_STATE,
    admission: 'admitted',
    role: 'host',
    selfUserId: 'self',
  };
  const open = vi.fn();
  const { rerender } = renderHook(
    ({ state, connected }) =>
      useCallNotifications(state, true, connected, open, null),
    { initialProps: { state: initial, connected: true } }
  );
  const crowded = {
    ...initial,
    chat: Array.from({ length: 55 }, (_, n) => ({
      id: `${n}`,
      body: 'Hidden',
      userId: 'peer',
      displayName: 'Peer',
      createdAt: '',
    })),
  };
  rerender({ state: crowded, connected: true });
  visibility = 'visible';
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(mocks.info).toHaveBeenCalledTimes(50);
  expect(mocks.info.mock.calls[0]![1].id).toBe('chat:5');
  mocks.info.mockClear();
  visibility = 'hidden';
  rerender({
    state: {
      ...crowded,
      chat: [...crowded.chat, { ...crowded.chat[0]!, id: 'later' }],
    },
    connected: true,
  });
  rerender({ state: crowded, connected: false });
  visibility = 'visible';
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(mocks.info).not.toHaveBeenCalled();
});

it('drops queued host requests if host authority is lost while hidden', () => {
  let visibility = 'hidden';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
    () => visibility as DocumentVisibilityState
  );
  const initial: CallState = {
    ...INITIAL_CALL_STATE,
    admission: 'admitted',
    role: 'host',
    selfUserId: 'self',
  };
  const open = vi.fn();
  const { rerender } = renderHook(
    ({ state }) => useCallNotifications(state, true, true, open, null),
    { initialProps: { state: initial } }
  );
  const waiting = [{ userId: 'request', displayName: 'Request' }];
  rerender({ state: { ...initial, waiting } });
  rerender({ state: { ...initial, waiting, role: 'viewer' } });
  visibility = 'visible';
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(mocks.info).not.toHaveBeenCalled();
});
