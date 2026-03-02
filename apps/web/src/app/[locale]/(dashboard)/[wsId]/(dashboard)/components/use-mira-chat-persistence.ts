'use client';

import { useQuery } from '@tanstack/react-query';
import type { UIMessage } from '@tuturuuu/ai/types';
import type { AIChat } from '@tuturuuu/types';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';
import type { MessageFileAttachment } from './file-preview-chips';
import { STORAGE_KEY_PREFIX } from './mira-chat-constants';
import { loadExistingChat } from './mira-chat-persistence-utils';

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
  const [storedChatId, setStoredChatId] = useState<string | null>(null);

  useEffect(() => {
    setStoredChatId(localStorage.getItem(`${STORAGE_KEY_PREFIX}${wsId}`));
  }, [wsId]);

  const restoredChatQuery = useQuery({
    queryKey: ['mira-chat-restore', wsId, storedChatId],
    queryFn: async () => {
      if (!storedChatId) return null;
      return loadExistingChat({ wsId, storedChatId });
    },
    enabled: storedChatId != null,
    staleTime: Infinity,
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

    if (!restoredChatQuery.data) return;

    setInitialMessages(restoredChatQuery.data.messages);
    setChat(restoredChatQuery.data.chat);
    setMessageAttachments(restoredChatQuery.data.messageAttachments);
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
