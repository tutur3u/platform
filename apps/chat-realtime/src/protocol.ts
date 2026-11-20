import type { ChatRealtimeEvent } from '@tuturuuu/realtime/chat';
import { canReceiveChatRealtimeEvent } from '@tuturuuu/realtime/chat';
import { z } from 'zod';

/** Hard bounds on every billable path. See the chat realtime docs page. */
export const LIMITS = {
  clientFrameBytes: 2048,
  framesPerWindow: 20,
  windowMs: 10_000,
  socketsPerUserPerRoom: 5,
  connectsPerWindow: 10,
  connectWindowMs: 60_000,
  presenceBroadcastsPerWindow: 20,
  conversationSockets: 500,
  inboxSockets: 5000,
  inboxOnlineSnapshot: 500,
  publishBodyBytes: 64 * 1024,
  logFrames: 200,
  logMaxAgeMs: 15 * 60_000,
} as const;

export const CLOSE = {
  expired: 4001,
  removed: 4003,
  stopped: 4503,
  policy: 1008,
  tooBig: 1009,
} as const;

export const SUBPROTOCOL = 'tuturuuu.chat.v1';
export const TICKET_PROTOCOL_PREFIX = 'ticket.';
/** Internal header carrying the verified ticket from the Worker to a room. */
export const ROOM_TICKET_HEADER = 'x-chat-room-ticket';

export type PresenceState = 'foreground' | 'background';

export type SocketAttachment = {
  count: number;
  exp: number;
  iat?: number;
  state: PresenceState;
  userId: string;
  windowStart: number;
};

export type ClientFrame =
  | { t: 'typing'; on: boolean }
  | { t: 'presence'; state: PresenceState };

export type ServerFrame =
  | {
      t: 'ready';
      expiresAt: number;
      room: 'inbox' | 'conversation';
      seq?: number;
      userId: string;
      present?: { state: PresenceState; userId: string }[];
      online?: string[];
    }
  | { t: 'event'; seq?: number; event: ChatRealtimeEvent }
  | { t: 'typing'; on: boolean; userId: string }
  | { t: 'presence'; state: PresenceState | 'offline'; userId: string }
  | { t: 'online'; on: boolean; userId: string }
  | { t: 'resync' }
  | { t: 'expired' }
  | { t: 'stopped' };

export function isStopped(env: { CHAT_REALTIME_STOPPED?: string }) {
  const value = env.CHAT_REALTIME_STOPPED?.trim().toLowerCase();
  return value === 'true' || value === '1';
}

/**
 * Reads the ticket from `Sec-WebSocket-Protocol: tuturuuu.chat.v1, ticket.<t>`.
 * Browsers cannot set WebSocket headers, and keeping the ticket out of the URL
 * keeps it out of request logs.
 */
export function parseTicketProtocol(header: string | null) {
  if (!header || header.length > 8192) return null;
  const protocols = header.split(',').map((entry) => entry.trim());
  if (!protocols.includes(SUBPROTOCOL)) return null;
  const ticket = protocols.find((entry) =>
    entry.startsWith(TICKET_PROTOCOL_PREFIX)
  );
  return ticket ? ticket.slice(TICKET_PROTOCOL_PREFIX.length) : null;
}

export function parseSince(value: string | null) {
  if (value === null || !/^\d{1,15}$/u.test(value)) return null;
  return Number(value);
}

/** Counts one inbound frame against the socket window; false when exceeded. */
export function consumeRate(
  attachment: Pick<SocketAttachment, 'count' | 'windowStart'>,
  now: number,
  limit: number = LIMITS.framesPerWindow
) {
  if (now - attachment.windowStart >= LIMITS.windowMs) {
    attachment.windowStart = now;
    attachment.count = 0;
  }
  attachment.count += 1;
  return attachment.count <= limit;
}

export function frameByteLength(data: string | ArrayBuffer) {
  return typeof data === 'string'
    ? new TextEncoder().encode(data).byteLength
    : data.byteLength;
}

export function parseClientFrame(
  data: string | ArrayBuffer
): ClientFrame | 'too-big' | null {
  if (frameByteLength(data) > LIMITS.clientFrameBytes) return 'too-big';
  if (typeof data !== 'string') return null;
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const frame = value as Record<string, unknown>;
  if (frame.t === 'typing' && typeof frame.on === 'boolean') {
    return { on: frame.on, t: 'typing' };
  }
  if (
    frame.t === 'presence' &&
    (frame.state === 'foreground' || frame.state === 'background')
  ) {
    return { state: frame.state, t: 'presence' };
  }
  return null;
}

export function isExpired(
  attachment: Pick<SocketAttachment, 'exp'>,
  now: number
) {
  return attachment.exp * 1000 <= now;
}

export function canReceive(event: ChatRealtimeEvent, userId: string) {
  return canReceiveChatRealtimeEvent(event, userId);
}

/** Events the workspace inbox fans out; the rest stay in the conversation. */
export function isInboxEvent(event: ChatRealtimeEvent) {
  return (
    event.type !== 'member.removed' &&
    event.type !== 'read.updated' &&
    event.type !== 'typing.updated' &&
    event.type !== 'presence.updated'
  );
}

const canonicalUuid = z.uuid().refine((id) => id === id.toLowerCase());
const inboxConversation = z.object({
  id: canonicalUuid,
  type: z.literal('channel'),
});
const deletedInboxConversation = z.object({
  conversationId: canonicalUuid,
  type: z.literal('channel'),
});

function inboxRecordId(record: unknown, key: string) {
  if (!record || typeof record !== 'object') return undefined;
  const parsed = z.object({ [key]: canonicalUuid }).safeParse(record);
  return parsed.success ? parsed.data[key] : undefined;
}

export function isCanonicalRoomId(id: unknown) {
  return canonicalUuid.safeParse(id).success;
}

export function validPublishScope(event: ChatRealtimeEvent) {
  const isListChange =
    event.type === 'conversation.created' ||
    event.type === 'conversation.updated' ||
    event.type === 'conversation.deleted';

  if (event.conversationId && !isCanonicalRoomId(event.conversationId))
    return false;
  if (!isListChange && !event.conversationId) return false;
  if (event.actorUserId && !isCanonicalRoomId(event.actorUserId)) return false;
  if ('userId' in event && !isCanonicalRoomId(event.userId)) return false;
  if (
    'messageId' in event &&
    event.messageId &&
    !isCanonicalRoomId(event.messageId)
  )
    return false;

  if (event.audience.scope === 'users') {
    return event.audience.userIds.every(isCanonicalRoomId);
  }
  if (event.conversationId) return false;

  switch (event.type) {
    case 'conversation.created':
    case 'conversation.updated':
      return inboxConversation.safeParse(event.conversation).success;
    case 'conversation.deleted':
      return deletedInboxConversation.safeParse(event.result).success;
    default:
      return false;
  }
}

export function toInboxEvent(event: ChatRealtimeEvent): ChatRealtimeEvent {
  switch (event.type) {
    case 'conversation.created':
    case 'conversation.updated': {
      const id =
        inboxRecordId(event.conversation, 'id') ?? event.conversationId;
      return { ...event, conversation: id ? { id } : {} };
    }
    case 'conversation.deleted': {
      const conversationId =
        inboxRecordId(event.result, 'conversationId') ?? event.conversationId;
      return { ...event, result: conversationId ? { conversationId } : {} };
    }
    case 'message.created':
    case 'message.updated':
    case 'message.deleted':
    case 'reaction.updated': {
      const id = inboxRecordId(event.message, 'id');
      return { ...event, message: id ? { id } : {} };
    }
    default:
      return event;
  }
}

export function json(body: unknown, status = 200) {
  return Response.json(body, {
    headers: { 'cache-control': 'no-store' },
    status,
  });
}

/** Reads at most `limit` bytes; throws once the body exceeds it. */
export async function readBounded(
  body: ReadableStream<Uint8Array> | null,
  limit: number
) {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error('body too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
