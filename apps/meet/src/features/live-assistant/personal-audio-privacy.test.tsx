// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useLiveAssistant } from './use-live-assistant';

const calls = vi.hoisted(() => ({
  play: vi.fn(),
  interrupt: vi.fn(),
  close: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  controlMeetLive: async () => ({ sessionId: 'session', token: 'test' }),
}));
vi.mock('./audio', () => ({
  LiveAudioPlayer: class {
    unlock = async () => {};
    play = calls.play;
    interrupt = calls.interrupt;
    close = calls.close;
  },
  captureLiveAudio: async () => ({ dispose: vi.fn(), update: vi.fn() }),
}));
class Socket {
  static OPEN = 1;
  static current: Socket;
  readyState = 1;
  bufferedAmount = 0;
  onmessage?: (event: { data: string }) => void;
  send = vi.fn();
  close = vi.fn();
  constructor() {
    Socket.current = this;
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it('stops queued personal speech on pause and blocks new speech while the room microphone is on', async () => {
  vi.stubGlobal('WebSocket', Socket);
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) },
  });
  const { result, rerender } = renderHook(
    ({ microphoneEnabled }) =>
      useLiveAssistant('meeting', '', { streams: [], microphoneEnabled }),
    { initialProps: { microphoneEnabled: false } }
  );
  await act(() => result.current.start('personal', [], ''));
  act(() => {
    Socket.current.receive({ type: 'state', state: 'listening' });
    Socket.current.receive({ type: 'audio', data: 'AAAA', sampleRate: 24000 });
  });
  expect(calls.play).toHaveBeenCalledOnce();
  act(() => result.current.send({ type: 'pause', paused: true }));
  expect(calls.interrupt).toHaveBeenCalledOnce();
  act(() =>
    Socket.current.receive({ type: 'audio', data: 'AAAA', sampleRate: 24000 })
  );
  expect(calls.play).toHaveBeenCalledOnce();
  rerender({ microphoneEnabled: true });
  act(() => {
    result.current.send({ type: 'pause', paused: false });
    Socket.current.receive({ type: 'audio', data: 'AAAA', sampleRate: 24000 });
  });
  expect(calls.play).toHaveBeenCalledOnce();
});
