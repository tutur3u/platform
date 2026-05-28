'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorkspaceChatFriendRequest,
  listWorkspaceChatFriendRequests,
  respondWorkspaceChatFriendRequest,
} from '@tuturuuu/internal-api';
import { chatQueryKeys } from './query-keys';

export function useChatFriendRequests(wsId: string) {
  return useQuery({
    queryFn: () => listWorkspaceChatFriendRequests(wsId),
    queryKey: chatQueryKeys.friendRequests(wsId),
    staleTime: 30_000,
  });
}

export function useCreateChatFriendRequest(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (email: string) =>
      createWorkspaceChatFriendRequest(wsId, { email }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: chatQueryKeys.friendRequests(wsId),
      });
      queryClient.invalidateQueries({
        queryKey: chatQueryKeys.conversations(wsId),
      });
    },
  });
}

export function useRespondChatFriendRequest(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      requestId,
      status,
    }: {
      requestId: string;
      status: 'accepted' | 'declined';
    }) => respondWorkspaceChatFriendRequest(wsId, requestId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: chatQueryKeys.friendRequests(wsId),
      });
      queryClient.invalidateQueries({
        queryKey: chatQueryKeys.conversations(wsId),
      });
    },
  });
}
