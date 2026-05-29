'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getWorkspaceChatAiObservability,
  getWorkspaceChatAiSettings,
  type UpdateChatAiSettingsPayload,
  updateWorkspaceChatAiSettings,
} from '@tuturuuu/internal-api';
import { chatQueryKeys } from './query-keys';

export function useChatAiSettings({
  conversationId,
  enabled = true,
  wsId,
}: {
  conversationId?: string | null;
  enabled?: boolean;
  wsId: string;
}) {
  return useQuery({
    enabled: enabled && Boolean(conversationId),
    queryFn: () => getWorkspaceChatAiSettings(wsId, conversationId ?? ''),
    queryKey: chatQueryKeys.aiSettings(wsId, conversationId ?? 'none'),
    staleTime: 10_000,
  });
}

export function useUpdateChatAiSettings({
  conversationId,
  wsId,
}: {
  conversationId?: string | null;
  wsId: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateChatAiSettingsPayload) => {
      if (!conversationId) {
        throw new Error('Conversation is required');
      }

      return updateWorkspaceChatAiSettings(wsId, conversationId, payload);
    },
    onSuccess: ({ settings }) => {
      queryClient.setQueryData(
        chatQueryKeys.aiSettings(wsId, settings.conversationId),
        settings
      );
      queryClient.invalidateQueries({
        queryKey: [...chatQueryKeys.all(wsId), 'conversations'],
      });
    },
  });
}

export function useChatAiObservability({
  conversationId,
  enabled = true,
  wsId,
}: {
  conversationId?: string | null;
  enabled?: boolean;
  wsId: string;
}) {
  return useQuery({
    enabled: enabled && Boolean(conversationId),
    queryFn: () => getWorkspaceChatAiObservability(wsId, conversationId ?? ''),
    queryKey: chatQueryKeys.aiObservability(wsId, conversationId ?? 'none'),
    staleTime: 10_000,
  });
}
