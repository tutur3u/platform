import type { ChatRealtimeEvent } from '@tuturuuu/realtime/chat';
import {
  CHAT_REALTIME_TICKET_CLOCK_SKEW_SECONDS,
  type ChatRealtimeSubscribeTicket,
} from '@tuturuuu/realtime/chat/ticket';
import {
  CLOSE,
  type ClientFrame,
  canReceive,
  json,
  LIMITS,
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
    this.broadcastPresence(
      { state: 'foreground', t: 'presence', userId: ticket.userId },
      (attachment, other) => other !== ws && attachment.userId !== ticket.userId
    );

    this.replay(ws, ticket.userId, url);
  }

  protected onClientFrame(
    ws: WebSocket,
    attachment: SocketAttachment,
    frame: ClientFrame
  ) {
    const others = (other: SocketAttachment) =>
      other.userId !== attachment.userId;
    if (frame.t === 'typing') {
      this.broadcastPresence(
        { on: frame.on, t: 'typing', userId: attachment.userId },
        others
      );
      return;
    }
    if (attachment.state === frame.state) return;
    attachment.state = frame.state;
    this.saveAttachment(ws, attachment);
    this.broadcastPresence(
      { state: frame.state, t: 'presence', userId: attachment.userId },
      others
    );
  }

  protected onLeave(userId: string, stillConnected: boolean) {
    if (stillConnected) return;
    this.broadcastPresence({ state: 'offline', t: 'presence', userId });
  }

  protected publish(event: ChatRealtimeEvent) {
    const effectiveAt = Math.floor(Date.parse(event.sentAt) / 1_000);
    const { duplicate, seq } = this.log.append(event, () => {
      if (event.type === 'conversation.deleted') {
        this.admission.revokeRoom(effectiveAt);
      }
      if (event.type === 'member.removed') {
        this.admission.revoke(event.userId, effectiveAt);
      }
    });
    if (!duplicate) {
      const removedUser = event.type === 'member.removed' ? event.userId : null;
      if (removedUser) {
        this.closeUser(
          removedUser,
          effectiveAt + CHAT_REALTIME_TICKET_CLOCK_SKEW_SECONDS
        );
      }
      this.broadcast(
        { event, seq, t: 'event' },
        (attachment) =>
          attachment.userId !== removedUser &&
          canReceive(event, attachment.userId)
      );
      if (event.type === 'conversation.deleted') {
        this.closeAll(CLOSE.removed, 'deleted');
      }
    }
    const foregroundUserIds = [...this.liveUsers()]
      .filter(([, state]) => state === 'foreground')
      .map(([userId]) => userId);
    return json({ foregroundUserIds, seq });
  }
}
