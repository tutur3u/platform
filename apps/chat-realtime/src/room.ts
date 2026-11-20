import type { ChatRealtimeEvent } from '@tuturuuu/realtime/chat';
import { DurableObject } from 'cloudflare:workers';
import type { ChatRealtimeSubscribeTicket } from '@tuturuuu/realtime/chat/ticket';
import {
  canReceive,
  CLOSE,
  type ClientFrame,
  consumeRate,
  isExpired,
  isStopped,
  json,
  LIMITS,
  parseClientFrame,
  parseSince,
  ROOM_TICKET_HEADER,
  type ServerFrame,
  type SocketAttachment,
  SUBPROTOCOL,
} from './protocol';
import { FrameLog } from './frame-log';
import { RoomAdmission } from './room-admission';

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
  protected readonly log: FrameLog;
  protected readonly admission: RoomAdmission;
  private readonly attachments = new WeakMap<WebSocket, SocketAttachment>();
  private presenceWindow = { count: 0, windowStart: 0 };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.log = new FrameLog(ctx.storage);
    this.admission = new RoomAdmission(ctx.storage);
  }

  async fetch(request: Request) {
    if (isStopped(this.env)) {
      this.closeAll(CLOSE.stopped, 'stopped');
      return json({ error: 'stopped' }, 503);
    }
    const url = new URL(request.url);
    if (url.pathname === '/publish' && request.method === 'POST') {
      return this.publish(await request.json<ChatRealtimeEvent>());
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

  protected abstract publish(
    event: ChatRealtimeEvent
  ): Promise<Response> | Response;
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
    if (isExpired(ticket, now) || !this.admission.mayConnect(ticket, now)) {
      return json({ error: 'Unauthorized' }, 401);
    }
    if (
      !this.admission.consumeConnect(ticket.userId, now, this.maxSockets * 2)
    ) {
      return json({ error: 'Too many connections' }, 429);
    }
    this.evictExpired(now);
    if (this.ctx.getWebSockets().length >= this.maxSockets) {
      return json({ error: 'Room full' }, 503);
    }
    const own = this.ctx
      .getWebSockets(ticket.userId)
      .filter((ws) => ws.readyState === WebSocket.OPEN);
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
    this.saveAttachment(server, {
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
    const attachment = this.getAttachment(ws);
    const now = Date.now();
    if (!attachment) return safeClose(ws, CLOSE.policy, 'unknown socket');
    if (isExpired(attachment, now)) return this.expire(ws);
    const frame = parseClientFrame(data);
    if (frame === 'too-big') return safeClose(ws, CLOSE.tooBig, 'too big');
    const allowed = consumeRate(attachment, now);
    this.saveAttachment(ws, attachment);
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
    const attachment = this.getAttachment(ws);
    if (!attachment) return;
    const stillConnected = this.ctx
      .getWebSockets(attachment.userId)
      .some((other) => other !== ws && other.readyState === WebSocket.OPEN);
    this.onLeave(attachment.userId, stillConnected);
  }

  private getAttachment(ws: WebSocket) {
    const cached = this.attachments.get(ws);
    if (cached) return cached;
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (attachment) this.attachments.set(ws, attachment);
    return attachment;
  }

  protected saveAttachment(ws: WebSocket, attachment: SocketAttachment) {
    this.attachments.set(ws, attachment);
    ws.serializeAttachment(attachment);
  }

  protected broadcastPresence(
    frame: Extract<ServerFrame, { t: 'online' | 'presence' | 'typing' }>,
    admit?: (attachment: SocketAttachment, ws: WebSocket) => boolean
  ) {
    if (
      consumeRate(
        this.presenceWindow,
        Date.now(),
        LIMITS.presenceBroadcastsPerWindow
      )
    ) {
      this.broadcast(frame, admit);
    }
  }

  protected replay(ws: WebSocket, userId: string, url: URL) {
    const since = parseSince(url.searchParams.get('since'));
    if (since === null) return;
    const replay = this.log.since(since);
    if (replay.kind === 'resync') this.send(ws, { t: 'resync' });
    if (replay.kind !== 'replay') return;
    for (const frame of replay.frames) {
      if (canReceive(frame.event, userId)) {
        this.send(ws, { event: frame.event, seq: frame.seq, t: 'event' });
      }
    }
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
      if (ws.readyState !== WebSocket.OPEN) continue;
      const attachment = this.getAttachment(ws);
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
      if (ws.readyState !== WebSocket.OPEN) continue;
      const attachment = this.getAttachment(ws);
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

  /** Distinct live users; any foreground socket makes its user foreground. */
  protected liveUsers() {
    const now = Date.now();
    const users = new Map<string, SocketAttachment['state']>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const attachment = this.getAttachment(ws);
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
