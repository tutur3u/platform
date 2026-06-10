'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type CreateChatIntegrationPayload,
  createChatIntegration,
} from '@tuturuuu/internal-api';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { chatQueryKeys } from './query-keys';

const AGENT_DETAILS_QUERY_KEY = ['chat', 'infrastructure-ai-agents'] as const;

export function useCreateChatIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateChatIntegrationPayload) =>
      createChatIntegration(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...chatQueryKeys.all(ROOT_WORKSPACE_ID), 'conversations'],
      });
      queryClient.invalidateQueries({
        queryKey: AGENT_DETAILS_QUERY_KEY,
      });
    },
  });
}
