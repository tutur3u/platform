import type {
  ChatRealtimeEvent,
  ChatRealtimeServerEvent,
  ChatRealtimeTokenPayload,
} from '../../../packages/realtime/src/chat';
import {
  chatRealtimeEventSchema,
  hasChatRealtimeScope,
} from '../../../packages/realtime/src/chat';
import { verifyChatRealtimeJoinToken } from './token';

type Client = {
  controller: ReadableStreamDefaultController<Uint8Array>;
  token: ChatRealtimeTokenPayload;
};

type WorkspaceRoom = {
  clients: Set<Client>;
};

type ServerOptions = {
  port?: number;
};

const rooms = new Map<string, WorkspaceRoom>();
const encoder = new TextEncoder();

function getRoom(wsId: string) {
  const existing = rooms.get(wsId);
  if (existing) return existing;

  const created = { clients: new Set<Client>() };
  rooms.set(wsId, created);
  return created;
}

function encodeSseEvent(message: ChatRealtimeServerEvent) {
  return encoder.encode(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
}

function send(client: Client, message: ChatRealtimeServerEvent) {
  try {
    client.controller.enqueue(encodeSseEvent(message));
  } catch {
    getRoom(client.token.wsId).clients.delete(client);
  }
}

function broadcast(event: ChatRealtimeEvent) {
  const room = rooms.get(event.wsId);
  if (!room) return;

  for (const client of room.clients) {
    send(client, event);
  }
}

function parseBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  const [scheme, token] = authorization.split(/\s+/u);
  return scheme?.toLowerCase() === 'bearer' ? token : null;
}

function createRealtimeStream(token: ChatRealtimeTokenPayload) {
  let client: Client | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  return new ReadableStream<Uint8Array>({
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (client) {
        getRoom(client.token.wsId).clients.delete(client);
      }
    },
    start(controller) {
      client = { controller, token };
      getRoom(token.wsId).clients.add(client);
      send(client, { type: 'ready', userId: token.userId, wsId: token.wsId });

      heartbeat = setInterval(() => {
        if (client) {
          send(client, { sentAt: new Date().toISOString(), type: 'ping' });
        }
      }, 25_000);
    },
  });
}

async function handlePublish(request: Request) {
  const token = verifyChatRealtimeJoinToken(parseBearerToken(request) ?? '');
  if (!token || !hasChatRealtimeScope(token, 'publish')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = chatRealtimeEventSchema.safeParse(body);
  if (!parsed.success || parsed.data.wsId !== token.wsId) {
    return Response.json({ error: 'Invalid event' }, { status: 400 });
  }

  broadcast(parsed.data);
  return Response.json({ ok: true });
}

export function createChatRealtimeServer(options: ServerOptions = {}) {
  return Bun.serve({
    async fetch(request) {
      const url = new URL(request.url);

      if (url.pathname === '/health') {
        return Response.json({ ok: true });
      }

      if (url.pathname === '/publish' && request.method === 'POST') {
        return handlePublish(request);
      }

      if (url.pathname !== '/realtime') {
        return new Response('Not found', { status: 404 });
      }

      const token = verifyChatRealtimeJoinToken(
        url.searchParams.get('token') ?? ''
      );
      if (!token || !hasChatRealtimeScope(token, 'subscribe')) {
        return new Response('Unauthorized', { status: 401 });
      }

      return new Response(createRealtimeStream(token), {
        headers: {
          'Cache-Control': 'no-store, no-transform',
          Connection: 'keep-alive',
          'Content-Type': 'text/event-stream; charset=utf-8',
          'X-Accel-Buffering': 'no',
        },
      });
    },
    port: options.port ?? Number(process.env.PORT ?? 7817),
  });
}
