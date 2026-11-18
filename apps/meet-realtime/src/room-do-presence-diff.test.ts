import { expect, it, vi } from 'vitest';
import {
  applyPresenceDelta,
  getMeetRealtimeScopesForRole,
  meetRealtimeTokenPayloadSchema,
  type MeetRealtimeServerMessage,
  type MeetRoomSnapshot,
} from '../../../packages/realtime/src/meet';
import { MeetRoomDurableObject, type MeetRoomEnv } from './room-do';

it('batches room-wide joins, media updates and leaves and resyncs admitted clients after a gap', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocketRequestResponsePair', class {});
  const now = new Date();
  const values = new Map<string, unknown>();
  const sockets: WebSocket[] = [];
  let joining: WebSocket | undefined;
  vi.stubGlobal(
    'WebSocketPair',
    class {
      0 = {};
      1 = joining;
    }
  );
  const NativeResponse = Response;
  vi.stubGlobal(
    'Response',
    class extends NativeResponse {
      constructor(body?: BodyInit | null, init?: ResponseInit) {
        super(body, init?.status === 101 ? { ...init, status: 200 } : init);
      }
    }
  );
  const state = {
    blockConcurrencyWhile: (run: () => Promise<void>) => run(),
    setWebSocketAutoResponse: () => undefined,
    getWebSockets: () => sockets,
    acceptWebSocket: (socket: WebSocket) => {
      sockets.push(socket);
    },
    waitUntil: () => undefined,
    storage: {
      get: async (key: string) => values.get(key),
      put: async (key: string, value: unknown) => {
        values.set(key, structuredClone(value));
      },
      getAlarm: async () => null,
      setAlarm: async () => undefined,
    },
  } as unknown as DurableObjectState;
  const room = new MeetRoomDurableObject(state, {} as MeetRoomEnv);
  try {
    const peers = Array.from({ length: 50 }, (_, i) => {
      const role = i === 0 ? 'host' : 'speaker';
      const token = meetRealtimeTokenPayloadSchema.parse({
        userId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
        role,
        exp: Math.floor(now.getTime() / 1000) + 600,
        meetingId: '11111111-1111-4111-8111-111111111111',
        wsId: '22222222-2222-4222-8222-222222222222',
        roomId: 'large-room',
        scopes: getMeetRealtimeScopesForRole(role),
        limits: { maxPublishers: 50, maxViewers: 50 },
      });
      let attached: unknown = { token, presenceSeq: 0 };
      const messages: MeetRealtimeServerMessage[] = [];
      const transport = {
        readyState: WebSocket.OPEN as number,
        send: (raw: string) => messages.push(JSON.parse(raw)),
        deserializeAttachment: () => attached,
        serializeAttachment: (next: unknown) => {
          attached = next;
        },
      };
      const socket = transport as unknown as WebSocket;
      return {
        token,
        messages,
        transport,
        socket,
        seq: 0 as number | null,
        presence: {} as MeetRoomSnapshot['presence'],
      };
    });
    const command = (socket: WebSocket, message: object) =>
      room.webSocketMessage(socket, JSON.stringify(message));
    const snapshot = () => values.get('snapshot') as MeetRoomSnapshot;
    const apply = (peer: (typeof peers)[number], seqToSkip?: number) => {
      for (const frame of peer.messages.splice(0)) {
        if (frame.type === 'presence') {
          peer.presence = Object.fromEntries(
            frame.presence.map((person) => [person.userId, person])
          );
          peer.seq = frame.seq ?? null;
        } else if (frame.type === 'presence.delta' && frame.seq !== seqToSkip) {
          const next = applyPresenceDelta(peer.presence, peer.seq, frame);
          if (next.gap) return false;
          peer.presence = next.presence;
          peer.seq = next.seq;
        }
      }
      return true;
    };
    const connect = async (peer: (typeof peers)[number], delta = true) => {
      joining = peer.socket;
      await room.fetch(
        new Request(
          delta
            ? 'https://meet.test/connect?presenceDelta=1'
            : 'https://meet.test/connect',
          {
            headers: {
              'x-meet-token': JSON.stringify(peer.token),
              Upgrade: 'websocket',
            },
          }
        )
      );
    };
    for (const peer of peers) {
      await connect(peer);
      expect(peer.messages.some((message) => message.type === 'ready')).toBe(
        true
      );
      expect(peer.messages.some((message) => message.type === 'presence')).toBe(
        true
      );
    }
    await vi.advanceTimersByTimeAsync(50);
    for (const peer of peers) {
      expect(
        peer.messages.filter((message) => message.type === 'presence.delta')
      ).toHaveLength(1);
      expect(apply(peer)).toBe(true);
      expect(peer.presence).toEqual(snapshot().presence);
    }
    expect(Object.keys(snapshot().presence)).toHaveLength(50);
    const lobbyToken = {
      ...peers[49]!.token,
      userId: '00000000-0000-4000-8000-000000000099',
    };
    const lobbyMessages: string[] = [];
    const lobbySocket = {
      readyState: WebSocket.OPEN,
      deserializeAttachment: () => ({ token: lobbyToken, presenceSeq: 1 }),
      send: (raw: string) => {
        lobbyMessages.push(raw);
      },
    } as unknown as WebSocket;
    sockets.push(lobbySocket);
    await command(lobbySocket, { type: 'presence.resync' });
    expect(lobbyMessages.map((raw) => JSON.parse(raw))).toEqual([
      { type: 'error', error: 'awaiting_admission' },
    ]);
    for (const peer of peers.slice(0, 5)) {
      for (const audioEnabled of [true, false])
        await command(peer.socket, {
          type: 'presence.update',
          media: { audioEnabled, screenEnabled: false, videoEnabled: false },
        });
    }
    await vi.advanceTimersByTimeAsync(50);
    const sample = peers[0]!.messages.find(
      (message) => message.type === 'presence.delta'
    );
    expect(sample?.upserted).toHaveLength(5);
    expect(JSON.stringify(sample).length).toBeLessThan(
      JSON.stringify(snapshot().presence).length / 5
    );
    for (const peer of peers) apply(peer, peer === peers[0] ? 2 : undefined);
    // Reconnect uses the ready path and receives a full snapshot at the current sequence.
    const reconnect = peers[1]!;
    sockets.splice(sockets.indexOf(reconnect.socket), 1);
    await connect(reconnect);
    expect(apply(peers[1]!)).toBe(true);
    const remaining = peers.slice(0, 42);
    for (const peer of peers.slice(42)) {
      peer.transport.readyState = WebSocket.CLOSED;
      await room.webSocketClose(peer.socket, 1000);
    }
    await vi.advanceTimersByTimeAsync(50);
    for (const peer of remaining) {
      expect(
        peer.messages.filter((message) => message.type === 'presence.delta')
      ).toHaveLength(1);
      if (!apply(peer)) await command(peer.socket, { type: 'presence.resync' });
      expect(apply(peer)).toBe(true);
      expect(peer.presence).toEqual(snapshot().presence);
    }
    expect(Object.keys(snapshot().presence)).toHaveLength(42);
    expect(lobbyMessages).toHaveLength(1);
    expect(snapshot().budget?.largeRoomPresenceMilliseconds).toBe(5000);
    const legacy = peers[49]!;
    sockets.splice(sockets.indexOf(legacy.socket), 1);
    legacy.transport.readyState = WebSocket.OPEN;
    legacy.messages.length = 0;
    await connect(legacy, false);
    legacy.messages.length = 0;
    await vi.advanceTimersByTimeAsync(50);
    expect(legacy.messages).toEqual([
      expect.objectContaining({
        type: 'presence',
        seq: 4,
        presence: Object.values(snapshot().presence),
      }),
    ]);
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
