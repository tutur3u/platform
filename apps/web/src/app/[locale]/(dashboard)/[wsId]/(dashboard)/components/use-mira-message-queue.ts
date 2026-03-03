'use client';

import type { UIMessage } from '@tuturuuu/ai/types';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import type { MutableRefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatFile } from './file-preview-chips';
import { QUEUE_DEBOUNCE_MS } from './mira-chat-constants';

interface UseMiraMessageQueueParams {
  attachedFilesRef: MutableRefObject<ChatFile[]>;
  chatId?: string;
  clearAttachedFiles: () => void;
  createChat: (
    userInput: string,
    options?: {
      messageId?: string;
      messageMetadata?: Record<string, unknown>;
    }
  ) => Promise<void>;
  messages: UIMessage[];
  sendMessageWithCurrentConfig: (message: UIMessage) => void;
  getUploadedAttachmentMetadata: () => Array<Record<string, unknown>>;
  snapshotAttachmentsForMessage: (messageId: string) => void;
  status: string;
  stop?: () => void;
}

type PendingOptimisticMessage = {
  dispatched: boolean;
  message: UIMessage;
};

export function useMiraMessageQueue({
  attachedFilesRef,
  chatId,
  clearAttachedFiles,
  createChat,
  messages,
  sendMessageWithCurrentConfig,
  getUploadedAttachmentMetadata,
  snapshotAttachmentsForMessage,
  status,
  stop,
}: UseMiraMessageQueueParams) {
  const [queuedText, setQueuedText] = useState<string | null>(null);
  const [optimisticPendingMessage, setOptimisticPendingMessage] =
    useState<UIMessage | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageQueueRef = useRef<string[]>([]);
  const pendingFlushAfterStopRef = useRef(false);
  const pendingOptimisticMessageRef = useRef<PendingOptimisticMessage | null>(
    null
  );

  const clearOptimisticPendingMessage = useCallback(() => {
    pendingOptimisticMessageRef.current = null;
    setOptimisticPendingMessage(null);
  }, []);

  const flushQueue = useCallback(async () => {
    const queue = [...messageQueueRef.current];
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const message of queue) {
      if (seen.has(message)) continue;
      seen.add(message);
      unique.push(message);
    }

    const currentAttachedFiles = attachedFilesRef.current;
    const hasUploadedFiles = currentAttachedFiles.some(
      (file) => file.status === 'uploaded'
    );
    if (unique.length === 0 && !hasUploadedFiles) return;

    pendingFlushAfterStopRef.current = false;
    messageQueueRef.current = [];
    debounceTimerRef.current = null;
    setQueuedText(null);

    const combined =
      unique.length > 0
        ? unique.join('\n\n')
        : 'Please analyze the attached file(s).';
    const messageId = generateRandomUUID();
    const attachmentMetadata = getUploadedAttachmentMetadata();
    const messageMetadata =
      attachmentMetadata.length > 0
        ? { attachments: attachmentMetadata }
        : undefined;
    const shouldClearAttachments = attachmentMetadata.length > 0;
    const outgoingMessage: UIMessage = {
      id: messageId,
      role: 'user',
      ...(messageMetadata ? { metadata: messageMetadata } : {}),
      parts: [{ type: 'text', text: combined }],
    };

    pendingOptimisticMessageRef.current = {
      dispatched: !!chatId,
      message: outgoingMessage,
    };
    setOptimisticPendingMessage(outgoingMessage);

    if (!chatId) {
      if (shouldClearAttachments) {
        snapshotAttachmentsForMessage('pending');
        snapshotAttachmentsForMessage(messageId);
        clearAttachedFiles();
      }
      try {
        await createChat(combined, {
          messageId,
          messageMetadata,
        });
      } catch (error) {
        clearOptimisticPendingMessage();
        console.error('[Mira Chat] Failed to create chat from queued input:', {
          error,
        });
      }
    } else {
      if (shouldClearAttachments) {
        snapshotAttachmentsForMessage(messageId);
        clearAttachedFiles();
      }
      sendMessageWithCurrentConfig(outgoingMessage);
    }
  }, [
    attachedFilesRef,
    chatId,
    clearAttachedFiles,
    clearOptimisticPendingMessage,
    createChat,
    getUploadedAttachmentMetadata,
    sendMessageWithCurrentConfig,
    snapshotAttachmentsForMessage,
  ]);

  const handleSubmit = useCallback(
    (value: string) => {
      const currentAttachedFiles = attachedFilesRef.current;
      if (!value.trim() && currentAttachedFiles.length === 0) return;
      const hasUploadedFiles = currentAttachedFiles.some(
        (file) => file.status === 'uploaded'
      );
      const shouldSendImmediately = hasUploadedFiles;

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

      if (currentAttachedFiles.length > 0) {
        snapshotAttachmentsForMessage('queued');
      }

      const currentlyBusy = status === 'submitted' || status === 'streaming';
      if (currentlyBusy) {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        pendingFlushAfterStopRef.current = true;
        stop?.();
        return;
      }

      if (shouldSendImmediately) {
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
    [attachedFilesRef, flushQueue, snapshotAttachmentsForMessage, status, stop]
  );

  useEffect(() => {
    const currentlyBusy = status === 'submitted' || status === 'streaming';
    if (currentlyBusy || !pendingFlushAfterStopRef.current) {
      return;
    }

    void flushQueue();
  }, [flushQueue, status]);

  useEffect(() => {
    const pendingMessage = pendingOptimisticMessageRef.current;
    if (!pendingMessage) return;

    const hasRealMessage = messages.some(
      (message) => message.id === pendingMessage.message.id
    );
    if (hasRealMessage) {
      clearOptimisticPendingMessage();
      return;
    }

    if (!chatId || pendingMessage.dispatched) {
      return;
    }

    sendMessageWithCurrentConfig(pendingMessage.message);
    pendingOptimisticMessageRef.current = {
      ...pendingMessage,
      dispatched: true,
    };
  }, [
    chatId,
    clearOptimisticPendingMessage,
    messages,
    sendMessageWithCurrentConfig,
  ]);

  const resetQueue = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingFlushAfterStopRef.current = false;
    messageQueueRef.current = [];
    setQueuedText(null);
    clearOptimisticPendingMessage();
  }, [clearOptimisticPendingMessage]);

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
    optimisticPendingMessage,
    queuedText,
    resetQueue,
  };
}
