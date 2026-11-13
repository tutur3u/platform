import { afterEach, expect, it, vi } from 'vitest';
import { RECONNECT_MAX_ATTEMPTS } from './reconnect';
import { getSignalingRecovery, MeetSignaling } from './signaling';

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
  drop(code: number) {
    this.readyState = 3;
    this.dispatchEvent(new Event('error'));
    this.dispatchEvent(Object.assign(new Event('close'), { code }));
  }
}

function fixture() {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  vi.stubGlobal('WebSocket', Socket);
  const onStatusChange = vi.fn();
  const onReconnected = vi.fn();
  const signaling = new MeetSignaling({
    resolveUrl: () => 'ws://test',
    onMessage: vi.fn(),
    onReconnected,
    onStatusChange,
  });
  signaling.connect();
  return { signaling, onStatusChange, onReconnected };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Socket.instances = [];
});

it.each([1001, 1006, 1012])(
  'recovers from a %i restart without ever reporting an error',
  async (code) => {
    const { signaling, onStatusChange, onReconnected } = fixture();
    await Promise.resolve();
    Socket.instances[0]!.open();
    onStatusChange.mockClear();

    Socket.instances[0]!.drop(code);
    expect(onStatusChange).toHaveBeenLastCalledWith('reconnecting');
    await vi.advanceTimersByTimeAsync(1);
    expect(Socket.instances).toHaveLength(2);
    expect(onStatusChange).toHaveBeenLastCalledWith('reconnecting');

    Socket.instances[1]!.open();
    expect(onStatusChange).toHaveBeenLastCalledWith('open');
    expect(onReconnected).toHaveBeenCalledOnce();
    const reported = onStatusChange.mock.calls.map(([status]) => status);
    expect(reported).not.toContain('error');
    expect(reported).not.toContain('closed');
    signaling.close();
  }
);

it('reports exhaustion only after the automatic budget is spent', async () => {
  const { signaling, onStatusChange } = fixture();
  await Promise.resolve();
  Socket.instances[0]!.open();
  for (let index = 0; index <= RECONNECT_MAX_ATTEMPTS; index++) {
    const socket = Socket.instances.at(-1)!;
    if (index > 0) socket.open();
    socket.drop(1012);
    if (index < RECONNECT_MAX_ATTEMPTS) {
      expect(onStatusChange).toHaveBeenLastCalledWith('reconnecting');
      await vi.advanceTimersByTimeAsync(1);
    }
  }
  expect(onStatusChange).toHaveBeenLastCalledWith('error');
  expect(getSignalingRecovery('error')).toBe('exhausted');
  const reported = onStatusChange.mock.calls.map(([status]) => status);
  expect(reported.indexOf('error')).toBe(reported.length - 1);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(Socket.instances).toHaveLength(RECONNECT_MAX_ATTEMPTS + 1);
  signaling.close();
});

it.each([1000, 4403])(
  'treats close %i as terminal without retrying',
  async (code) => {
    const { signaling, onStatusChange } = fixture();
    await Promise.resolve();
    Socket.instances[0]!.open();
    Socket.instances[0]!.drop(code);
    expect(onStatusChange).toHaveBeenLastCalledWith('closed');
    expect(getSignalingRecovery('closed')).toBe('exhausted');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(Socket.instances).toHaveLength(1);
    signaling.close();
  }
);

it('keeps the first connection attempt as connecting while it retries', async () => {
  const { signaling, onStatusChange } = fixture();
  await Promise.resolve();
  Socket.instances[0]!.drop(1006);
  expect(onStatusChange).toHaveBeenLastCalledWith('connecting');
  expect(getSignalingRecovery('connecting')).toBeNull();
  expect(getSignalingRecovery('reconnecting')).toBe('reconnecting');
  signaling.close();
});
