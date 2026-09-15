// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { MeetRoomController } from '../lib/room-controller';
import { useSharedRoomAudio } from './use-shared-room-audio';

afterEach(cleanup);
it('consolidates a secondary microphone without touching camera tracks, and never unmutes on exit', async () => {
  const mic = { enabled: true };
  const camera = { enabled: true };
  const toggleMicrophone = vi.fn(async () => undefined);
  const room = {
    localStream: { getAudioTracks: () => [mic] },
    media: { audioEnabled: true },
    toggleMicrophone,
  } as unknown as MeetRoomController;
  const { result } = renderHook(() => useSharedRoomAudio(room));
  await act(() => result.current.toggle());
  expect(result.current.shared).toBe(true);
  expect(mic.enabled).toBe(false);
  expect(camera.enabled).toBe(true);
  await act(() => result.current.toggle());
  expect(result.current.shared).toBe(false);
  expect(mic.enabled).toBe(false);
  expect(toggleMicrophone).toHaveBeenCalledOnce();
});
it('keeps replacement tracks muted during reconnection', async () => {
  const initial = { enabled: true };
  const replacement = { enabled: true };
  const room = {
    localStream: { getAudioTracks: () => [initial] },
    media: { audioEnabled: false },
    toggleMicrophone: vi.fn(),
  } as unknown as MeetRoomController;
  const { result, rerender } = renderHook(
    ({ stream }) => useSharedRoomAudio({ ...room, localStream: stream }),
    { initialProps: { stream: room.localStream } }
  );
  await act(() => result.current.toggle());
  rerender({
    stream: { getAudioTracks: () => [replacement] } as unknown as MediaStream,
  });
  expect(replacement.enabled).toBe(false);
});
it('keeps the physical mic muted if signaling fails', async () => {
  const mic = { enabled: true };
  const room = {
    localStream: { getAudioTracks: () => [mic] },
    media: { audioEnabled: true },
    toggleMicrophone: async () => {
      mic.enabled = true;
      throw new Error('offline');
    },
  } as unknown as MeetRoomController;
  const { result } = renderHook(() => useSharedRoomAudio(room));
  await act(async () => {
    await expect(result.current.toggle()).rejects.toThrow('offline');
  });
  expect(mic.enabled).toBe(false);
  expect(result.current.shared).toBe(true);
});
