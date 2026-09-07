import { afterEach, expect, it, vi } from 'vitest';
import { MeetSignaling } from './signaling';

class Socket extends EventTarget {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  sent: Array<{ type: string; title?: string; requestId?: string }> = [];
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
    this.readyState = 3;
    this.dispatchEvent(Object.assign(new Event('close'), { code: 1000 }));
  }
  ack() {
    const request = this.sent.at(-1)!;
    this.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'room.title.changed',
          title: request.title,
          requestId: request.requestId,
        }),
      })
    );
  }
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Socket.instances = [];
});
it('retains the latest persisted title until reconnect and retries a dropped acknowledgement', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', Socket);
  const signaling = new MeetSignaling({
    resolveUrl: () => 'ws://test',
    onMessage: vi.fn(),
  });
  signaling.connect();
  await Promise.resolve();
  signaling.announceTitle('Before reconnect');
  signaling.announceTitle('Latest title');
  const first = Socket.instances[0]!;
  expect(first.sent).toHaveLength(0);
  first.open();
  expect(first.sent[0]?.title).toBe('Latest title');
  // A dropped acknowledgement retries the latest title, never an older update.
  signaling.announceTitle('Newer title');
  await vi.advanceTimersByTimeAsync(16_000);
  expect(first.sent.at(-1)?.title).toBe('Newer title');
  first.ack();
  await Promise.resolve();
  await Promise.resolve();
  const count = first.sent.length;
  await vi.advanceTimersByTimeAsync(20_000);
  expect(first.sent).toHaveLength(count);
  signaling.close();
});
it('does not replay a pending title after deliberately leaving', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', Socket);
  const signaling = new MeetSignaling({
    resolveUrl: () => 'ws://test',
    onMessage: vi.fn(),
  });
  signaling.connect();
  await Promise.resolve();
  const socket = Socket.instances[0]!;
  socket.open();
  signaling.announceTitle('Pending');
  signaling.close();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(socket.sent).toHaveLength(1);
});

it('replays a persisted title after the socket drops before acknowledgement', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', Socket);
  const signaling = new MeetSignaling({
    resolveUrl: () => 'ws://test',
    onMessage: vi.fn(),
  });
  signaling.connect();
  await Promise.resolve();
  const first = Socket.instances[0]!;
  first.open();
  signaling.announceTitle('Persisted title');
  first.readyState = 3;
  first.dispatchEvent(Object.assign(new Event('close'), { code: 1006 }));
  await vi.advanceTimersByTimeAsync(10_000);
  const replacement = Socket.instances.at(-1)!;
  expect(replacement).not.toBe(first);
  replacement.open();
  expect(replacement.sent[0]?.title).toBe('Persisted title');
  replacement.ack();
  await Promise.resolve();
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(20_000);
  expect(replacement.sent).toHaveLength(1);
  signaling.close();
});
