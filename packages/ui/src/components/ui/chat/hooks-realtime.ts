'use client';

import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import type { ChatConversation, ChatMessage } from '@tuturuuu/internal-api';
import { useEffect } from 'react';
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
      error?: string;
      type: 'error';
    };

export function useChatRealtime(wsId: string) {
  const queryClient = useQueryClient();

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

      applyChatRealtimeEvent(queryClient, wsId, parsed);
    };

    source.onerror = () => {
      source.close();
    };

    return () => source.close();
  }, [queryClient, wsId]);
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
  queryClient.setQueriesData<ChatMessage[]>(
    {
      queryKey: [
        ...chatQueryKeys.all(wsId),
        'messages',
        message.conversationId,
      ],
    },
    (current = []) => {
      const existingIndex = current.findIndex((item) => item.id === message.id);
      if (existingIndex < 0) return [...current, message];

      return current.map((item, index) =>
        index === existingIndex ? message : item
      );
    }
  );
}
