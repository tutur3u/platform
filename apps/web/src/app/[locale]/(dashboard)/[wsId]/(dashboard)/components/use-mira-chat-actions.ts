'use client';

import { useMutation } from '@tanstack/react-query';
import type { UIMessage } from '@tuturuuu/ai/types';
import type { AIChat, AIModelUI } from '@tuturuuu/types';
import { toast } from '@tuturuuu/ui/sonner';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback } from 'react';
import { resetGenerativeUIStore } from '@/components/json-render/generative-ui-store';
import type { MessageFileAttachment } from './file-preview-chips';
import type { ThinkingMode } from './mira-chat-constants';
import {
  STORAGE_KEY_PREFIX,
  WORKSPACE_CONTEXT_EVENT,
  WORKSPACE_CONTEXT_STORAGE_KEY_PREFIX,
} from './mira-chat-constants';
import { exportMiraChat } from './mira-chat-export';

interface UseMiraChatActionsParams {
  chat?: Partial<AIChat>;
  chatId: string;
  clearAttachedFiles: () => void;
  cleanupPendingUploads: () => Promise<void>;
  fallbackChatId: string;
  gatewayModelId: string;
  messageAttachments: Map<string, MessageFileAttachment[]>;
  messages: UIMessage[];
  model: AIModelUI;
  sendMessageWithCurrentConfig: (message: UIMessage) => void | Promise<void>;
  setChat: Dispatch<SetStateAction<Partial<AIChat> | undefined>>;
  setFallbackChatId: (value: string) => void;
  setInput: (value: string) => void;
  setMessageAttachments: Dispatch<
    SetStateAction<Map<string, MessageFileAttachment[]>>
  >;
  setPendingPrompt: (value: string | null) => void;
  setStoredChatId: (value: string | null) => void;
  setWorkspaceContextId: (value: string) => void;
  stableChatId: string;
  status: string;
  t: (...args: any[]) => string;
  thinkingMode: ThinkingMode;
  wsId: string;
}

export function useMiraChatActions({
  chat,
  chatId,
  clearAttachedFiles,
  cleanupPendingUploads,
  fallbackChatId,
  gatewayModelId,
  messageAttachments,
  messages,
  model,
  sendMessageWithCurrentConfig,
  setChat,
  setFallbackChatId,
  setInput,
  setMessageAttachments,
  setPendingPrompt,
  setStoredChatId,
  setWorkspaceContextId,
  stableChatId,
  status,
  t,
  thinkingMode,
  wsId,
}: UseMiraChatActionsParams) {
  const { mutateAsync: createChatMutation } = useMutation({
    mutationFn: async (userInput: string) => {
      const res = await fetch('/api/ai/chat/new', {
        credentials: 'include',
        cache: 'no-store',
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: stableChatId,
          model: gatewayModelId,
          message: userInput,
          isMiraMode: true,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          thinkingMode,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to create chat');
      }

      const data = await res.json();
      if (!data.id) {
        console.error('[Mira Chat] Chat creation returned no id', {
          stableChatId,
          gatewayModelId,
        });
        throw new Error('Chat creation returned no id');
      }
      return {
        id: data.id as string,
        title: data.title as string | undefined,
        userInput,
      };
    },
    onSuccess: (data, userInput) => {
      setChat({
        id: data.id,
        title: data.title,
        model: gatewayModelId,
        is_public: false,
      });
      setStoredChatId(data.id);
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${wsId}`, data.id);
      sendMessageWithCurrentConfig({
        id: generateRandomUUID(),
        role: 'user',
        parts: [{ type: 'text', text: userInput }],
      });
      setPendingPrompt(null);
    },
    onError: () => {
      toast.error(t('error'));
      setPendingPrompt(null);
    },
  });

  const createChat = useCallback(
    async (userInput: string) => {
      setPendingPrompt(userInput);
      await createChatMutation(userInput).catch(() => {});
    },
    [setPendingPrompt, createChatMutation]
  );

  const resetConversationState = useCallback(() => {
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${wsId}`);
    localStorage.setItem(
      `${WORKSPACE_CONTEXT_STORAGE_KEY_PREFIX}${wsId}`,
      'personal'
    );
    window.dispatchEvent(
      new CustomEvent(WORKSPACE_CONTEXT_EVENT, {
        detail: { wsId, workspaceContextId: 'personal' },
      })
    );
    setChat(undefined);
    setStoredChatId(null);
    setPendingPrompt(null);
    setWorkspaceContextId('personal');
    setInput('');
    clearAttachedFiles();
    setMessageAttachments(new Map());
    resetGenerativeUIStore();
    setFallbackChatId(generateRandomUUID());
    return cleanupPendingUploads();
  }, [
    clearAttachedFiles,
    cleanupPendingUploads,
    setChat,
    setFallbackChatId,
    setInput,
    setMessageAttachments,
    setPendingPrompt,
    setStoredChatId,
    setWorkspaceContextId,
    wsId,
  ]);

  const handleExportChat = useCallback(() => {
    exportMiraChat({
      chat: chat ?? null,
      chatId,
      fallbackChatId,
      messageAttachments,
      messages,
      model,
      status,
      t: t as any,
      thinkingMode,
      wsId,
    });
  }, [
    chat,
    chatId,
    fallbackChatId,
    messageAttachments,
    messages,
    model,
    status,
    t,
    thinkingMode,
    wsId,
  ]);

  return {
    createChat,
    handleExportChat,
    resetConversationState,
  };
}
