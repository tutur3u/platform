// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { afterEach, expect, it, vi } from 'vitest';
import { INITIAL_CALL_STATE } from '../lib/call-state';
import type { MeetRoomController } from '../lib/room-controller';
import { useSharedRoomAudio } from './use-shared-room-audio';

const monitor = vi.hoisted(() => ({
  report: undefined as undefined | ((peer: { userId: string }) => void),
  stop: vi.fn(),
}));
vi.mock('../lib/audio-overlap-monitor', () => ({
  AudioOverlapMonitor: class {
    constructor(report: typeof monitor.report) {
      monitor.report = report;
    }
    start() {}
    update() {}
    stop() {
      monitor.stop();
    }
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function fixture(duplicate = false) {
  const mic = { id: 'mic', enabled: true, readyState: 'live' };
  const peer = {
    userId: 'peer',
    accountId: duplicate ? 'me' : 'other',
    displayName: 'Linh',
    joinedAt: '2026-09-15T10:00:00Z',
    media: { audioEnabled: true },
  } as MeetRealtimePresence;
  const self = {
    ...peer,
    userId: 'self',
    accountId: 'me',
    joinedAt: '2026-09-15T10:01:00Z',
  };
  const room = {
    localStream: { getAudioTracks: () => [mic] },
    media: { audioEnabled: true },
    remoteMedia: {},
    connectionStatus: 'open',
    state: {
      ...INITIAL_CALL_STATE,
      selfUserId: 'self',
      participants: { self, peer },
    },
    muteMicrophone: vi.fn(async () => {
      mic.enabled = false;
      room.media.audioEnabled = false;
    }),
    unmuteMicrophone: vi.fn(async () => {
      mic.enabled = true;
      room.media.audioEnabled = true;
    }),
  } as unknown as MeetRoomController;
  return { room, mic };
}
it('pauses an existing account’s second device before the join requests a microphone', () => {
  const { room, mic } = fixture(true);
  const { result } = renderHook(() => useSharedRoomAudio(room, false));
  act(() => {
    expect(result.current.prepareJoin(true)).toBe(false);
  });
  expect(mic.enabled).toBe(false);
  expect(result.current.mode).toBe('protected');
  expect(result.current.reason).toBe('another-device');
  expect(result.current.open).toBe(true);
  expect(room.unmuteMicrophone).not.toHaveBeenCalled();
});
it('mutes before suggesting, and closing the suggestion never unmutes', async () => {
  const { room, mic } = fixture();
  const { result } = renderHook(() => useSharedRoomAudio(room));
  act(() => monitor.report?.({ userId: 'peer' }));
  expect(mic.enabled).toBe(false);
  expect(result.current.microphonePaused).toBe(true);
  expect(result.current.shared).toBe(false);
  act(() => result.current.setOpen(false));
  expect(mic.enabled).toBe(false);
  await act(() => result.current.share());
  expect(result.current.shared).toBe(true);
  await act(() => result.current.useOwnMicrophone());
  expect(result.current.mode).toBe('own');
  expect(mic.enabled).toBe(true);
  expect(room.unmuteMicrophone).toHaveBeenCalledOnce();
});
it('respects explicit same-account override and keeps the primary device active', async () => {
  const { room, mic } = fixture(true);
  const { result, rerender } = renderHook(() => useSharedRoomAudio(room));
  expect(result.current.mode).toBe('protected');
  await act(() => result.current.useOwnMicrophone());
  rerender();
  expect(result.current.mode).toBe('own');
  expect(mic.enabled).toBe(true);
});
it('keeps replacement tracks muted and restores playback when the shared peer leaves', async () => {
  const { room } = fixture();
  const { result, rerender } = renderHook(
    ({ value }) => useSharedRoomAudio(value),
    { initialProps: { value: room } }
  );
  act(() => monitor.report?.({ userId: 'peer' }));
  await act(() => result.current.share());
  const replacement = { enabled: true };
  rerender({
    value: {
      ...room,
      localStream: {
        getAudioTracks: () => [replacement],
      } as unknown as MediaStream,
    },
  });
  expect(replacement.enabled).toBe(false);
  rerender({
    value: {
      ...room,
      state: {
        ...room.state,
        participants: { self: room.state.participants.self! },
      },
    },
  });
  expect(result.current.shared).toBe(false);
  expect(result.current.mode).toBe('protected');
  expect(result.current.reason).toBe('disconnected');
});
it('keeps capture disabled if signaling fails', async () => {
  const { room, mic } = fixture();
  room.muteMicrophone = vi.fn(async () => {
    throw new Error('offline');
  });
  const { result } = renderHook(() => useSharedRoomAudio(room));
  await act(async () => {
    await expect(result.current.share()).rejects.toThrow('offline');
  });
  expect(mic.enabled).toBe(false);
  expect(result.current.shared).toBe(true);
});
