import { chatRealtimeEventSchema } from '@tuturuuu/realtime/chat';
import {
  chatRealtimeBodyDigest,
  verifyChatRealtimeTicket,
} from '@tuturuuu/realtime/chat/ticket';
import {
  isInboxEvent,
  isStopped,
  json,
  LIMITS,
  parseTicketProtocol,
  ROOM_TICKET_HEADER,
  readBounded,
} from './protocol';

export { ChatConversationRoom } from './conversation-room';
export { ChatInboxRoom } from './inbox-room';

function room(namespace: DurableObjectNamespace, name: string) {
  return namespace.get(namespace.idFromName(name));
}

async function verify(token: string | null, env: Env) {
  if (!token) return null;
  return verifyChatRealtimeTicket(token, env.CHAT_REALTIME_TOKEN_SECRET);
}

async function connect(request: Request, env: Env, url: URL) {
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    return json({ error: 'Expected WebSocket' }, 426);
  }
  const ticket = await verify(
    parseTicketProtocol(request.headers.get('sec-websocket-protocol')),
    env
  );
  if (!ticket || ticket.kind !== 'subscribe') {
    return json({ error: 'Unauthorized' }, 401);
  }

  const target = new URL('https://room/connect');
  const since = url.searchParams.get('since');
  if (since !== null) target.searchParams.set('since', since);
  // Rebuild headers so nothing caller-supplied reaches the room as trusted.
  const headers = new Headers({
    upgrade: 'websocket',
    [ROOM_TICKET_HEADER]: JSON.stringify(ticket),
  });
  const forward = new Request(target, { headers, method: 'GET' });
  const stub =
    ticket.room === 'conversation'
      ? room(env.CONVERSATION, `${ticket.wsId}:${ticket.conversationId}`)
      : room(env.INBOX, ticket.wsId);
  return stub.fetch(forward);
}

function bearer(request: Request) {
  const [scheme, token] = (request.headers.get('authorization') ?? '').split(
    /\s+/u
  );
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

async function publish(request: Request, env: Env) {
  const ticket = await verify(bearer(request), env);
  if (!ticket || ticket.kind !== 'publish') {
    return json({ error: 'Unauthorized' }, 401);
  }
  if (
    !/^application\/json(?:;|$)/iu.test(
      request.headers.get('content-type') ?? ''
    )
  ) {
    return json({ error: 'Invalid payload' }, 415);
  }
  let body: Uint8Array;
  try {
    body = await readBounded(request.body, LIMITS.publishBodyBytes);
  } catch {
    return json({ error: 'Payload too large' }, 413);
  }
  if ((await chatRealtimeBodyDigest(body)) !== ticket.bodySha256) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return json({ error: 'Invalid payload' }, 400);
  }
  const parsed = chatRealtimeEventSchema.safeParse(raw);
  if (!parsed.success || parsed.data.wsId !== ticket.wsId) {
    return json({ error: 'Invalid event' }, 400);
  }
  const event = parsed.data;
  const payload = JSON.stringify(event);
  const init = {
    body: payload,
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  };

  let seq: number | null = null;
  let foregroundUserIds: string[] = [];
  if (event.conversationId) {
    const response = await room(
      env.CONVERSATION,
      `${event.wsId}:${event.conversationId}`
    ).fetch('https://room/publish', init);
    if (!response.ok) return json({ error: 'Room unavailable' }, 503);
    ({ foregroundUserIds, seq } = (await response.json()) as {
      foregroundUserIds: string[];
      seq: number;
    });
  }
  if (isInboxEvent(event)) {
    const response = await room(env.INBOX, event.wsId).fetch(
      'https://room/publish',
      init
    );
    if (!response.ok) return json({ error: 'Room unavailable' }, 503);
  }
  return json({ foregroundUserIds, ok: true, seq });
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      return json({ ok: true, stopped: isStopped(env) });
    }
    if (isStopped(env)) return json({ error: 'stopped' }, 503);
    if (url.pathname === '/v1/connect' && request.method === 'GET') {
      return connect(request, env, url);
    }
    if (url.pathname === '/v1/publish' && request.method === 'POST') {
      return publish(request, env);
    }
    return json({ error: 'Not found' }, 404);
  },
} satisfies ExportedHandler<Env>;
