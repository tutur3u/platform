import type { ChatRealtimeEvent } from '@tuturuuu/realtime/chat';
import type { ChatRealtimeSubscribeTicket } from '@tuturuuu/realtime/chat/ticket';
import { FrameLog } from './frame-log';
import {
  CLOSE,
  type ClientFrame,
  canReceive,
  json,
  LIMITS,
  parseSince,
  type SocketAttachment,
} from './protocol';
import { ChatRoom } from './room';

/**
 * One room per conversation (`wsId:conversationId`). Members reach it only
 * with a conversation ticket minted after `apps/web` confirmed participation.
 */
export class ChatConversationRoom extends ChatRoom {
  protected readonly maxSockets = LIMITS.conversationSockets;
  protected readonly roomKind = 'conversation' as const;
  private log: FrameLog;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.log = new FrameLog(ctx.storage.sql);
  }

  protected onReady(
    ws: WebSocket,
    ticket: ChatRealtimeSubscribeTicket,
    url: URL
  ) {
    const present = [...this.liveUsers()].map(([userId, state]) => ({
      state,
      userId,
    }));
    this.send(ws, {
      expiresAt: ticket.exp,
      present,
      room: 'conversation',
      seq: this.log.current(),
      t: 'ready',
      userId: ticket.userId,
    });
    this.broadcast(
      { state: 'foreground', t: 'presence', userId: ticket.userId },
      (attachment, other) => other !== ws && attachment.userId !== ticket.userId
    );

    const since = parseSince(url.searchParams.get('since'));
    if (since === null) return;
    const replay = this.log.since(since);
    if (replay.kind === 'resync') this.send(ws, { t: 'resync' });
    if (replay.kind !== 'replay') return;
    for (const frame of replay.frames) {
      if (canReceive(frame.event, ticket.userId)) {
        this.send(ws, { event: frame.event, seq: frame.seq, t: 'event' });
      }
    }
  }

  protected onClientFrame(
    ws: WebSocket,
    attachment: SocketAttachment,
    frame: ClientFrame
  ) {
    const others = (other: SocketAttachment) =>
      other.userId !== attachment.userId;
    if (frame.t === 'typing') {
      this.broadcast(
        { on: frame.on, t: 'typing', userId: attachment.userId },
        others
      );
      return;
    }
    if (attachment.state === frame.state) return;
    attachment.state = frame.state;
    ws.serializeAttachment(attachment);
    this.broadcast(
      { state: frame.state, t: 'presence', userId: attachment.userId },
      others
    );
  }

  protected onLeave(userId: string, stillConnected: boolean) {
    if (stillConnected) return;
    this.broadcast({ state: 'offline', t: 'presence', userId });
  }

  protected publish(body: unknown) {
    const event = body as ChatRealtimeEvent;
    const seq = this.log.append(event);
    this.broadcast({ event, seq, t: 'event' }, (attachment) =>
      canReceive(event, attachment.userId)
    );
    if (event.type === 'member.removed') {
      this.closeUser(event.userId, CLOSE.removed, 'removed');
    }
    if (event.type === 'conversation.deleted') {
      this.closeAll(CLOSE.removed, 'deleted');
    }
    const foregroundUserIds = [...this.liveUsers()]
      .filter(([, state]) => state === 'foreground')
      .map(([userId]) => userId);
    return json({ foregroundUserIds, seq });
  }
}
