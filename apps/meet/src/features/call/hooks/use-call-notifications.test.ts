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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it.each([false, true])(
  'plays unlocked sounds and respects mute (legacy WebKit: %s)',
  (legacy) => {
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
      ({ state }) => useCallNotifications(state, true, true, open, null),
      { initialProps: { state: initial } }
    );
    act(() => document.dispatchEvent(new Event('pointerdown')));
    const peer = {
      userId: 'peer',
      displayName: 'Peer',
    } as MeetRealtimePresence;
    rerender({ state: { ...initial, participants: { peer } } });
    expect(mocks.info).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
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
    expect(start).toHaveBeenCalledTimes(1);
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
