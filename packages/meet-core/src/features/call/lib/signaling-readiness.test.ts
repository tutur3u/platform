import { afterEach, expect, it, vi } from 'vitest';
import { MeetSignaling } from './signaling';

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
  message(message: unknown) {
    this.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify(message) })
    );
  }
}
function fixture(
  resolveUrl: (signal?: AbortSignal) => Promise<string> | string = () =>
    'ws://test'
) {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  vi.stubGlobal('WebSocket', Socket);
  const onStatusChange = vi.fn();
  const onMessage = vi.fn();
  const signaling = new MeetSignaling({
    resolveUrl,
    onStatusChange,
    onMessage,
  });
  signaling.connect();
  return { signaling, onStatusChange, onMessage };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Socket.instances = [];
});

it('bounds a hung token resolution and ignores its late result', async () => {
  let resolve!: (url: string) => void;
  const signals: Array<AbortSignal | undefined> = [];
  const { signaling, onStatusChange } = fixture((signal) => {
    signals.push(signal);
    return new Promise((done) => {
      resolve = done;
    });
  });
  await vi.advanceTimersByTimeAsync(10_000);
  expect(signals[0]?.aborted).toBe(true);
  expect(onStatusChange).toHaveBeenCalledWith('error');
  resolve('ws://late');
  await Promise.resolve();
  expect(Socket.instances).toHaveLength(0);
  signaling.close();
});

it('exhausts a finite budget even when every socket opens without ready', async () => {
  const { signaling, onStatusChange } = fixture();
  for (let index = 0; index < 13; index++) {
    await vi.advanceTimersByTimeAsync(index === 0 ? 0 : 1);
    const socket = Socket.instances.at(-1)!;
    socket.open();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(socket.readyState).toBe(2);
  }
  const count = Socket.instances.length;
  expect(count).toBe(13);
  expect(onStatusChange).toHaveBeenLastCalledWith('error');
  await vi.advanceTimersByTimeAsync(120_000);
  expect(Socket.instances).toHaveLength(count);
  signaling.close();
});

it.each(['waiting', 'admitted'])(
  'accepts %s ready without timing out host admission',
  async (admission) => {
    const { signaling, onStatusChange } = fixture();
    await Promise.resolve();
    const socket = Socket.instances[0]!;
    socket.open();
    socket.message({ type: 'ready', userId: 'self', admission });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(Socket.instances).toHaveLength(1);
    expect(onStatusChange).toHaveBeenLastCalledWith('open');
    signaling.close();
  }
);

it('aborts resolution on leave and never opens a late socket', async () => {
  let resolve!: (url: string) => void;
  let signal: AbortSignal | undefined;
  const { signaling, onMessage } = fixture((value) => {
    signal = value;
    return new Promise((done) => {
      resolve = done;
    });
  });
  signaling.close();
  expect(signal?.aborted).toBe(true);
  resolve('ws://late');
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(Socket.instances).toHaveLength(0);
  expect(onMessage).not.toHaveBeenCalled();
});

it('stops after repeated token failures and leaves an observable error', async () => {
  const resolveUrl = vi.fn().mockRejectedValue(new Error('unavailable'));
  const { signaling, onStatusChange } = fixture(resolveUrl);
  await vi.advanceTimersByTimeAsync(1000);
  expect(resolveUrl).toHaveBeenCalledTimes(13);
  expect(onStatusChange).toHaveBeenLastCalledWith('error');
  await vi.advanceTimersByTimeAsync(60_000);
  expect(resolveUrl).toHaveBeenCalledTimes(13);
  signaling.close();
});

it('ignores ready from an expired socket and preserves a terminal decision', async () => {
  const { signaling, onMessage } = fixture();
  await Promise.resolve();
  const first = Socket.instances[0]!;
  first.open();
  await vi.advanceTimersByTimeAsync(10_001);
  const next = Socket.instances[1]!;
  next.open();
  first.message({ type: 'ready', userId: 'stale', admission: 'admitted' });
  expect(onMessage).not.toHaveBeenCalled();
  next.message({
    type: 'admission.result',
    admitted: false,
    decidedBy: 'host',
  });
  expect(signaling.isClosed).toBe(true);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(Socket.instances).toHaveLength(2);
});
