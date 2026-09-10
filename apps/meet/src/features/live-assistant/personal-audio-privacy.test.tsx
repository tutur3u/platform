// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useLiveAssistant } from './use-live-assistant';

const calls = vi.hoisted(() => ({
  play: vi.fn(),
  interrupt: vi.fn(),
  close: vi.fn(),
  control: vi.fn(async () => ({ sessionId: 'session', token: 'test' })),
  update: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  controlMeetLive: calls.control,
  reviewMeetLiveTool: vi.fn(),
}));
vi.mock('./audio', () => ({
  LiveAudioPlayer: class {
    unlock = async () => {};
    play = calls.play;
    interrupt = calls.interrupt;
    close = calls.close;
  },
  captureLiveAudio: async () => ({ dispose: vi.fn(), update: calls.update }),
}));
class Socket {
  static OPEN = 1;
  static current: Socket;
  readyState = 1;
  bufferedAmount = 0;
  onclose?: (event: { code: number }) => void;
  onmessage?: (event: { data: string }) => void;
  send = vi.fn();
  close = vi.fn();
  constructor() {
    Socket.current = this;
    queueMicrotask(() => this.receive({ type: 'state', state: 'listening' }));
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

it('retries a temporary resume API failure and stops reconnecting after leaving', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', Socket);
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) },
  });
  const { result } = renderHook(() =>
    useLiveAssistant('meeting', '', { streams: [], microphoneEnabled: false })
  );
  await act(() => result.current.start('personal', [], ''));
  act(() => Socket.current.receive({ type: 'state', state: 'listening' }));
  const oldSocket = Socket.current;
  calls.control.mockRejectedValueOnce(new Error('Temporary outage'));
  act(() => oldSocket.onclose?.({ code: 1006 }));
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(result.current.status).toBe('recovering');
  await act(() => vi.advanceTimersByTimeAsync(4000));
  expect(Socket.current).not.toBe(oldSocket);
  act(() => Socket.current.receive({ type: 'state', state: 'listening' }));
  expect(result.current.status).toBe('listening');
  await act(() => result.current.stop());
  const count = calls.control.mock.calls.length;
  await act(() => vi.advanceTimersByTimeAsync(60000));
  expect(calls.control).toHaveBeenCalledTimes(count);
});
it('switches a personal microphone without replacing its private session', async () => {
  vi.stubGlobal('WebSocket', Socket);
  const stopOld = vi.fn();
  const old = { getTracks: () => [{ stop: stopOld }] };
  const next = { getTracks: () => [] };
  const getUserMedia = vi
    .fn()
    .mockResolvedValueOnce(old)
    .mockResolvedValueOnce(next);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  const { result, rerender } = renderHook(
    ({ device }) =>
      useLiveAssistant(
        'meeting',
        '',
        { streams: [], microphoneEnabled: false },
        device
      ),
    { initialProps: { device: 'first' } }
  );
  await act(() => result.current.start('personal', [], 'first'));
  const socket = Socket.current;
  await act(() => rerender({ device: 'second' }));
  expect(calls.update).toHaveBeenCalledWith([next]);
  expect(stopOld).toHaveBeenCalledOnce();
  expect(Socket.current).toBe(socket);
});

it('replaces the reconnect transcript snapshot instead of duplicating existing turns', async () => {
  vi.stubGlobal('WebSocket', Socket);
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) },
  });
  const { result } = renderHook(() =>
    useLiveAssistant('meeting', '', { streams: [], microphoneEnabled: false })
  );
  await act(() => result.current.start('personal', [], ''));
  const history = {
    type: 'history',
    turns: [{ role: 'assistant', text: 'Recovered reply', at: '2026-09-10' }],
  };
  act(() => {
    Socket.current.receive(history);
    Socket.current.receive(history);
  });
  expect(result.current.transcript).toHaveLength(1);
  expect(result.current.transcript[0]?.text).toBe('Recovered reply');
});
