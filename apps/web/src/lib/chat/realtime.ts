import 'server-only';

import type {
  ChatRealtimeAudience,
  ChatRealtimeEvent,
} from '@tuturuuu/realtime/chat';
import { chatRealtimeEventSchema } from '@tuturuuu/realtime/chat';
import { signChatRealtimeToken } from '@tuturuuu/realtime/chat/token';
import type { ChatConversation } from '@/lib/chat/private-rpc';
import { serverLogger } from '@/lib/infrastructure/log-drain';

const TOKEN_TTL_MS = 10 * 60_000;
const DEFAULT_CHAT_REALTIME_INTERNAL_URL =
  process.env.NODE_ENV === 'production'
    ? 'http://chat-realtime:7817'
    : 'http://localhost:7817';

type ChatRealtimeEventInput = ChatRealtimeEvent extends infer Event
  ? Event extends ChatRealtimeEvent
    ? Omit<Event, 'id' | 'sentAt'>
    : never
  : never;

function getChatRealtimeTokenSecret() {
  const secret =
    process.env.CHAT_REALTIME_TOKEN_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  if (secret?.trim()) {
    return secret.trim();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Chat realtime token signing requires CHAT_REALTIME_TOKEN_SECRET or the platform Supabase service secret in production'
    );
  }

  return 'chat-local-development-token-secret';
}

function getChatRealtimeInternalBaseUrl() {
  const configured =
    process.env.CHAT_REALTIME_INTERNAL_URL || process.env.CHAT_REALTIME_URL;

  return (configured || DEFAULT_CHAT_REALTIME_INTERNAL_URL).replace(
    /\/+$/u,
    ''
  );
}

function signChatRealtimeAccess(input: {
  scopes: string[];
  userId: string;
  wsId: string;
}) {
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  const token = signChatRealtimeToken(
    {
      exp: Math.floor(expiresAt.getTime() / 1000),
      scopes: input.scopes,
      userId: input.userId,
      wsId: input.wsId,
    },
    getChatRealtimeTokenSecret()
  );

  return { expiresAt, token };
}

export function getChatRealtimeAudience(
  conversation: Pick<ChatConversation, 'createdBy' | 'members' | 'type'>
): ChatRealtimeAudience {
  if (conversation.type === 'channel') {
    return { scope: 'workspace' };
  }

  const userIds = new Set<string>();
  for (const member of conversation.members) {
    userIds.add(member.userId);
  }

  if (conversation.createdBy) {
    userIds.add(conversation.createdBy);
  }

  return { scope: 'users', userIds: [...userIds] };
}

export function getChatRealtimeUserAudience(
  userId: string
): ChatRealtimeAudience {
  return { scope: 'users', userIds: [userId] };
}

export function getChatRealtimeSubscribeUrl(input: {
  userId: string;
  wsId: string;
}) {
  const signed = signChatRealtimeAccess({
    scopes: ['subscribe'],
    userId: input.userId,
    wsId: input.wsId,
  });
  const url = new URL(`${getChatRealtimeInternalBaseUrl()}/realtime`);
  url.searchParams.set('token', signed.token);
  return { expiresAt: signed.expiresAt, url };
}

export async function publishChatRealtimeEvent(event: ChatRealtimeEventInput) {
  const parsed = chatRealtimeEventSchema.parse({
    ...event,
    id: crypto.randomUUID(),
    sentAt: new Date().toISOString(),
  });
  const signed = signChatRealtimeAccess({
    scopes: ['publish'],
    userId: parsed.actorUserId ?? '00000000-0000-0000-0000-000000000000',
    wsId: parsed.wsId,
  });

  try {
    const response = await fetch(
      `${getChatRealtimeInternalBaseUrl()}/publish`,
      {
        body: JSON.stringify(parsed),
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${signed.token}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }
    );

    if (!response.ok) {
      serverLogger.error('Chat realtime publish failed', {
        conversationId: parsed.conversationId,
        status: response.status,
        type: parsed.type,
        wsId: parsed.wsId,
      });
    }
  } catch (error) {
    serverLogger.error('Chat realtime publish failed', {
      conversationId: parsed.conversationId,
      error,
      type: parsed.type,
      wsId: parsed.wsId,
    });
  }
}
