'use client';

import { useQuery } from '@tanstack/react-query';
import {
  type ChatUserProfile,
  searchWorkspaceChatDirectory,
  searchWorkspaceChatMessages,
} from '@tuturuuu/internal-api';
import { chatQueryKeys } from './query-keys';

export function useChatDirectory({
  enabled = true,
  query,
  wsId,
}: {
  enabled?: boolean;
  query: string;
  wsId: string;
}) {
  const normalizedQuery = query.trim();

  return useQuery<ChatUserProfile[]>({
    enabled,
    queryFn: () => searchWorkspaceChatDirectory(wsId, normalizedQuery),
    queryKey: chatQueryKeys.directory(wsId, normalizedQuery),
    staleTime: 30_000,
  });
}

export function useChatMessageSearch({
  query,
  wsId,
}: {
  query: string;
  wsId: string;
}) {
  const normalizedQuery = query.trim();

  return useQuery({
    enabled: normalizedQuery.length >= 2,
    queryFn: () => searchWorkspaceChatMessages(wsId, normalizedQuery),
    queryKey: chatQueryKeys.search(wsId, normalizedQuery),
    staleTime: 15_000,
  });
}
