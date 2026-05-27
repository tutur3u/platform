'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ChatConversation,
  type CreateChatConversationPayload,
  createWorkspaceChatConversation,
  listWorkspaceChatConversations,
  markWorkspaceChatConversationRead,
} from '@tuturuuu/internal-api';
import { chatQueryKeys } from './query-keys';

export function useChatConversations(wsId: string) {
  return useQuery({
    queryFn: () => listWorkspaceChatConversations(wsId),
    queryKey: chatQueryKeys.conversations(wsId),
    staleTime: 15_000,
  });
}

export function useCreateChatConversation(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateChatConversationPayload) =>
      createWorkspaceChatConversation(wsId, payload),
    onSuccess: ({ conversation }) => {
      queryClient.setQueryData<ChatConversation[]>(
        chatQueryKeys.conversations(wsId),
        (current = []) => {
          const withoutDuplicate = current.filter(
            (item) => item.id !== conversation.id
          );
          return [conversation, ...withoutDuplicate];
        }
      );
      queryClient.invalidateQueries({
        queryKey: chatQueryKeys.conversations(wsId),
      });
    },
  });
}

export function useMarkChatConversationRead({
  conversationId,
  wsId,
}: {
  conversationId?: string | null;
  wsId: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (messageId?: string | null) => {
      if (!conversationId) {
        throw new Error('Conversation is required');
      }

      return markWorkspaceChatConversationRead(wsId, conversationId, {
        messageId,
      });
    },
    onSuccess: ({ conversation }) => {
      queryClient.setQueryData<ChatConversation[]>(
        chatQueryKeys.conversations(wsId),
        (current = []) =>
          current.map((item) =>
            item.id === conversation.id ? conversation : item
          )
      );
    },
  });
}
