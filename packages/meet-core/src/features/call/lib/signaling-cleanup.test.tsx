// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useMeetRoom } from '../hooks/use-meet-room';
import { INITIAL_CALL_STATE } from './call-state';
import { MeetSignaling } from './signaling';

vi.mock('@tuturuuu/internal-api', () => ({
  createMeetCallRealtimeToken: vi.fn(async () => ({
    realtimeUrl: 'ws://test',
    token: 'disposable',
  })),
}));
vi.mock('@tuturuuu/meet-core/features/live-assistant/room-audio', () => ({
  deliverRoomAssistantAudio: vi.fn(),
}));

class Socket extends EventTarget {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  constructor() {
    super();
    Socket.instances.push(this);
  }
  send() {}
  close() {
    this.readyState = 2;
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }
  ready() {
    this.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'ready',
          userId: 'self',
          role: 'participant',
          admission: 'waiting',
          stage: INITIAL_CALL_STATE.stage,
        }),
      })
    );
  }
  drop() {
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
  }
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Socket.instances = [];
});

for (const owner of ['close', 'hook unmount'] as const) {
  it.each([
    'reconnect backoff',
    'stable readiness',
    'pending throttle',
  ] as const)(
    `clears %s timers on ${owner} and never opens another socket`,
    async (pending) => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(1);
      vi.stubGlobal('WebSocket', Socket);
      let dispose: () => void;
      if (owner === 'hook unmount') {
        const hook = renderHook(() =>
          useMeetRoom({
            meetingId: 'disposable-room',
            realtimeUrl: 'ws://test',
            token: 'disposable',
            wsId: 'disposable-workspace',
          })
        );
        dispose = hook.unmount;
      } else {
        const signaling = new MeetSignaling({
          resolveUrl: () => 'ws://test',
          onMessage: vi.fn(),
        });
        signaling.connect();
        dispose = () => signaling.close();
      }
      await act(async () => {
        await Promise.resolve();
      });
      const first = Socket.instances[0]!;
      act(() => {
        first.open();
        if (pending !== 'reconnect backoff') first.ready();
        if (pending !== 'stable readiness') first.drop();
      });
      if (pending === 'pending throttle') {
        await act(() => vi.advanceTimersByTimeAsync(500));
        expect(Socket.instances).toHaveLength(2);
        const second = Socket.instances[1]!;
        act(() => {
          second.open();
          second.ready();
          second.drop();
        });
      }
      // Assert a timer is live so cleanup cannot pass from an idle fixture.
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      const socketCount = Socket.instances.length;
      act(() => dispose());
      expect(vi.getTimerCount()).toBe(0);
      await act(() => vi.advanceTimersByTimeAsync(120_000));
      expect(Socket.instances).toHaveLength(socketCount);
      expect(vi.getTimerCount()).toBe(0);
    }
  );
}
