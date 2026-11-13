'use client';

import type { UIMessage } from '@tuturuuu/ai/types';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatFile } from './file-preview-chips';

interface UseMiraMessageQueueParams {
  attachedFiles: ChatFile[];
  disabled?: boolean;
  chatId?: string;
  workspaceId?: string;
  clearAttachedFiles: () => void;
  createChat: (
    userInput: string,
    isCurrent?: () => boolean,
    onChatCreated?: (chatId: string) => void,
    messageId?: string
  ) => Promise<void> | Promise<boolean>;
  sendMessageWithCurrentConfig: (
    message: UIMessage,
    isCurrent?: () => boolean
  ) => void | boolean | Promise<boolean> | Promise<void>;
  snapshotAttachmentsForMessage: (messageId: string) => void;
  onSubmitTiming?: () => void;
  status: string;
  stop?: () => void;
}

export function useMiraMessageQueue({
  attachedFiles,
  disabled = false,
  chatId,
  workspaceId,
  clearAttachedFiles,
  createChat,
  sendMessageWithCurrentConfig,
  snapshotAttachmentsForMessage,
  onSubmitTiming,
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
  const [dispatchPending, setDispatchPending] = useState<UIMessage | null>(
    null
  );
  const dispatchOwnerRef = useRef<{ text: string } | null>(null);
  const messageQueueRef = useRef<string[]>([]);
  const pendingFlushAfterStopRef = useRef(false);
  const chatIdentityRef = useRef(chatId);
  const workspaceIdentityRef = useRef(workspaceId);
  const createdChatRef = useRef<{ generation: number; id: string } | null>(
    null
  );
  const identityChangedRef = useRef(false);
  if (
    chatIdentityRef.current !== chatId ||
    workspaceIdentityRef.current !== workspaceId
  ) {
    const created = createdChatRef.current;
    const ownCreation =
      workspaceIdentityRef.current === workspaceId &&
      chatIdentityRef.current === undefined &&
      created?.generation === generationRef.current &&
      created.id === chatId;
    if (!ownCreation) {
      generationRef.current++;
      createdChatRef.current = null;
      messageQueueRef.current = [];
      pendingFlushAfterStopRef.current = false;
      dispatchOwnerRef.current = null;
      identityChangedRef.current = true;
    }
    chatIdentityRef.current = chatId;
    workspaceIdentityRef.current = workspaceId;
  }
  useEffect(() => {
    if (identityChangedRef.current) {
      identityChangedRef.current = false;
      setQueuedText(null);
      setDispatchPending(null);
    }
  });

  const flushQueue = useCallback(async () => {
    if (disabledRef.current || dispatchOwnerRef.current) {
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
    setQueuedText(null);

    const combined =
      unique.length > 0
        ? unique.join('\n\n')
        : 'Please analyze the attached file(s).';

    const message: UIMessage = {
      id: generateRandomUUID(),
      role: 'user',
      parts: [{ type: 'text', text: combined }],
    };
    const owner = { text: combined };
    dispatchOwnerRef.current = owner;
    setDispatchPending(message);
    snapshotAttachmentsForMessage(message.id);
    try {
      if (!chatId) {
        snapshotAttachmentsForMessage('pending');
        snapshotAttachmentsForMessage('__latest_user_upload');
        try {
          const accepted = await createChat(
            combined,
            current,
            (id) => {
              if (
                current() &&
                chatIdentityRef.current === undefined &&
                !createdChatRef.current
              ) {
                createdChatRef.current = { generation, id };
              }
            },
            message.id
          );
          if (accepted === false || !current()) return;
        } catch (error) {
          console.error(
            '[Mira Chat] Failed to create chat from queued input:',
            {
              error,
            }
          );
          return;
        }
      } else {
        snapshotAttachmentsForMessage('__latest_user_upload');
        const sent = await sendMessageWithCurrentConfig(message, current);
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
    } catch (error) {
      console.error('[Mira Chat] Failed to dispatch queued input:', { error });
    } finally {
      if (mountedRef.current && dispatchOwnerRef.current === owner) {
        dispatchOwnerRef.current = null;
        setDispatchPending(null);
      }
    }
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
      if (
        status !== 'submitted' &&
        status !== 'streaming' &&
        value.trim() &&
        dispatchOwnerRef.current?.text === value.trim()
      )
        return;
      if (!dispatchOwnerRef.current) {
        generationRef.current++;
        createdChatRef.current = null;
        onSubmitTiming?.();
      }

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
        pendingFlushAfterStopRef.current = true;
        stop?.();
        return;
      }

      void flushQueue();
    },
    [
      attachedFiles,
      flushQueue,
      onSubmitTiming,
      snapshotAttachmentsForMessage,
      status,
      stop,
    ]
  );

  useEffect(() => {
    const currentlyBusy = status === 'submitted' || status === 'streaming';
    if (disabled || currentlyBusy || !pendingFlushAfterStopRef.current) {
      return;
    }

    void flushQueue();
  }, [disabled, dispatchPending, flushQueue, status]);

  const resetQueue = useCallback(() => {
    generationRef.current++;
    createdChatRef.current = null;
    dispatchOwnerRef.current = null;
    setDispatchPending(null);
    pendingFlushAfterStopRef.current = false;
    messageQueueRef.current = [];
    setQueuedText(null);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current++;
      dispatchOwnerRef.current = null;
    };
  }, []);

  return {
    handleSubmit,
    queuedText,
    dispatchPending,
    resetQueue,
  };
}
