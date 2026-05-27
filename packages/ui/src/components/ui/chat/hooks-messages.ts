'use client';

import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  type ChatAttachmentDraft,
  type ChatMessage,
  deleteWorkspaceChatMessage,
  editWorkspaceChatMessage,
  listWorkspaceChatConversationMessages,
  sendWorkspaceChatMessage,
  toggleWorkspaceChatReaction,
} from '@tuturuuu/internal-api';
import { chatQueryKeys } from './query-keys';

export function useChatMessages({
  conversationId,
  limit = 80,
  wsId,
}: {
  conversationId?: string | null;
  limit?: number;
  wsId: string;
}) {
  return useQuery({
    enabled: Boolean(conversationId),
    queryFn: () =>
      listWorkspaceChatConversationMessages(wsId, conversationId ?? '', {
        limit,
      }),
    queryKey: chatQueryKeys.messages(wsId, conversationId ?? 'none', limit),
    staleTime: 5_000,
  });
}

export function useSendChatMessage({
  conversationId,
  wsId,
}: {
  conversationId?: string | null;
  wsId: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      attachments?: ChatAttachmentDraft[];
      content: string;
      kind?: 'assistant' | 'system' | 'user';
      replyToMessageId?: string | null;
    }) => {
      if (!conversationId) {
        throw new Error('Conversation is required');
      }

      return sendWorkspaceChatMessage(wsId, conversationId, payload);
    },
    onSuccess: ({ message }) => {
      queryClient.setQueriesData<ChatMessage[]>(
        {
          queryKey: [
            ...chatQueryKeys.all(wsId),
            'messages',
            message.conversationId,
          ],
        },
        (current = []) => {
          if (current.some((item) => item.id === message.id)) return current;
          return [...current, message];
        }
      );
      queryClient.invalidateQueries({
        queryKey: chatQueryKeys.conversations(wsId),
      });
    },
  });
}

export function useEditChatMessage({
  conversationId,
  wsId,
}: {
  conversationId?: string | null;
  wsId: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { content: string; messageId: string }) => {
      if (!conversationId) {
        throw new Error('Conversation is required');
      }

      return editWorkspaceChatMessage(wsId, conversationId, payload.messageId, {
        content: payload.content,
      });
    },
    onSuccess: ({ message }) => {
      patchCachedMessage(queryClient, wsId, message);
    },
  });
}

export function useDeleteChatMessage({
  conversationId,
  wsId,
}: {
  conversationId?: string | null;
  wsId: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) => {
      if (!conversationId) {
        throw new Error('Conversation is required');
      }

      return deleteWorkspaceChatMessage(wsId, conversationId, messageId);
    },
    onSuccess: ({ message }) => {
      patchCachedMessage(queryClient, wsId, message);
      queryClient.invalidateQueries({
        queryKey: chatQueryKeys.conversations(wsId),
      });
    },
  });
}

export function useToggleChatReaction({
  conversationId,
  wsId,
}: {
  conversationId?: string | null;
  wsId: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { emoji: string; messageId: string }) => {
      if (!conversationId) {
        throw new Error('Conversation is required');
      }

      return toggleWorkspaceChatReaction(wsId, conversationId, payload);
    },
    onSuccess: ({ message }) => {
      patchCachedMessage(queryClient, wsId, message);
    },
  });
}

function patchCachedMessage(
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
    (current = []) =>
      current.map((item) => (item.id === message.id ? message : item))
  );
}
