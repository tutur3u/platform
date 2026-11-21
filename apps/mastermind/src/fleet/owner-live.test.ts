import { afterEach, expect, test, vi } from 'vitest';
import { subscribeOwnerLive } from './owner-live';
import { openOwnerLiveTicket } from './owner-live-server';

vi.mock('./owner-live-server', () => ({ openOwnerLiveTicket: vi.fn() }));

afterEach(() => vi.unstubAllGlobals());

test('fans out owner frames over one socket and ignores older poke revisions', async () => {
  class Socket extends EventTarget {
    static instances: Socket[] = [];
    close = vi.fn();
    constructor(
      public target: URL,
      public protocols: string[]
    ) {
      super();
      Socket.instances.push(this);
    }
  }
  const ticket = 'x'.repeat(32);
  const url = 'wss://socket.example/v1/bridge/connect';
  vi.mocked(openOwnerLiveTicket).mockResolvedValue({
    url,
    ticket,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  vi.stubGlobal(
    'document',
    Object.assign(new EventTarget(), { visibilityState: 'visible' })
  );
  vi.stubGlobal('WebSocket', Socket);
  const onFrame = vi.fn();
  const other = vi.fn();
  const stop = subscribeOwnerLive(onFrame);
  const stopOther = subscribeOwnerLive(other);
  try {
    await vi.waitFor(() => expect(Socket.instances).toHaveLength(1));
    const socket = Socket.instances[0]!;
    expect(socket.target.href).toBe(url);
    expect(socket.protocols).toEqual(['mm-bridge.v1', ticket]);
    socket.dispatchEvent(new Event('open'));
    const emit = (data: string) =>
      socket.dispatchEvent(new MessageEvent('message', { data }));
    const poke = {
      machineId: 'skr-m4',
      topic: 'usage',
      revision: 7,
      observedAt: '2026-11-21T17:00:00.000Z',
    };
    emit(JSON.stringify({ v: 1, t: 'poke', poke }));
    emit(JSON.stringify({ v: 1, t: 'poke', poke: { ...poke, revision: 6 } }));
    emit(
      JSON.stringify({
        v: 1,
        t: 'machine',
        machine: { machineId: 'skr-m4', connected: true },
      })
    );
    emit('broken');
    expect(onFrame.mock.calls.map(([frame]) => frame.t)).toEqual([
      'poke',
      'machine',
    ]);
    expect(other.mock.calls).toEqual(onFrame.mock.calls);
    stop();
    expect(socket.close).not.toHaveBeenCalled();
    stopOther();
    expect(socket.close).toHaveBeenCalledOnce();
  } finally {
    stop();
    stopOther();
  }
});
