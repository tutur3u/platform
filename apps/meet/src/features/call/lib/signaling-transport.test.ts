import { afterEach, expect, it, vi } from 'vitest';
import { MeetSignaling } from './signaling';

class Socket extends EventTarget {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  sent: Array<{ requestId: string }> = [];
  constructor() {
    super();
    Socket.instances.push(this);
  }
  send(raw: string) {
    this.sent.push(JSON.parse(raw));
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }
  close() {
    // Reproduce Chrome's delayed close event, not an immediate mock close.
    this.readyState = 2;
  }
  closed(code: number) {
    this.readyState = 3;
    this.dispatchEvent(Object.assign(new Event('close'), { code }));
  }
}
function fixture() {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', Socket);
  const options = {
    resolveUrl: () => 'ws://test',
    onMessage: vi.fn(),
    onStatusChange: vi.fn(),
    onReconnected: vi.fn(),
  };
  const signaling = new MeetSignaling(options);
  signaling.connect();
  return { signaling, options };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Socket.instances = [];
});
it('reconnects a stuck closing socket and ignores its late events', async () => {
  const { signaling, options } = fixture();
  await Promise.resolve();
  const first = Socket.instances[0]!;
  first.open();
  first.close();
  await vi.advanceTimersByTimeAsync(5000);
  expect(Socket.instances).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(2000);
  const next = Socket.instances[1]!;
  next.open();
  expect(options.onReconnected).toHaveBeenCalledTimes(1);
  const response = signaling.request({ type: 'sfu.session.create' });
  const requestId = next.sent[0]!.requestId;
  // Old close/error/message callbacks must not break the replacement's request.
  first.closed(1006);
  first.dispatchEvent(new Event('error'));
  first.dispatchEvent(
    new MessageEvent('message', {
      data: JSON.stringify({ type: 'error', requestId, error: 'stale_socket' }),
    })
  );
  expect(options.onStatusChange).toHaveBeenLastCalledWith('open');
  expect(options.onMessage).not.toHaveBeenCalled();
  next.dispatchEvent(
    new MessageEvent('message', {
      data: JSON.stringify({
        type: 'sfu.response',
        requestId,
        result: 'current',
      }),
    })
  );
  await expect(response).resolves.toBe('current');
  signaling.close();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(Socket.instances).toHaveLength(2);
});
it('never reconnects an intentionally closed socket even if close is delayed', async () => {
  const { signaling } = fixture();
  await Promise.resolve();
  Socket.instances[0]!.open();
  signaling.close();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(Socket.instances).toHaveLength(1);
});
it.each([1000, 4403])(
  'respects a promptly received policy close %s',
  async (code) => {
    const { signaling } = fixture();
    await Promise.resolve();
    Socket.instances[0]!.open();
    Socket.instances[0]!.closed(code);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(Socket.instances).toHaveLength(1);
    signaling.close();
  }
);

it.each([
  { type: 'participant.removed', userId: 'self', by: 'host' },
  { type: 'admission.result', admitted: false, decidedBy: 'host' },
  { type: 'room.ended' },
])(
  'preserves $type while the policy close event is delayed',
  async (message) => {
    const { signaling, options } = fixture();
    await Promise.resolve();
    const socket = Socket.instances[0]!;
    socket.open();
    socket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ type: 'ready', userId: 'self' }),
      })
    );
    socket.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify(message) })
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(Socket.instances).toHaveLength(1);
    expect(options.onMessage).toHaveBeenLastCalledWith(message);
    socket.closed(4403);
    signaling.close();
  }
);
it('acknowledges the owner end request before closing transport', async () => {
  const { signaling } = fixture();
  await Promise.resolve();
  const socket = Socket.instances[0]!;
  socket.open();
  const ended = signaling.request({ type: 'room.end' });
  socket.dispatchEvent(
    new MessageEvent('message', {
      data: JSON.stringify({
        type: 'room.ended',
        requestId: socket.sent[0]!.requestId,
      }),
    })
  );
  await expect(ended).resolves.toBeUndefined();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(Socket.instances).toHaveLength(1);
});
it('continues recovery when another participant was removed', async () => {
  const { signaling } = fixture();
  await Promise.resolve();
  const socket = Socket.instances[0]!;
  socket.open();
  for (const message of [
    { type: 'ready', userId: 'self' },
    { type: 'participant.removed', userId: 'other', by: 'host' },
  ])
    socket.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify(message) })
    );
  socket.close();
  await vi.advanceTimersByTimeAsync(7000);
  expect(Socket.instances).toHaveLength(2);
  signaling.close();
});
