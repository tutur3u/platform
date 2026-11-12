// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useLiveAssistant } from './use-live-assistant';

const calls = vi.hoisted(() => ({
  control: vi.fn(),
  close: vi.fn(),
  capture: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  controlMeetLive: calls.control,
  reviewMeetLiveTool: vi.fn(),
}));
vi.mock('../call/components/playback-volume', () => ({
  MIRA_VOLUME_ID: 'mira',
  usePlaybackVolume: () => 1,
}));
vi.mock('./audio', () => ({
  LiveAudioPlayer: class {
    setVolume = vi.fn();
    unlock = async () => {};
    close = calls.close;
  },
  captureLiveAudio: calls.capture,
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  [403, 'Meet AI is temporarily unavailable', 'assistant_unavailable'],
  [503, 'Live assistant is unavailable', 'assistant_unavailable'],
  [403, 'Only a room admin can invite the room assistant', 'start_failed'],
  [403, 'Invalid origin', 'start_failed'],
  [503, 'Room action is unavailable', 'start_failed'],
  [500, 'Synthetic internal error', 'start_failed'],
])(
  'handles a synthetic denied room invite: %i %s',
  async (status, message, expected) => {
    calls.control.mockRejectedValue(
      Object.assign(new Error(message), { status })
    );
    const socket = vi.fn();
    vi.stubGlobal('WebSocket', socket);
    const { result } = renderHook(() =>
      useLiveAssistant('synthetic-meeting', '', {
        streams: [],
        microphoneEnabled: false,
      })
    );
    let started: boolean | undefined;
    await act(async () => {
      started = await result.current.start('room', [], '');
    });
    expect(started).toBe(false);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe(expected);
    expect(calls.control).toHaveBeenCalledExactlyOnceWith('synthetic-meeting', {
      action: 'start',
      audioPolicy: 'participant-opt-in',
      mode: 'room',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      workspaceId: undefined,
      voice: 'Aoede',
    });
    expect(calls.close).toHaveBeenCalledOnce();
    expect(calls.capture).not.toHaveBeenCalled();
    expect(socket).not.toHaveBeenCalled();
  }
);
