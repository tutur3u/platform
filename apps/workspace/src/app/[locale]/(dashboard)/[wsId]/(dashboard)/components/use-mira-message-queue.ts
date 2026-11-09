'use client';

import type { UIMessage } from '@tuturuuu/ai/types';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatFile } from './file-preview-chips';
import { QUEUE_DEBOUNCE_MS } from './mira-chat-constants';

interface UseMiraMessageQueueParams {
  attachedFiles: ChatFile[];
  disabled?: boolean;
  chatId?: string;
  clearAttachedFiles: () => void;
  createChat: (
    userInput: string,
    isCurrent?: () => boolean,
    onChatCreated?: (chatId: string) => void
  ) => Promise<void> | Promise<boolean>;
  sendMessageWithCurrentConfig: (
    message: UIMessage
  ) => void | boolean | Promise<boolean> | Promise<void>;
  snapshotAttachmentsForMessage: (messageId: string) => void;
  status: string;
  stop?: () => void;
}

export function useMiraMessageQueue({
  attachedFiles,
  disabled = false,
  chatId,
  clearAttachedFiles,
  createChat,
  sendMessageWithCurrentConfig,
  snapshotAttachmentsForMessage,
  status,
  stop,
}: UseMiraMessageQueueParams) {
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const disabledRef = useRef(disabled);
  if (disabledRef.current !== disabled) generationRef.current++;
  disabledRef.current = disabled;
  const attachedFilesRef = useRef(attachedFiles);
  attachedFilesRef.current = attachedFiles;
  const [queuedText, setQueuedText] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageQueueRef = useRef<string[]>([]);
  const pendingFlushAfterStopRef = useRef(false);
  const chatIdentityRef = useRef(chatId);
  const createdChatRef = useRef<{ generation: number; id: string } | null>(
    null
  );
  const identityChangedRef = useRef(false);
  if (chatIdentityRef.current !== chatId) {
    const created = createdChatRef.current;
    const ownCreation =
      chatIdentityRef.current === undefined &&
      created?.generation === generationRef.current &&
      created.id === chatId;
    if (!ownCreation) {
      generationRef.current++;
      createdChatRef.current = null;
      messageQueueRef.current = [];
      pendingFlushAfterStopRef.current = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      identityChangedRef.current = true;
    }
    chatIdentityRef.current = chatId;
  }
  useEffect(() => {
    if (identityChangedRef.current) {
      identityChangedRef.current = false;
      setQueuedText(null);
    }
  });

  const flushQueue = useCallback(async () => {
    if (disabledRef.current) {
      pendingFlushAfterStopRef.current = true;
      return;
    }
    const generation = generationRef.current;
    const current = () =>
      mountedRef.current &&
      generation === generationRef.current &&
      !disabledRef.current;
    const attachments = attachedFiles.map((file) => ({ ...file }));
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

    pendingFlushAfterStopRef.current = false;
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
        const accepted = await createChat(combined, current, (id) => {
          if (
            current() &&
            chatIdentityRef.current === undefined &&
            !createdChatRef.current
          ) {
            createdChatRef.current = { generation, id };
          }
        });
        if (accepted === false || !current()) return;
      } catch (error) {
        console.error('[Mira Chat] Failed to create chat from queued input:', {
          error,
        });
        return;
      }
    } else {
      snapshotAttachmentsForMessage('__latest_user_upload');
      const sent = await sendMessageWithCurrentConfig({
        id: generateRandomUUID(),
        role: 'user',
        parts: [{ type: 'text', text: combined }],
      });
      if (sent === false || !current()) return;
    }

    // The composer may have acquired new files while this send was held.
    // Its all-files clear callback is safe only for the admitted snapshot.
    const latest = attachedFilesRef.current;
    const unchanged =
      latest.length === attachments.length &&
      attachments.every((file, index) => {
        const next = latest[index];
        return (
          next?.id === file.id &&
          next.file === file.file &&
          next.status === file.status &&
          next.storagePath === file.storagePath
        );
      });
    if (current() && unchanged) clearAttachedFiles();
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
      if (disabledRef.current) return;
      if (!value.trim() && attachedFiles.length === 0) return;
      generationRef.current++;
      createdChatRef.current = null;

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
        pendingFlushAfterStopRef.current = true;
        stop?.();
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

  useEffect(() => {
    const currentlyBusy = status === 'submitted' || status === 'streaming';
    if (disabled || currentlyBusy || !pendingFlushAfterStopRef.current) {
      return;
    }

    void flushQueue();
  }, [disabled, flushQueue, status]);

  const resetQueue = useCallback(() => {
    generationRef.current++;
    createdChatRef.current = null;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingFlushAfterStopRef.current = false;
    messageQueueRef.current = [];
    setQueuedText(null);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current++;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  return {
    handleSubmit,
    queuedText,
    resetQueue,
  };
}
