'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getWorkspaceChatLinkPreviews,
  getWorkspaceChatSharedContent,
} from '@tuturuuu/internal-api';
import { chatQueryKeys } from './query-keys';

export function useChatLinkPreviews({
  conversationId,
  urls,
  wsId,
}: {
  conversationId?: string | null;
  urls: string[];
  wsId: string;
}) {
  const normalizedUrls = Array.from(new Set(urls)).slice(0, 5);

  return useQuery({
    queryKey: conversationId
      ? chatQueryKeys.linkPreviews(wsId, conversationId, normalizedUrls)
      : chatQueryKeys.linkPreviews(wsId, 'none', normalizedUrls),
    queryFn: () => {
      if (!conversationId) return [];
      return getWorkspaceChatLinkPreviews(wsId, conversationId, normalizedUrls);
    },
    enabled: Boolean(conversationId && normalizedUrls.length > 0),
    staleTime: 1000 * 60 * 60,
  });
}

export function useChatSharedContent({
  conversationId,
  enabled = true,
  wsId,
}: {
  conversationId?: string | null;
  enabled?: boolean;
  wsId: string;
}) {
  return useQuery({
    queryKey: conversationId
      ? chatQueryKeys.sharedContent(wsId, conversationId)
      : chatQueryKeys.sharedContent(wsId, 'none'),
    queryFn: () => {
      if (!conversationId) {
        return { files: [], links: [], photos: [] };
      }

      return getWorkspaceChatSharedContent(wsId, conversationId);
    },
    enabled: Boolean(enabled && conversationId),
  });
}
