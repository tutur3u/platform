'use client';

import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import type { ChatConversation, ChatMessage } from '@tuturuuu/internal-api';
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
import { mergeCachedMessages, patchCachedMessages } from './hooks-messages';
import { chatQueryKeys } from './query-keys';

type ChatRealtimeEvent =
  | {
      conversation: ChatConversation;
      type: 'conversation.created' | 'conversation.updated';
    }
  | {
      conversationId?: string | null;
      message: ChatMessage;
      type:
        | 'message.created'
        | 'message.updated'
        | 'message.deleted'
        | 'reaction.updated';
    }
  | {
      result: { conversationId?: string | null };
      type: 'conversation.deleted';
    }
  | {
      type: 'ping' | 'ready';
    }
  | {
      conversationId?: string | null;
      isTyping: boolean;
      type: 'typing.updated';
    }
  | {
      conversationId?: string | null;
      isOnline: boolean;
      type: 'presence.updated';
    }
  | {
      error?: string;
      type: 'error';
    };

export function useChatRealtime(wsId: string) {
  const queryClient = useQueryClient();
  const typingTimeouts = useRef(
    new Map<string, ReturnType<typeof setTimeout>>()
  );
  const [typingConversationIds, setTypingConversationIds] = useState(
    () => new Set<string>()
  );
  const [onlineConversationIds, setOnlineConversationIds] = useState(
    () => new Set<string>()
  );

  useEffect(() => {
    if (!wsId || typeof window === 'undefined') return;

    const source = new EventSource(
      `/api/v1/workspaces/${encodeURIComponent(wsId)}/chat/realtime`
    );

    source.onmessage = (event) => {
      const parsed = parseChatRealtimeEvent(event.data);
      if (!parsed || parsed.type === 'ping' || parsed.type === 'ready') return;
      if (parsed.type === 'error') {
        source.close();
        return;
      }

      if (parsed.type === 'typing.updated' && parsed.conversationId) {
        updateTypingState({
          conversationId: parsed.conversationId,
          isTyping: parsed.isTyping,
          setTypingConversationIds,
          typingTimeouts: typingTimeouts.current,
        });
        return;
      }

      if (parsed.type === 'presence.updated' && parsed.conversationId) {
        setOnlineConversationIds((current) =>
          updateConversationSet(
            current,
            parsed.conversationId ?? '',
            parsed.isOnline
          )
        );
        return;
      }

      applyChatRealtimeEvent(queryClient, wsId, parsed);
    };

    source.onerror = () => {
      source.close();
    };

    const timers = typingTimeouts.current;
    return () => {
      source.close();
      for (const timeout of timers.values()) clearTimeout(timeout);
      timers.clear();
    };
  }, [queryClient, wsId]);

  return { onlineConversationIds, typingConversationIds };
}

function updateTypingState({
  conversationId,
  isTyping,
  setTypingConversationIds,
  typingTimeouts,
}: {
  conversationId: string;
  isTyping: boolean;
  setTypingConversationIds: Dispatch<SetStateAction<Set<string>>>;
  typingTimeouts: Map<string, ReturnType<typeof setTimeout>>;
}) {
  const existing = typingTimeouts.get(conversationId);
  if (existing) clearTimeout(existing);
  typingTimeouts.delete(conversationId);
  setTypingConversationIds((current) =>
    updateConversationSet(current, conversationId, isTyping)
  );
  if (!isTyping) return;
  typingTimeouts.set(
    conversationId,
    setTimeout(() => {
      setTypingConversationIds((current) =>
        updateConversationSet(current, conversationId, false)
      );
      typingTimeouts.delete(conversationId);
    }, 4_000)
  );
}

function updateConversationSet(
  current: Set<string>,
  conversationId: string,
  active: boolean
) {
  const next = new Set(current);
  if (active) next.add(conversationId);
  else next.delete(conversationId);
  return next;
}

function parseChatRealtimeEvent(data: string): ChatRealtimeEvent | null {
  try {
    const parsed = JSON.parse(data) as ChatRealtimeEvent;
    return typeof parsed?.type === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function applyChatRealtimeEvent(
  queryClient: QueryClient,
  wsId: string,
  event: ChatRealtimeEvent
) {
  if (
    event.type === 'conversation.created' ||
    event.type === 'conversation.updated'
  ) {
    upsertConversation(queryClient, wsId, event.conversation);
    return;
  }

  if (event.type === 'conversation.deleted') {
    const conversationId = event.result.conversationId;
    if (!conversationId) {
      queryClient.invalidateQueries({
        queryKey: [...chatQueryKeys.all(wsId), 'conversations'],
      });
      return;
    }

    queryClient.setQueriesData<ChatConversation[]>(
      { queryKey: [...chatQueryKeys.all(wsId), 'conversations'] },
      (current = []) =>
        current.filter((conversation) => conversation.id !== conversationId)
    );
    queryClient.invalidateQueries({
      queryKey: [...chatQueryKeys.all(wsId), 'conversations'],
    });
    return;
  }

  if (
    event.type === 'message.created' ||
    event.type === 'message.updated' ||
    event.type === 'message.deleted' ||
    event.type === 'reaction.updated'
  ) {
    patchMessage(queryClient, wsId, event.message);
    queryClient.invalidateQueries({
      queryKey: [...chatQueryKeys.all(wsId), 'conversations'],
    });
    queryClient.invalidateQueries({
      queryKey: chatQueryKeys.sharedContent(wsId, event.message.conversationId),
    });
  }
}

function upsertConversation(
  queryClient: QueryClient,
  wsId: string,
  conversation: ChatConversation
) {
  queryClient.setQueriesData<ChatConversation[]>(
    { queryKey: [...chatQueryKeys.all(wsId), 'conversations'] },
    (current = []) => {
      const next = current.filter((item) => item.id !== conversation.id);
      return [conversation, ...next];
    }
  );
}

function patchMessage(
  queryClient: QueryClient,
  wsId: string,
  message: ChatMessage
) {
  patchCachedMessages(queryClient, wsId, message.conversationId, (current) =>
    mergeCachedMessages(current, [message])
  );
  queryClient.invalidateQueries({
    queryKey: [...chatQueryKeys.all(wsId), 'messages', message.conversationId],
  });
  queryClient.invalidateQueries({
    queryKey: [
      ...chatQueryKeys.all(wsId),
      'messages-infinite',
      message.conversationId,
    ],
  });
}
