import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types';
import type { ServerWebSocket } from 'bun';
import {
  type HiveRealtimeClientMessage,
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
  clients: Set<HiveWebSocket>;
  presence: Map<string, string>;
};

type ServerOptions = {
  port?: number;
  supabase?: SupabaseClient<Database>;
};
type HiveJson =
  Database['public']['Tables']['hive_world_events']['Row']['payload'];

const rooms = new Map<string, RoomState>();

function getRoom(serverId: string) {
  const existing = rooms.get(serverId);
  if (existing) return existing;

  const created = {
    clients: new Set<HiveWebSocket>(),
    presence: new Map<string, string>(),
  };
  rooms.set(serverId, created);
  return created;
}

function broadcast(serverId: string, message: Record<string, unknown>) {
  const room = rooms.get(serverId);
  if (!room) return;

  const payload = JSON.stringify(message);
  for (const client of room.clients) {
    client.send(payload);
  }
}

function createSupabaseClient() {
  const url =
    process.env.SUPABASE_SERVER_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SECRET_KEY;

  if (!(url && key)) return null;

  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function persistWorldEvent(
  supabase: SupabaseClient<Database> | null,
  token: HiveRealtimeTokenPayload,
  message: Extract<HiveRealtimeClientMessage, { type: 'world.event' }>
) {
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('apply_hive_world_event', {
    p_actor_user_id: token.userId,
    p_event_type: message.eventType,
    p_expected_revision: message.expectedRevision,
    p_payload: message.payload as HiveJson,
    p_server_id: token.serverId,
    p_world_data: message.world as HiveJson,
  });

  if (error) {
    return { error: error.message };
  }

  return { event: data };
}

async function handleMessage(
  ws: HiveWebSocket,
  raw: string,
  supabase: SupabaseClient<Database> | null
) {
  const parsed = hiveRealtimeClientMessageSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    ws.send(JSON.stringify({ error: 'malformed_event', type: 'error' }));
    return;
  }

  const { token } = ws.data;

  if (parsed.data.type === 'selection') {
    broadcast(token.serverId, {
      selection: parsed.data.selection,
      type: 'selection',
      userId: token.userId,
    });
    return;
  }

  if (parsed.data.type === 'presence.join') {
    const room = getRoom(token.serverId);
    room.presence.set(token.userId, new Date().toISOString());
    broadcast(token.serverId, {
      serverId: token.serverId,
      type: 'presence',
      users: Array.from(room.presence.entries()).map(([id, lastSeenAt]) => ({
        id,
        lastSeenAt,
      })),
    });
    return;
  }

  const persisted = await persistWorldEvent(supabase, token, parsed.data);
  if (persisted?.error) {
    ws.send(JSON.stringify({ error: persisted.error, type: 'error' }));
    return;
  }

  broadcast(token.serverId, {
    event: persisted?.event ?? {
      eventType: parsed.data.eventType,
      payload: parsed.data.payload,
      revision: parsed.data.expectedRevision + 1,
      serverId: token.serverId,
    },
    type: 'world.event',
  });
}

export function createHiveRealtimeServer(options: ServerOptions = {}) {
  const supabase = options.supabase ?? createSupabaseClient();

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
        room?.presence.delete(ws.data.token.userId);
      },
      message(ws, message) {
        handleMessage(ws, String(message), supabase).catch((error) => {
          ws.send(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'unknown_error',
              type: 'error',
            })
          );
        });
      },
      open(ws) {
        const room = getRoom(ws.data.token.serverId);
        room.clients.add(ws);
        room.presence.set(ws.data.token.userId, new Date().toISOString());
      },
    },
  });
}
