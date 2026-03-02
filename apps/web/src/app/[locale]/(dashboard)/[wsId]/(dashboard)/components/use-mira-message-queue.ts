'use client';

import type { UIMessage } from '@tuturuuu/ai/types';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatFile } from './file-preview-chips';
import { QUEUE_DEBOUNCE_MS } from './mira-chat-constants';

interface UseMiraMessageQueueParams {
  attachedFiles: ChatFile[];
  chatId?: string;
  clearAttachedFiles: () => void;
  createChat: (userInput: string) => Promise<void>;
  sendMessageWithCurrentConfig: (message: UIMessage) => void;
  snapshotAttachmentsForMessage: (messageId: string) => void;
  status: string;
  stop?: () => void;
}

export function useMiraMessageQueue({
  attachedFiles,
  chatId,
  clearAttachedFiles,
  createChat,
  sendMessageWithCurrentConfig,
  snapshotAttachmentsForMessage,
  status,
  stop,
}: UseMiraMessageQueueParams) {
  const [queuedText, setQueuedText] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageQueueRef = useRef<string[]>([]);

  const flushQueue = useCallback(async () => {
    const queue = [...messageQueueRef.current];
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const message of queue) {
      if (seen.has(message)) continue;
      seen.add(message);
      unique.push(message);
    }

    const hasUploadedFiles = attachedFiles.some(
      (file) => file.status === 'uploaded'
    );
    if (unique.length === 0 && !hasUploadedFiles) return;

    messageQueueRef.current = [];
    debounceTimerRef.current = null;
    setQueuedText(null);

    const combined =
      unique.length > 0
        ? unique.join('\n\n')
        : 'Please analyze the attached file(s).';

    if (!chatId) {
      snapshotAttachmentsForMessage('pending');
      snapshotAttachmentsForMessage('__latest_user_upload');
      try {
        await createChat(combined);
      } catch (error) {
        console.error('[Mira Chat] Failed to create chat from queued input:', {
          error,
        });
      }
    } else {
      snapshotAttachmentsForMessage('__latest_user_upload');
      sendMessageWithCurrentConfig({
        id: generateRandomUUID(),
        role: 'user',
        parts: [{ type: 'text', text: combined }],
      });
    }

    clearAttachedFiles();
  }, [
    attachedFiles,
    chatId,
    clearAttachedFiles,
    createChat,
    sendMessageWithCurrentConfig,
    snapshotAttachmentsForMessage,
  ]);

  const handleSubmit = useCallback(
    (value: string) => {
      if (!value.trim() && attachedFiles.length === 0) return;

      if (value.trim()) {
        messageQueueRef.current.push(value.trim());
      }

      const seen = new Set<string>();
      const unique: string[] = [];
      for (const message of messageQueueRef.current) {
        if (seen.has(message)) continue;
        seen.add(message);
        unique.push(message);
      }
      setQueuedText(unique.length > 0 ? unique.join('\n\n') : null);

      if (attachedFiles.length > 0) {
        snapshotAttachmentsForMessage('queued');
      }

      const currentlyBusy = status === 'submitted' || status === 'streaming';
      if (currentlyBusy) {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        stop?.();
        void flushQueue();
        return;
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        void flushQueue();
      }, QUEUE_DEBOUNCE_MS);
    },
    [attachedFiles, flushQueue, snapshotAttachmentsForMessage, status, stop]
  );

  const resetQueue = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    messageQueueRef.current = [];
    setQueuedText(null);
  }, []);

  useEffect(
    () => () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    },
    []
  );

  return {
    handleSubmit,
    queuedText,
    resetQueue,
  };
}
