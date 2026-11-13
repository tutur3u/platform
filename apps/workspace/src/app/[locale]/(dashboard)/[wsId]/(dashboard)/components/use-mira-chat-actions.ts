'use client';

import { useMutation } from '@tanstack/react-query';
import type { UIMessage } from '@tuturuuu/ai/types';
import { createChatGPTChat } from '@tuturuuu/internal-api/chatgpt';
import type { AIChat, AIModelUI } from '@tuturuuu/types';
import { toast } from '@tuturuuu/ui/sonner';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useRef } from 'react';
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
  sendMessageWithCurrentConfig: (
    message: UIMessage
  ) => void | Promise<void> | Promise<boolean>;
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
  const pendingOwnerRef = useRef<{ workspace: string } | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const workspaceRef = useRef(wsId);
  if (workspaceRef.current !== wsId) generationRef.current++;
  workspaceRef.current = wsId;
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current++;
      pendingOwnerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const owner = pendingOwnerRef.current;
    if (owner && owner.workspace !== wsId) {
      pendingOwnerRef.current = null;
      setPendingPrompt(null);
    }
  }, [wsId, setPendingPrompt]);

  const { mutateAsync: createChatMutation } = useMutation({
    retry: false,
    mutationFn: async ({
      userInput,
      current,
    }: {
      userInput: string;
      current: () => boolean;
    }) => {
      if (!current()) return null;
      if (gatewayModelId.startsWith('chatgpt/')) {
        const data = await createChatGPTChat({
          id: stableChatId,
          model: gatewayModelId,
          message: userInput,
        });
        return { ...data, userInput };
      }
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
  });

  const createChat = useCallback(
    async (
      userInput: string,
      isCurrent?: () => boolean,
      onChatCreated?: (chatId: string) => void
    ) => {
      const generation = generationRef.current;
      const live = () =>
        mountedRef.current &&
        generation === generationRef.current &&
        workspaceRef.current === wsId;
      if (!live() || !(isCurrent?.() ?? true)) return false;
      if (model.disabled) {
        setInput(userInput);
        return false;
      }
      const owner = { workspace: wsId };
      pendingOwnerRef.current = owner;
      const current = () =>
        live() && pendingOwnerRef.current === owner && (isCurrent?.() ?? true);
      const clearOwnedPrompt = () => {
        // Cancellation revokes dispatch, not cleanup of this attempt's prompt.
        if (live() && pendingOwnerRef.current === owner) {
          pendingOwnerRef.current = null;
          setPendingPrompt(null);
        }
      };
      setPendingPrompt(userInput);
      try {
        const data = await createChatMutation({ userInput, current });
        // Remote creation may have succeeded. A superseded result does not
        // authorize local state, storage, or another message dispatch.
        if (!data || !current()) return false;
        onChatCreated?.(data.id);
        if (!current()) return false;
        setChat({
          id: data.id,
          title: data.title,
          model: gatewayModelId,
          is_public: false,
        });
        setStoredChatId(data.id);
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${wsId}`, data.id);
        const accepted = await sendMessageWithCurrentConfig({
          id: generateRandomUUID(),
          role: 'user',
          parts: [{ type: 'text', text: userInput }],
        });
        if (!current()) return false;
        return accepted !== false;
      } catch {
        if (current()) {
          toast.error(t('error'));
        }
        return false;
      } finally {
        clearOwnedPrompt();
      }
    },
    [
      model.disabled,
      setInput,
      setPendingPrompt,
      createChatMutation,
      setChat,
      setStoredChatId,
      gatewayModelId,
      sendMessageWithCurrentConfig,
      t,
      wsId,
    ]
  );

  const resetConversationState = useCallback(() => {
    generationRef.current++;
    pendingOwnerRef.current = null;
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
