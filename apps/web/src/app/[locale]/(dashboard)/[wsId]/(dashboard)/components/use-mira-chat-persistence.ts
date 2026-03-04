'use client';

import { useQuery } from '@tanstack/react-query';
import type { UIMessage } from '@tuturuuu/ai/types';
import type { AIChat } from '@tuturuuu/types';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';
import type { MessageFileAttachment } from './file-preview-chips';
import { STORAGE_KEY_PREFIX } from './mira-chat-constants';
import {
  loadExistingChat,
  mergeMessageAttachmentMaps,
} from './mira-chat-persistence-utils';

interface UseMiraChatPersistenceParams {
  wsId: string;
  setMessageAttachments: Dispatch<
    SetStateAction<Map<string, MessageFileAttachment[]>>
  >;
}

export function useMiraChatPersistence({
  wsId,
  setMessageAttachments,
}: UseMiraChatPersistenceParams) {
  const [chat, setChat] = useState<Partial<AIChat> | undefined>();
  const [fallbackChatId, setFallbackChatId] = useState(generateRandomUUID);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [storedChatId, setStoredChatId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(`${STORAGE_KEY_PREFIX}${wsId}`);
  });

  // Re-read from localStorage when wsId changes
  // (lazy initializer only runs on first mount)
  const [trackedWsId, setTrackedWsId] = useState(wsId);
  if (wsId !== trackedWsId) {
    setTrackedWsId(wsId);
    const nextId =
      typeof window !== 'undefined'
        ? localStorage.getItem(`${STORAGE_KEY_PREFIX}${wsId}`)
        : null;
    setStoredChatId(nextId);
  }

  const restoredChatQuery = useQuery({
    queryKey: ['mira-chat-restore', wsId, storedChatId],
    queryFn: async () => {
      if (!storedChatId) return null;
      return loadExistingChat({ wsId, storedChatId });
    },
    enabled: storedChatId != null,
    // Always refetch from Supabase on mount so that navigating away and back
    // restores the full conversation (including messages sent during the
    // previous session that are not in the stale TanStack cache).
    staleTime: 0,
    gcTime: 0,
  });

  useEffect(() => {
    if (!storedChatId) {
      setInitialMessages([]);
      setChat(undefined);
      setMessageAttachments(new Map());
      return;
    }

    if (restoredChatQuery.data === null) {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${wsId}`);
      setStoredChatId(null);
      setInitialMessages([]);
      setChat(undefined);
      setMessageAttachments(new Map());
      return;
    }

    const restoredChat = restoredChatQuery.data;
    if (!restoredChat) return;

    setInitialMessages(restoredChat.messages);
    setChat(restoredChat.chat);
    setMessageAttachments((prev) =>
      mergeMessageAttachmentMaps(prev, restoredChat.messageAttachments)
    );
  }, [restoredChatQuery.data, setMessageAttachments, storedChatId, wsId]);

  return {
    chat,
    fallbackChatId,
    initialMessages,
    pendingPrompt,
    setChat,
    setFallbackChatId,
    setPendingPrompt,
    setStoredChatId,
    storedChatId,
  };
}
