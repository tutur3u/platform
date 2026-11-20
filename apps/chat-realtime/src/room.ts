import { DurableObject } from 'cloudflare:workers';
import type { ChatRealtimeSubscribeTicket } from '@tuturuuu/realtime/chat/ticket';
import {
  CLOSE,
  type ClientFrame,
  consumeRate,
  isExpired,
  isStopped,
  json,
  LIMITS,
  parseClientFrame,
  ROOM_TICKET_HEADER,
  type ServerFrame,
  type SocketAttachment,
  SUBPROTOCOL,
} from './protocol';

export function attachmentOf(ws: WebSocket) {
  return ws.deserializeAttachment() as SocketAttachment | null;
}

function safeClose(ws: WebSocket, code: number, reason: string) {
  try {
    ws.close(code, reason);
  } catch {
    // The socket is already closing.
  }
}

/**
 * Shared hibernating WebSocket room. Work happens only inside a request or a
 * socket event: no alarms, no outbound fetches and no timers.
 */
export abstract class ChatRoom extends DurableObject<Env> {
  protected abstract readonly maxSockets: number;
  protected abstract readonly roomKind: 'inbox' | 'conversation';

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}')
    );
  }

  async fetch(request: Request) {
    if (isStopped(this.env)) {
      this.closeAll(CLOSE.stopped, 'stopped');
      return json({ error: 'stopped' }, 503);
    }
    const url = new URL(request.url);
    if (url.pathname === '/publish' && request.method === 'POST') {
      return this.publish(await request.json());
    }
    if (url.pathname === '/connect') {
      const ticket = JSON.parse(
        request.headers.get(ROOM_TICKET_HEADER) ?? 'null'
      ) as ChatRealtimeSubscribeTicket | null;
      if (!ticket || ticket.room !== this.roomKind)
        return json({ error: 'Unauthorized' }, 401);
      return this.acceptTicket(ticket, url);
    }
    return json({ error: 'Not found' }, 404);
  }

  protected abstract publish(body: unknown): Promise<Response> | Response;
  protected abstract onReady(
    ws: WebSocket,
    ticket: ChatRealtimeSubscribeTicket,
    url: URL
  ): void;
  protected onClientFrame(
    _ws: WebSocket,
    _attachment: SocketAttachment,
    _frame: ClientFrame
  ) {}
  protected onLeave(_userId: string, _stillConnected: boolean) {}

  private acceptTicket(ticket: ChatRealtimeSubscribeTicket, url: URL) {
    const now = Date.now();
    this.evictExpired(now);
    if (this.ctx.getWebSockets().length >= this.maxSockets) {
      return json({ error: 'Room full' }, 503);
    }
    const own = this.ctx.getWebSockets(ticket.userId);
    for (
      let excess = own.length - LIMITS.socketsPerUserPerRoom + 1;
      excess > 0;
      excess -= 1
    ) {
      const oldest = own.shift();
      if (oldest) safeClose(oldest, CLOSE.policy, 'replaced');
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server, [ticket.userId]);
    server.serializeAttachment({
      count: 0,
      exp: ticket.exp,
      state: 'foreground',
      userId: ticket.userId,
      windowStart: now,
    } satisfies SocketAttachment);
    this.onReady(server, ticket, url);
    return new Response(null, {
      headers: { 'Sec-WebSocket-Protocol': SUBPROTOCOL },
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    if (isStopped(this.env)) {
      this.closeAll(CLOSE.stopped, 'stopped');
      return;
    }
    const attachment = attachmentOf(ws);
    const now = Date.now();
    if (!attachment) return safeClose(ws, CLOSE.policy, 'unknown socket');
    if (isExpired(attachment, now)) return this.expire(ws);
    const frame = parseClientFrame(data);
    if (frame === 'too-big') return safeClose(ws, CLOSE.tooBig, 'too big');
    const allowed = consumeRate(attachment, now);
    ws.serializeAttachment(attachment);
    if (!allowed) return safeClose(ws, CLOSE.policy, 'rate limited');
    if (frame) this.onClientFrame(ws, attachment, frame);
  }

  async webSocketClose(ws: WebSocket, code: number) {
    safeClose(ws, code === 1005 || code === 1006 ? 1000 : code, 'closed');
    this.leave(ws);
  }

  async webSocketError(ws: WebSocket) {
    this.leave(ws);
  }

  private leave(ws: WebSocket) {
    const attachment = attachmentOf(ws);
    if (!attachment) return;
    const stillConnected = this.ctx
      .getWebSockets(attachment.userId)
      .some((other) => other !== ws && other.readyState === WebSocket.OPEN);
    this.onLeave(attachment.userId, stillConnected);
  }

  protected send(ws: WebSocket, frame: ServerFrame) {
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      // Closed sockets are dropped by the runtime.
    }
  }

  private expire(ws: WebSocket) {
    this.send(ws, { t: 'expired' });
    safeClose(ws, CLOSE.expired, 'ticket expired');
  }

  private evictExpired(now: number) {
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = attachmentOf(ws);
      if (!attachment || isExpired(attachment, now)) this.expire(ws);
    }
  }

  /** Sends to every live socket the filter admits; expired sockets close. */
  protected broadcast(
    frame: ServerFrame,
    admit: (attachment: SocketAttachment, ws: WebSocket) => boolean = () => true
  ) {
    const now = Date.now();
    const payload = JSON.stringify(frame);
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = attachmentOf(ws);
      if (!attachment || isExpired(attachment, now)) {
        this.expire(ws);
        continue;
      }
      if (!admit(attachment, ws)) continue;
      try {
        ws.send(payload);
      } catch {
        // Closed sockets are dropped by the runtime.
      }
    }
  }

  /** Distinct live users in this room, most recent socket state per user. */
  protected liveUsers() {
    const now = Date.now();
    const users = new Map<string, SocketAttachment['state']>();
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = attachmentOf(ws);
      if (!attachment || isExpired(attachment, now)) continue;
      if (users.get(attachment.userId) !== 'foreground') {
        users.set(attachment.userId, attachment.state);
      }
    }
    return users;
  }

  protected closeUser(userId: string, code: number, reason: string) {
    for (const ws of this.ctx.getWebSockets(userId)) {
      safeClose(ws, code, reason);
    }
  }

  protected closeAll(code: number, reason: string) {
    for (const ws of this.ctx.getWebSockets()) {
      if (code === CLOSE.stopped) this.send(ws, { t: 'stopped' });
      safeClose(ws, code, reason);
    }
  }
}
