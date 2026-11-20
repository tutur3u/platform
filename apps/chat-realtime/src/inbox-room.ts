import type { ChatRealtimeEvent } from '@tuturuuu/realtime/chat';
import type { ChatRealtimeSubscribeTicket } from '@tuturuuu/realtime/chat/ticket';
import { canReceive, json, LIMITS } from './protocol';
import { ChatRoom } from './room';

/**
 * One room per workspace. Carries list-level events filtered by audience and
 * workspace online presence. Its replay log retains list-level metadata.
 */
export class ChatInboxRoom extends ChatRoom {
  protected readonly maxSockets = LIMITS.inboxSockets;
  protected readonly roomKind = 'inbox' as const;

  protected onReady(
    ws: WebSocket,
    ticket: ChatRealtimeSubscribeTicket,
    url: URL
  ) {
    const users = [...this.liveUsers().keys()];
    const alreadyOnline = this.ctx.getWebSockets(ticket.userId).length > 1;
    this.send(ws, {
      expiresAt: ticket.exp,
      online: users.slice(0, LIMITS.inboxOnlineSnapshot),
      room: 'inbox',
      seq: this.log.current(),
      t: 'ready',
      userId: ticket.userId,
    });
    this.replay(ws, ticket.userId, url);
    if (alreadyOnline) return;
    this.broadcastPresence(
      { on: true, t: 'online', userId: ticket.userId },
      (attachment) => attachment.userId !== ticket.userId
    );
  }

  protected onLeave(userId: string, stillConnected: boolean) {
    if (stillConnected) return;
    this.broadcastPresence({ on: false, t: 'online', userId });
  }

  protected publish(event: ChatRealtimeEvent) {
    const { duplicate, seq } = this.log.append(event);
    if (!duplicate) {
      this.broadcast({ event, seq, t: 'event' }, (attachment) =>
        canReceive(event, attachment.userId)
      );
    }
    return json({ ok: true, seq });
  }
}
