import 'server-only';

import type {
  ChatRealtimeAudience,
  ChatRealtimeEvent,
} from '@tuturuuu/realtime/chat';
import { chatRealtimeEventSchema } from '@tuturuuu/realtime/chat';
import { signChatRealtimeToken } from '@tuturuuu/realtime/chat/token';
import type { ChatConversation } from '@/lib/chat/private-rpc';
import {
  isChatRealtimeWorkerConfigured,
  publishChatRealtimeWorkerEvent,
} from './realtime-worker';

const TOKEN_TTL_MS = 10 * 60_000;
let warnedAboutMissingRealtimeUrl = false;

type ChatRealtimePublishAudience = ChatRealtimeAudience & {
  conversationWorkspaceId?: string;
};

type ChatRealtimeEventInput = ChatRealtimeEvent extends infer Event
  ? Event extends ChatRealtimeEvent
    ? Omit<Event, 'audience' | 'id' | 'sentAt'> & {
        audience: ChatRealtimePublishAudience;
      }
    : never
  : never;

function getChatRealtimeTokenSecret() {
  if (
    isChatRealtimeWorkerConfigured() ||
    process.env.NODE_ENV === 'production'
  ) {
    return null;
  }
  const secret =
    process.env.CHAT_REALTIME_TOKEN_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  return secret?.trim() || 'chat-local-development-token-secret';
}

export function getChatRealtimeInternalBaseUrl() {
  if (
    isChatRealtimeWorkerConfigured() ||
    process.env.NODE_ENV === 'production'
  ) {
    return null;
  }
  const configured = process.env.CHAT_REALTIME_INTERNAL_URL?.trim();
  return configured?.replace(/\/+$/u, '') || 'http://localhost:7817';
}

function signChatRealtimeAccess(input: {
  scopes: string[];
  userId: string;
  wsId: string;
}) {
  const secret = getChatRealtimeTokenSecret();
  if (!secret) return null;

  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  const token = signChatRealtimeToken(
    {
      exp: Math.floor(expiresAt.getTime() / 1000),
      scopes: input.scopes,
      userId: input.userId,
      wsId: input.wsId,
    },
    secret
  );

  return { expiresAt, token };
}

export function getChatRealtimeAudience(
  conversation: Pick<
    ChatConversation,
    'createdBy' | 'members' | 'type' | 'wsId'
  >
): ChatRealtimePublishAudience {
  const useWorker = isChatRealtimeWorkerConfigured();
  if (conversation.type === 'channel' && !useWorker) {
    return { scope: 'workspace' };
  }

  const userIds = new Set<string>();
  for (const member of conversation.members) {
    if (!useWorker || !member.archivedAt) userIds.add(member.userId);
  }

  if (conversation.createdBy && !useWorker) {
    userIds.add(conversation.createdBy);
  }

  return {
    scope: 'users',
    userIds: [...userIds],
    ...(useWorker ? { conversationWorkspaceId: conversation.wsId } : {}),
  };
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
  const baseUrl = getChatRealtimeInternalBaseUrl();
  if (!baseUrl) return null;

  const signed = signChatRealtimeAccess({
    scopes: ['subscribe'],
    userId: input.userId,
    wsId: input.wsId,
  });
  if (!signed) return null;
  const url = new URL(`${baseUrl}/realtime`);
  url.searchParams.set('token', signed.token);
  return { expiresAt: signed.expiresAt, url };
}

export async function publishChatRealtimeEvent(
  event: ChatRealtimeEventInput,
  options: { signal?: AbortSignal } = {}
) {
  const useWorker = isChatRealtimeWorkerConfigured();
  const baseUrl = getChatRealtimeInternalBaseUrl();
  if (!useWorker && !baseUrl) {
    if (!warnedAboutMissingRealtimeUrl) {
      warnedAboutMissingRealtimeUrl = true;
      console.warn(
        'Chat realtime publishing disabled because no URL is configured'
      );
    }
    return [];
  }

  try {
    const parsed = chatRealtimeEventSchema.parse({
      ...event,
      id: crypto.randomUUID(),
      sentAt: new Date().toISOString(),
      wsId:
        useWorker &&
        event.conversationId &&
        event.audience.conversationWorkspaceId
          ? event.audience.conversationWorkspaceId
          : event.wsId,
    });
    if (useWorker) {
      return await publishChatRealtimeWorkerEvent(parsed, options.signal);
    }
    if (!baseUrl) return [];

    const signed = signChatRealtimeAccess({
      scopes: ['publish'],
      userId: parsed.actorUserId ?? '00000000-0000-0000-0000-000000000000',
      wsId: parsed.wsId,
    });
    if (!signed) return [];
    const response = await fetch(`${baseUrl}/publish`, {
      body: JSON.stringify(parsed),
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${signed.token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: options.signal,
    });

    if (!response.ok) {
      console.error('Chat realtime publish failed', {
        conversationId: parsed.conversationId,
        status: response.status,
        type: parsed.type,
        wsId: parsed.wsId,
      });
    }
  } catch (error) {
    console.error('Chat realtime publish failed', {
      conversationId: event.conversationId,
      error,
      type: event.type,
      wsId: event.wsId,
    });
  }
  return [];
}
