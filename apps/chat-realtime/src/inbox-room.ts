import type { ChatRealtimeEvent } from '@tuturuuu/realtime/chat';
import type { ChatRealtimeSubscribeTicket } from '@tuturuuu/realtime/chat/ticket';
import { canReceive, json, LIMITS } from './protocol';
import { ChatRoom } from './room';

/**
 * One room per workspace. Carries list-level events filtered by audience and
 * workspace online presence. It keeps no frame log: a reconnecting client
 * refetches its conversation list.
 */
export class ChatInboxRoom extends ChatRoom {
  protected readonly maxSockets = LIMITS.inboxSockets;
  protected readonly roomKind = 'inbox' as const;

  protected onReady(ws: WebSocket, ticket: ChatRealtimeSubscribeTicket) {
    const users = [...this.liveUsers().keys()];
    const alreadyOnline = this.ctx.getWebSockets(ticket.userId).length > 1;
    this.send(ws, {
      expiresAt: ticket.exp,
      online: users.slice(0, LIMITS.inboxOnlineSnapshot),
      room: 'inbox',
      t: 'ready',
      userId: ticket.userId,
    });
    if (alreadyOnline) return;
    this.broadcast(
      { on: true, t: 'online', userId: ticket.userId },
      (attachment) => attachment.userId !== ticket.userId
    );
  }

  protected onLeave(userId: string, stillConnected: boolean) {
    if (stillConnected) return;
    this.broadcast({ on: false, t: 'online', userId });
  }

  protected publish(body: unknown) {
    const event = body as ChatRealtimeEvent;
    this.broadcast({ event, t: 'event' }, (attachment) =>
      canReceive(event, attachment.userId)
    );
    return json({ ok: true });
  }
}
