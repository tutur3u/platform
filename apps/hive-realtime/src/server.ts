import type { ServerWebSocket } from 'bun';
import {
  loadHiveCrdtSnapshot,
  persistHiveCrdtUpdate,
  persistHiveWorldEvent,
} from './hive-db';
import {
  base64ToBytes,
  bytesToBase64,
  type HiveRealtimeAwareness,
  type HiveRealtimeClientMessage,
  type HiveRealtimeServerMessage,
  hiveRealtimeClientMessageSchema,
} from './protocol';
import {
  type HiveRealtimeTokenPayload,
  verifyHiveRealtimeToken,
} from './token';

type HiveWebSocket = ServerWebSocket<{
  token: HiveRealtimeTokenPayload;
}>;

type RoomState = {
  awareness: Map<string, HiveRealtimeAwareness>;
  clients: Set<HiveWebSocket>;
};

type ServerOptions = {
  port?: number;
};

const rooms = new Map<string, RoomState>();
const PRESENCE_TTL_MS = 30_000;

function getRoom(serverId: string) {
  const existing = rooms.get(serverId);
  if (existing) return existing;

  const created = {
    awareness: new Map<string, HiveRealtimeAwareness>(),
    clients: new Set<HiveWebSocket>(),
  };
  rooms.set(serverId, created);
  return created;
}

function send(ws: HiveWebSocket, message: HiveRealtimeServerMessage) {
  ws.send(JSON.stringify(message));
}

function broadcast(
  serverId: string,
  message: HiveRealtimeServerMessage,
  except?: HiveWebSocket
) {
  const room = rooms.get(serverId);
  if (!room) return;

  const payload = JSON.stringify(message);
  for (const client of room.clients) {
    if (client === except) continue;
    if (client.readyState === 1) client.send(payload);
  }
}

function presencePayload(serverId: string): HiveRealtimeServerMessage {
  const room = getRoom(serverId);
  const now = Date.now();

  for (const [userId, awareness] of room.awareness.entries()) {
    if (Date.parse(awareness.lastSeenAt) + PRESENCE_TTL_MS < now) {
      room.awareness.delete(userId);
    }
  }

  return {
    awareness: Array.from(room.awareness.values()),
    serverId,
    type: 'presence',
  };
}

function publishPresence(serverId: string) {
  broadcast(serverId, presencePayload(serverId));
}

function createDefaultAwareness(token: HiveRealtimeTokenPayload) {
  return {
    color: token.role === 'admin' ? '#7cba62' : '#65a5d8',
    displayName: token.role === 'admin' ? 'Hive researcher' : 'Hive member',
    lastSeenAt: new Date().toISOString(),
    role: token.role === 'admin' ? 'admin' : 'member',
    userId: token.userId,
  } satisfies HiveRealtimeAwareness;
}

async function handleSyncHello(ws: HiveWebSocket) {
  const snapshot = await loadHiveCrdtSnapshot(ws.data.token.serverId);

  send(ws, {
    opSeq: Number(snapshot?.op_seq ?? 0),
    state: snapshot?.crdt_state ? bytesToBase64(snapshot.crdt_state) : null,
    stateVector: snapshot?.crdt_state_vector
      ? bytesToBase64(snapshot.crdt_state_vector)
      : null,
    type: 'sync.snapshot',
    world: snapshot?.world_data ?? { blocks: [], objects: [] },
  });
}

async function handleCrdtUpdate(
  ws: HiveWebSocket,
  message: Extract<HiveRealtimeClientMessage, { type: 'sync.update' }>
) {
  const persisted = await persistHiveCrdtUpdate({
    actorUserId: ws.data.token.userId,
    serverId: ws.data.token.serverId,
    update: base64ToBytes(message.update),
    world: message.world,
  });

  broadcast(
    ws.data.token.serverId,
    {
      opSeq: persisted?.opSeq ?? 0,
      stateVector: persisted?.stateVector
        ? bytesToBase64(persisted.stateVector)
        : message.stateVector,
      type: 'sync.update',
      update: message.update,
      world: persisted?.world ?? message.world,
    },
    ws
  );
}

async function handleLegacyWorldEvent(
  ws: HiveWebSocket,
  message: Extract<HiveRealtimeClientMessage, { type: 'world.event' }>
) {
  const event = await persistHiveWorldEvent({
    actorUserId: ws.data.token.userId,
    eventType: message.eventType,
    payload: {
      expectedRevision: message.expectedRevision,
      ...message.payload,
    },
    serverId: ws.data.token.serverId,
    world: message.world,
  });

  broadcast(ws.data.token.serverId, {
    event:
      event ??
      ({
        actorUserId: ws.data.token.userId,
        createdAt: new Date().toISOString(),
        eventType: message.eventType,
        id: crypto.randomUUID(),
        payload: message.payload,
        revision: message.expectedRevision + 1,
        serverId: ws.data.token.serverId,
      } as NonNullable<
        Extract<HiveRealtimeServerMessage, { type: 'world.event' }>['event']
      >),
    type: 'world.event',
    world: message.world,
  });
}

async function handleMessage(ws: HiveWebSocket, raw: string) {
  const parsed = hiveRealtimeClientMessageSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    send(ws, { error: 'malformed_event', type: 'error' });
    return;
  }

  const { token } = ws.data;

  if (parsed.data.type === 'sync.hello') {
    await handleSyncHello(ws);
    return;
  }

  if (parsed.data.type === 'sync.update') {
    await handleCrdtUpdate(ws, parsed.data);
    return;
  }

  if (parsed.data.type === 'awareness.update') {
    const room = getRoom(token.serverId);
    const awareness = {
      ...parsed.data.awareness,
      lastSeenAt: new Date().toISOString(),
      role: token.role === 'admin' ? parsed.data.awareness.role : 'member',
      userId: token.userId,
    };
    room.awareness.set(token.userId, awareness);
    broadcast(token.serverId, { awareness, type: 'awareness.update' }, ws);
    publishPresence(token.serverId);
    return;
  }

  if (parsed.data.type === 'presence.join') {
    const room = getRoom(token.serverId);
    room.awareness.set(token.userId, createDefaultAwareness(token));
    publishPresence(token.serverId);
    return;
  }

  if (parsed.data.type === 'selection') {
    const room = getRoom(token.serverId);
    const current =
      room.awareness.get(token.userId) ?? createDefaultAwareness(token);
    const awareness = {
      ...current,
      lastSeenAt: new Date().toISOString(),
      selection: parsed.data.selection,
    };
    room.awareness.set(token.userId, awareness);
    broadcast(token.serverId, { awareness, type: 'awareness.update' }, ws);
    publishPresence(token.serverId);
    return;
  }

  await handleLegacyWorldEvent(ws, parsed.data);
}

export function createHiveRealtimeServer(options: ServerOptions = {}) {
  setInterval(() => {
    for (const serverId of rooms.keys()) {
      publishPresence(serverId);
    }
  }, 10_000);

  return Bun.serve<{ token: HiveRealtimeTokenPayload }>({
    fetch(request, server) {
      const url = new URL(request.url);

      if (url.pathname === '/health') {
        return Response.json({ ok: true });
      }

      if (url.pathname !== '/realtime') {
        return new Response('Not found', { status: 404 });
      }

      const token = verifyHiveRealtimeToken(
        url.searchParams.get('token') ?? ''
      );
      if (!token) {
        return new Response('Unauthorized', { status: 401 });
      }

      const upgraded = server.upgrade(request, {
        data: { token },
      });

      return upgraded
        ? undefined
        : new Response('Expected WebSocket upgrade', { status: 426 });
    },
    port: options.port ?? Number(process.env.PORT ?? 7815),
    websocket: {
      close(ws) {
        const room = rooms.get(ws.data.token.serverId);
        room?.clients.delete(ws);
        room?.awareness.delete(ws.data.token.userId);
        publishPresence(ws.data.token.serverId);
      },
      message(ws, message) {
        handleMessage(ws, String(message)).catch((error) => {
          send(ws, {
            error: error instanceof Error ? error.message : 'unknown_error',
            type: 'error',
          });
        });
      },
      open(ws) {
        const room = getRoom(ws.data.token.serverId);
        room.clients.add(ws);
        room.awareness.set(
          ws.data.token.userId,
          createDefaultAwareness(ws.data.token)
        );
        void handleSyncHello(ws);
        publishPresence(ws.data.token.serverId);
      },
    },
  });
}
