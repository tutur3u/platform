import type { ChatRealtimeEvent } from './index';
import {
  CHAT_REALTIME_PUBLISH_MAX_TTL_SECONDS,
  CHAT_REALTIME_TICKET_AUDIENCE,
  chatRealtimeBodyDigest,
  signChatRealtimeTicket,
} from './ticket';

const MAX_PUBLISH_BYTES = 64 * 1024;

export async function prepareChatRealtimePublish(
  event: ChatRealtimeEvent,
  secret: string,
  now: number
) {
  const wsId = event.wsId.toLowerCase();
  const body = JSON.stringify({
    ...event,
    actorUserId: event.actorUserId?.toLowerCase(),
    audience:
      event.audience.scope === 'users'
        ? {
            scope: 'users',
            userIds: event.audience.userIds.map((id) => id.toLowerCase()),
          }
        : event.audience,
    conversationId: event.conversationId?.toLowerCase(),
    ...('userId' in event ? { userId: event.userId.toLowerCase() } : {}),
    ...('messageId' in event
      ? { messageId: event.messageId?.toLowerCase() }
      : {}),
    wsId,
  });
  if (new TextEncoder().encode(body).byteLength > MAX_PUBLISH_BYTES)
    return null;

  const iat = Math.floor(now / 1_000);
  const token = await signChatRealtimeTicket(
    {
      aud: CHAT_REALTIME_TICKET_AUDIENCE,
      bodySha256: await chatRealtimeBodyDigest(body),
      exp: iat + CHAT_REALTIME_PUBLISH_MAX_TTL_SECONDS,
      iat,
      kind: 'publish',
      v: 1,
      wsId,
    },
    secret
  );

  return { body, token };
}
