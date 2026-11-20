import 'server-only';

import type { ChatRealtimeEvent } from '@tuturuuu/realtime/chat';
import {
  CHAT_REALTIME_INBOX_MAX_TTL_SECONDS,
  CHAT_REALTIME_PUBLISH_MAX_TTL_SECONDS,
  CHAT_REALTIME_SECRET_MIN_LENGTH,
  CHAT_REALTIME_SUBSCRIBE_MAX_TTL_SECONDS,
  CHAT_REALTIME_TICKET_AUDIENCE,
  chatRealtimeBodyDigest,
  signChatRealtimeTicket,
} from '@tuturuuu/realtime/chat/ticket';
import { z } from 'zod';

const MAX_PUBLISH_BYTES = 64 * 1024;
const PUBLISH_TIMEOUT_MS = 2_000;
const publishResponseSchema = z.object({
  foregroundUserIds: z.array(z.uuid()).max(500),
  ok: z.literal(true),
});

export function isChatRealtimeWorkerConfigured() {
  return Boolean(process.env.CHAT_REALTIME_URL?.trim());
}

function getWorkerConfig() {
  const rawUrl = process.env.CHAT_REALTIME_URL?.trim();
  const secret = process.env.CHAT_REALTIME_TOKEN_SECRET?.trim();
  if (!rawUrl || !secret || secret.length < CHAT_REALTIME_SECRET_MIN_LENGTH) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const localHttp =
    process.env.NODE_ENV !== 'production' &&
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !localHttp) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    return null;
  }

  return { secret, url };
}

export async function isChatRealtimeWorkerReady(signal: AbortSignal) {
  const config = getWorkerConfig();
  if (!config) return false;

  const response = await fetch(new URL('/health', config.url), {
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(PUBLISH_TIMEOUT_MS)]),
  });
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error(`Chat realtime Worker health returned ${response.status}`);
  }
  const health = z
    .object({ ok: z.literal(true), stopped: z.boolean() })
    .parse(await response.json());
  return !health.stopped;
}

export async function createChatRealtimeSubscribeTicket(input: {
  conversationId?: string;
  userId: string;
  wsId: string;
}) {
  const config = getWorkerConfig();
  if (!config) return null;

  const iat = Math.floor(Date.now() / 1_000);
  const exp =
    iat +
    (input.conversationId
      ? CHAT_REALTIME_SUBSCRIBE_MAX_TTL_SECONDS
      : CHAT_REALTIME_INBOX_MAX_TTL_SECONDS);
  const ticket = await signChatRealtimeTicket(
    {
      aud: CHAT_REALTIME_TICKET_AUDIENCE,
      conversationId: input.conversationId?.toLowerCase(),
      exp,
      iat,
      kind: 'subscribe',
      room: input.conversationId ? 'conversation' : 'inbox',
      userId: input.userId.toLowerCase(),
      v: 1,
      wsId: input.wsId.toLowerCase(),
    },
    config.secret
  );

  const url = new URL('/v1/connect', config.url);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return {
    expiresAt: new Date(exp * 1_000).toISOString(),
    ticket,
    url: url.href,
  };
}

export async function publishChatRealtimeWorkerEvent(
  event: ChatRealtimeEvent,
  callerSignal?: AbortSignal
) {
  const config = getWorkerConfig();
  if (!config) return [];

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
  if (new TextEncoder().encode(body).byteLength > MAX_PUBLISH_BYTES) return [];

  const iat = Math.floor(Date.now() / 1_000);
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
    config.secret
  );

  const timeout = AbortSignal.timeout(PUBLISH_TIMEOUT_MS);
  const response = await fetch(new URL('/v1/publish', config.url), {
    body,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
    redirect: 'error',
    signal: callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout,
  });
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error(`Chat realtime Worker returned ${response.status}`);
  }

  const result = publishResponseSchema.parse(await response.json());
  return result.foregroundUserIds;
}
