// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: mocks }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { type CallState, INITIAL_CALL_STATE } from '../lib/call-state';
import { useCallNotifications } from './use-call-notifications';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it('plays unlocked notification sounds and respects the sound toggle', () => {
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
  vi.stubGlobal('AudioContext', Audio);
  const initial: CallState = {
    ...INITIAL_CALL_STATE,
    admission: 'admitted',
    role: 'host',
    selfUserId: 'self',
  };
  const open = vi.fn();
  const { result, rerender } = renderHook(
    ({ state }) => useCallNotifications(state, true, true, open),
    { initialProps: { state: initial } }
  );
  act(() => document.dispatchEvent(new Event('pointerdown')));
  const peer = { userId: 'peer', displayName: 'Peer' } as MeetRealtimePresence;
  rerender({ state: { ...initial, participants: { peer } } });
  expect(mocks.info).toHaveBeenCalledTimes(1);
  expect(start).toHaveBeenCalledTimes(1);
  act(() => result.current.toggleSound());
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
});
