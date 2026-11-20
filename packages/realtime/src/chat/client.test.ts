import { describe, expect, it, vi } from 'vitest';
import {
  CHAT_REALTIME_CLOSE,
  type ChatRealtimeConnectionStatus,
  type ChatRealtimeServerFrame,
  type ChatRealtimeSocket,
  type ChatRealtimeTicketResponse,
  chatRealtimeReconnectDelay,
  createChatRealtimeConnection,
} from './client';

type Listener = (event: { code?: number; data?: unknown }) => void;

class FakeSocket implements ChatRealtimeSocket {
  readyState = 0;
  sent: string[] = [];
  closedWith: number | undefined;
  private listeners = new Map<string, Listener[]>();

  constructor(
    readonly url: string,
    readonly protocols: string[]
  ) {}

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(type: string, event: { code?: number; data?: unknown } = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  frame(frame: ChatRealtimeServerFrame) {
    this.readyState = 1;
    this.emit('message', { data: JSON.stringify(frame) });
  }

  serverClose(code: number) {
    this.readyState = 3;
    this.emit('close', { code });
  }

  close(code?: number) {
    this.closedWith = code;
    this.readyState = 3;
  }

  send(data: string) {
    this.sent.push(data);
  }
}

const ready = (seq = 0): ChatRealtimeServerFrame => ({
  expiresAt: 0,
  room: 'conversation',
  seq,
  t: 'ready',
  userId: '00000000-0000-4000-8000-000000000001',
});

function harness(
  tickets: () => Promise<ChatRealtimeTicketResponse> = async () => ({
    enabled: true,
    expiresAt: new Date().toISOString(),
    ticket: 'signed.ticket',
    url: 'wss://chat-realtime.test/v1/connect',
  })
) {
  const sockets: FakeSocket[] = [];
  const timers: { callback: () => void; delayMs: number }[] = [];
  const statuses: ChatRealtimeConnectionStatus[] = [];
  const frames: ChatRealtimeServerFrame[] = [];
  const onResync = vi.fn();
  const getTicket = vi.fn(tickets);
  const connection = createChatRealtimeConnection({
    clearTimer: () => undefined,
    createSocket: (url, protocols) => {
      const socket = new FakeSocket(url, protocols);
      sockets.push(socket);
      return socket;
    },
    getTicket,
    onFrame: (frame) => frames.push(frame),
    onResync,
    onStatus: (status) => statuses.push(status),
    random: () => 1,
    setTimer: (callback, delayMs) => {
      timers.push({ callback, delayMs });
      return timers.length;
    },
  });
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const runTimer = async () => {
    const timer = timers.shift();
    if (!timer) throw new Error('no pending timer');
    timer.callback();
    await flush();
    return timer.delayMs;
  };
  return {
    connection,
    flush,
    frames,
    getTicket,
    onResync,
    runTimer,
    sockets,
    statuses,
    timers,
  };
}

describe('createChatRealtimeConnection', () => {
  it('offers the ticket as a subprotocol and refetches once on first ready', async () => {
    const h = harness();
    await h.flush();
    const [socket] = h.sockets;
    expect(socket?.url).toBe('wss://chat-realtime.test/v1/connect');
    expect(socket?.protocols).toEqual([
      'tuturuuu.chat.v1',
      'ticket.signed.ticket',
    ]);
    socket?.frame(ready(7));
    expect(h.connection.status).toBe('open');
    expect(h.onResync).toHaveBeenCalledTimes(1);
  });

  it('reconnects with the replay cursor and a fresh ticket after expiry', async () => {
    const h = harness();
    await h.flush();
    h.sockets[0]?.frame(ready(3));
    h.sockets[0]?.frame({
      event: { type: 'typing.updated' } as never,
      seq: 9,
      t: 'event',
    });
    expect(h.frames).toHaveLength(1);
    h.sockets[0]?.serverClose(CHAT_REALTIME_CLOSE.expired);
    await h.flush();
    expect(h.getTicket).toHaveBeenCalledTimes(2);
    expect(h.timers).toHaveLength(0);
    expect(h.sockets[1]?.url).toBe(
      'wss://chat-realtime.test/v1/connect?since=9'
    );
    h.sockets[1]?.frame(ready(9));
    expect(h.onResync).toHaveBeenCalledTimes(1);
    h.sockets[1]?.frame({ t: 'resync' });
    expect(h.onResync).toHaveBeenCalledTimes(2);
  });

  it('restarts the cursor when the room lost its log', async () => {
    const h = harness();
    await h.flush();
    h.sockets[0]?.frame(ready(40));
    h.sockets[0]?.serverClose(CHAT_REALTIME_CLOSE.expired);
    await h.flush();
    expect(h.sockets[1]?.url).toContain('since=40');
    h.sockets[1]?.frame(ready(2));
    expect(h.onResync).toHaveBeenCalledTimes(2);
    h.sockets[1]?.frame({ t: 'resync' });
    expect(h.onResync).toHaveBeenCalledTimes(3);
    h.sockets[1]?.frame({
      event: { type: 'typing.updated' } as never,
      seq: 3,
      t: 'event',
    });
    h.sockets[1]?.serverClose(CHAT_REALTIME_CLOSE.expired);
    await h.flush();
    expect(h.sockets[2]?.url).toContain('since=3');
  });

  it('refreshes an expired ticket before ready without backing off', async () => {
    const h = harness();
    await h.flush();
    expect(h.connection.status).toBe('connecting');
    h.sockets[0]?.serverClose(CHAT_REALTIME_CLOSE.expired);
    await h.flush();
    expect(h.timers).toHaveLength(0);
    expect(h.getTicket).toHaveBeenCalledTimes(2);
    expect(h.sockets).toHaveLength(2);
  });

  it('polls after the worker stops instead of reconnecting', async () => {
    const h = harness();
    await h.flush();
    h.sockets[0]?.frame(ready());
    h.sockets[0]?.serverClose(CHAT_REALTIME_CLOSE.stopped);
    expect(h.connection.status).toBe('polling');
    expect(h.timers).toHaveLength(0);
    expect(h.sockets).toHaveLength(1);
    h.connection.retry();
    await h.flush();
    expect(h.sockets).toHaveLength(2);
  });

  it('backs off from 1 s to 30 s and polls after five failures', async () => {
    const h = harness();
    await h.flush();
    const delays: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      h.sockets.at(-1)?.serverClose(1006);
      delays.push(await h.runTimer());
    }
    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000]);
    h.sockets.at(-1)?.serverClose(1006);
    expect(h.connection.status).toBe('polling');
    expect(h.timers).toHaveLength(0);

    h.connection.retry();
    await h.flush();
    expect(h.sockets).toHaveLength(6);
    h.sockets.at(-1)?.serverClose(4503);
    expect(h.connection.status).toBe('polling');

    h.connection.retry();
    await h.flush();
    h.sockets.at(-1)?.frame(ready());
    expect(h.connection.status).toBe('open');
  });

  it('caps the reconnect delay at 30 s with jitter in its upper half', () => {
    expect(chatRealtimeReconnectDelay(1, 0)).toBe(500);
    expect(chatRealtimeReconnectDelay(6, 1)).toBe(30_000);
    expect(chatRealtimeReconnectDelay(20, 0)).toBe(15_000);
  });

  it('treats ticket failures as reconnect failures', async () => {
    const h = harness(async () => {
      throw new Error('offline');
    });
    await h.flush();
    expect(h.sockets).toHaveLength(0);
    expect(h.connection.status).toBe('connecting');
    expect(h.timers[0]?.delayMs).toBe(1_000);
  });

  it('stops for a disabled Worker and for a removed member', async () => {
    const disabled = harness(async () => ({ enabled: false }));
    await disabled.flush();
    expect(disabled.connection.status).toBe('disabled');
    expect(disabled.sockets).toHaveLength(0);

    const removed = harness();
    await removed.flush();
    removed.sockets[0]?.frame(ready());
    removed.sockets[0]?.serverClose(CHAT_REALTIME_CLOSE.removed);
    expect(removed.connection.status).toBe('removed');
    expect(removed.onResync).toHaveBeenCalledTimes(2);
    expect(removed.timers).toHaveLength(0);
  });

  it('ignores callbacks from a socket it replaced or closed', async () => {
    const h = harness();
    await h.flush();
    const first = h.sockets[0];
    first?.frame(ready());
    expect(h.connection.send({ on: true, t: 'typing' })).toBe(true);
    expect(first?.sent).toEqual(['{"on":true,"t":"typing"}']);
    h.connection.close();
    expect(first?.closedWith).toBe(1000);
    first?.serverClose(1006);
    expect(h.connection.status).toBe('closed');
    expect(h.timers).toHaveLength(0);
    expect(h.connection.send({ on: false, t: 'typing' })).toBe(false);
  });
});
