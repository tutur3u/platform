'use client';

import { useMutation } from '@tanstack/react-query';
import {
  getWorkspaceChatAttachmentSignedUrl,
  uploadWorkspaceChatAttachment,
} from '@tuturuuu/internal-api';

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
