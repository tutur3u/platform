'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  getWorkspaceChatAttachmentSignedUrl,
  uploadWorkspaceChatAttachment,
} from '@tuturuuu/internal-api';
import { chatQueryKeys } from './query-keys';

export function useUploadChatAttachment({
  conversationId,
  wsId,
}: {
  conversationId?: string | null;
  wsId: string;
}) {
  return useMutation({
    mutationFn: (file: File) => {
      if (!conversationId) {
        throw new Error('Conversation is required');
      }

      return uploadWorkspaceChatAttachment(wsId, conversationId, file);
    },
  });
}

export function useOpenChatAttachment({
  conversationId,
  wsId,
}: {
  conversationId?: string | null;
  wsId: string;
}) {
  return useMutation({
    mutationFn: async (attachmentId: string) => {
      if (!conversationId) {
        throw new Error('Conversation is required');
      }

      const signedUrl = await getWorkspaceChatAttachmentSignedUrl(
        wsId,
        conversationId,
        attachmentId
      );
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
      return signedUrl;
    },
  });
}

export function useChatAttachmentSignedUrl({
  attachmentId,
  conversationId,
  enabled = true,
  wsId,
}: {
  attachmentId?: string | null;
  conversationId?: string | null;
  enabled?: boolean;
  wsId: string;
}) {
  return useQuery({
    enabled: Boolean(enabled && attachmentId && conversationId),
    queryFn: () => {
      if (!attachmentId || !conversationId) {
        throw new Error('Attachment is required');
      }

      return getWorkspaceChatAttachmentSignedUrl(
        wsId,
        conversationId,
        attachmentId
      );
    },
    queryKey: chatQueryKeys.attachmentUrl(
      wsId,
      conversationId ?? 'none',
      attachmentId ?? 'none'
    ),
    staleTime: 5 * 60 * 1000,
  });
}
