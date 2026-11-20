import type { QueryClient } from '@tanstack/react-query';
import type { ChatConversation, ChatMessage } from '@tuturuuu/internal-api';
import { mergeCachedMessages, patchCachedMessages } from './hooks-messages';
import { chatQueryKeys } from './query-keys';

/**
 * Events as the chat realtime transports deliver them. Conversation rooms and
 * the local stream carry persisted DTOs; the Worker inbox carries only IDs.
 */
export type ChatRealtimeCacheEvent =
  | {
      conversation: Partial<ChatConversation> | null;
      conversationId?: string | null;
      type: 'conversation.created' | 'conversation.updated';
    }
  | {
      conversationId?: string | null;
      message: Partial<ChatMessage> | null;
      type:
        | 'message.created'
        | 'message.updated'
        | 'message.deleted'
        | 'reaction.updated';
    }
  | {
      conversationId?: string | null;
      result: { conversationId?: string | null } | null;
      type: 'conversation.deleted';
    }
  | {
      conversationId?: string | null;
      type: 'read.updated' | 'member.removed';
      userId?: string;
    };

export function updateConversationSet(
  current: ReadonlySet<string>,
  id: string,
  active: boolean
) {
  if (current.has(id) === active) return current;
  const next = new Set(current);
  if (active) next.add(id);
  else next.delete(id);
  return next;
}

export function refetchActiveChat(queryClient: QueryClient, wsId: string) {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden')
    return;
  void queryClient.refetchQueries(
    { queryKey: chatQueryKeys.all(wsId), type: 'active' },
    { cancelRefetch: false }
  );
}

export function invalidateConversationList(
  queryClient: QueryClient,
  wsId: string
) {
  void queryClient.invalidateQueries({
    queryKey: [...chatQueryKeys.all(wsId), 'conversations'],
  });
}

export function invalidateConversationMessages(
  queryClient: QueryClient,
  wsId: string,
  conversationId: string
) {
  void queryClient.invalidateQueries({
    queryKey: [...chatQueryKeys.all(wsId), 'messages', conversationId],
  });
  void queryClient.invalidateQueries({
    queryKey: [...chatQueryKeys.all(wsId), 'messages-infinite', conversationId],
  });
}

function removeConversation(
  queryClient: QueryClient,
  wsId: string,
  conversationId: string | null | undefined
) {
  if (conversationId) {
    queryClient.setQueriesData<ChatConversation[]>(
      { queryKey: [...chatQueryKeys.all(wsId), 'conversations'] },
      (current) =>
        Array.isArray(current)
          ? current.filter((conversation) => conversation.id !== conversationId)
          : current
    );
  }
  invalidateConversationList(queryClient, wsId);
}

function isFullMessage(message: Partial<ChatMessage> | null | undefined) {
  return Boolean(message?.id && message.conversationId && message.createdAt);
}

function isFullConversation(
  conversation: Partial<ChatConversation> | null | undefined
) {
  return Boolean(conversation?.id && Array.isArray(conversation.members));
}

/** Applies an event that carries persisted DTOs, or refetches when it does not. */
export function applyChatRealtimeEvent(
  queryClient: QueryClient,
  wsId: string,
  event: ChatRealtimeCacheEvent
) {
  switch (event.type) {
    case 'conversation.created':
    case 'conversation.updated': {
      const conversation = event.conversation;
      if (conversation && isFullConversation(conversation)) {
        const full = conversation as ChatConversation;
        queryClient.setQueriesData<ChatConversation[]>(
          { queryKey: [...chatQueryKeys.all(wsId), 'conversations'] },
          (current) =>
            Array.isArray(current)
              ? [full, ...current.filter((item) => item.id !== full.id)]
              : current
        );
      }
      invalidateConversationList(queryClient, wsId);
      return;
    }
    case 'conversation.deleted':
      removeConversation(
        queryClient,
        wsId,
        event.result?.conversationId ?? event.conversationId
      );
      return;
    case 'message.created':
    case 'message.updated':
    case 'message.deleted':
    case 'reaction.updated': {
      const conversationId =
        event.message?.conversationId ?? event.conversationId;
      if (isFullMessage(event.message)) {
        const message = event.message as ChatMessage;
        patchCachedMessages(
          queryClient,
          wsId,
          message.conversationId,
          (current) => mergeCachedMessages(current, [message])
        );
      }
      if (conversationId) {
        invalidateConversationMessages(queryClient, wsId, conversationId);
        void queryClient.invalidateQueries({
          queryKey: chatQueryKeys.sharedContent(wsId, conversationId),
        });
      }
      invalidateConversationList(queryClient, wsId);
      return;
    }
    case 'read.updated':
    case 'member.removed':
      invalidateConversationList(queryClient, wsId);
  }
}
