import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeChannel } from './channel';
import { channelTicketSchema, channelTopicSchema } from './schema';

class Socket extends EventTarget {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  sent: string[] = [];
  constructor(readonly url: string) {
    super();
    Socket.instances.push(this);
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }
  send(message: string) {
    this.sent.push(message);
  }
  frame(value: unknown) {
    this.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify(value) })
    );
  }
  close() {
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
  }
}
const ticket = {
  endpoint: 'wss://example.com/channels',
  token: 'signed',
  user: { id: 'u', user_metadata: {} },
};
async function connected(options = {}) {
  const join = vi.fn().mockResolvedValue(ticket);
  const channel = new RealtimeChannel('board', options, join);
  const status = vi.fn();
  channel.subscribe(status);
  await Promise.resolve();
  const socket = Socket.instances.at(-1)!;
  socket.open();
  await Promise.resolve();
  await Promise.resolve();
  return { channel, socket, join, status };
}
describe('Cloudflare channel lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Socket.instances = [];
    vi.stubGlobal('WebSocket', Socket);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it('joins privately with a ticket and dispatches only subscribed events', async () => {
    const { channel, socket, status } = await connected();
    const receive = vi.fn();
    channel.on<{ value: number }>('broadcast', { event: 'update' }, receive);
    expect(new URL(socket.url).searchParams.get('token')).toBe('signed');
    expect(status).toHaveBeenCalledWith('SUBSCRIBED');
    socket.frame({ type: 'broadcast', event: 'other', payload: 1 });
    socket.frame({ type: 'broadcast', event: 'update', payload: { value: 2 } });
    expect(receive).toHaveBeenCalledExactlyOnceWith({ payload: { value: 2 } });
    await channel.unsubscribe();
  });
  it('restores presence on reconnect and releases reconnect timers on unsubscribe', async () => {
    const { channel, socket, join } = await connected();
    await channel.track({ location: 'task' });
    socket.close();
    await vi.advanceTimersByTimeAsync(500);
    const next = Socket.instances.at(-1)!;
    next.open();
    await Promise.resolve();
    await Promise.resolve();
    expect(join).toHaveBeenCalledTimes(2);
    expect(next.sent).toContain(
      JSON.stringify({ type: 'track', payload: { location: 'task' } })
    );
    await channel.unsubscribe();
    await vi.advanceTimersByTimeAsync(60000);
    expect(join).toHaveBeenCalledTimes(2);
  });
  it('refreshes tickets without replacing the socket or replaying document snapshots', async () => {
    const { channel, socket, join } = await connected();
    await vi.advanceTimersByTimeAsync(45000);
    expect(Socket.instances).toHaveLength(1);
    expect(join).toHaveBeenCalledTimes(2);
    expect(socket.sent).toContain(
      JSON.stringify({ type: 'authenticate', token: 'signed' })
    );
    await channel.unsubscribe();
  });
  it('rejects insecure endpoints and oversized presence', async () => {
    const channel = new RealtimeChannel('board', {}, async () => ({
      ...ticket,
      endpoint: 'ws://external.example/channels',
    }));
    const status = vi.fn();
    channel.subscribe(status);
    await Promise.resolve();
    await Promise.resolve();
    expect(status).toHaveBeenCalledWith('CHANNEL_ERROR', expect.any(Error));
    expect(Socket.instances).toHaveLength(0);
    await expect(channel.track({ value: 'x'.repeat(17000) })).rejects.toThrow(
      'Presence exceeds limit'
    );
    await channel.unsubscribe();
  });
  it('retains all sessions in presence and announces departures', async () => {
    const { channel, socket } = await connected();
    const leave = vi.fn();
    channel.on('presence', { event: 'leave' }, leave);
    socket.frame({
      type: 'presence',
      state: { u: [{ presence_ref: 'a' }, { presence_ref: 'b' }] },
    });
    expect(channel.presenceState().u).toHaveLength(2);
    socket.frame({ type: 'presence', state: {} });
    expect(leave).toHaveBeenCalledOnce();
    await channel.unsubscribe();
  });
});
describe('ticket boundary', () => {
  it('rejects ambiguous topics and other service audiences', () => {
    expect(channelTopicSchema.safeParse('../board').success).toBe(false);
    expect(
      channelTicketSchema.safeParse({
        aud: 'tuturuuu.collaboration',
        kind: 'join',
        topic: 'board',
        userId: crypto.randomUUID(),
        role: 'editor',
        exp: 1,
      }).success
    ).toBe(false);
  });
});
