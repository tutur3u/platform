'use client';

import { useMutation } from '@tanstack/react-query';
import type { UIMessage } from '@tuturuuu/ai/types';
import { saveLiveConversation } from '@tuturuuu/internal-api/ai';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useCallback, useRef } from 'react';
import type { LiveConversationMessage } from '../assistant/live-conversation';

export function useMiraLiveConversation({
  chatId,
  setMessages,
  onSaved,
  onStarted,
}: {
  chatId: string;
  setMessages: (updater: (messages: UIMessage[]) => UIMessage[]) => void;
  onSaved: (chatId: string) => void;
  onStarted: (chatId: string) => void;
}) {
  const t = useTranslations('dashboard.voice_assistant');
  const saved = useRef(new Map<string, string>());
  const latest = useRef(
    new Map<string, { chatId: string; message: UIMessage }>()
  );
  const queue = useRef(Promise.resolve());
  const failed = useRef(new Set<string>());
  const { mutateAsync } = useMutation({
    mutationFn: (payload: Parameters<typeof saveLiveConversation>[0]) =>
      saveLiveConversation(payload),
    retry: 2,
  });
  const callbacks = useRef({
    chatId,
    setMessages,
    onSaved,
    onStarted,
    mutateAsync,
    t,
  });
  callbacks.current = {
    chatId,
    setMessages,
    onSaved,
    onStarted,
    mutateAsync,
    t,
  };
  const onChange = useCallback(
    (messages: LiveConversationMessage[], final: boolean) => {
      if (callbacks.current.chatId !== chatId) return;
      if (messages.length) callbacks.current.onStarted(chatId);
      callbacks.current.setMessages((current) => {
        const incoming = new Map(
          messages.map(({ complete: _complete, ...message }) => [
            message.id,
            message,
          ])
        );
        const merged = current.map((message) => {
          const update = incoming.get(message.id);
          incoming.delete(message.id);
          return update ?? message;
        });
        return [...merged, ...incoming.values()];
      });
      if (!final) return;
      const complete = messages
        .filter((message) => message.complete)
        .map(({ complete: _complete, ...message }) => message);
      complete.forEach((message) => {
        latest.current.set(message.id, { chatId, message });
      });
      async function save() {
        const changed = [...latest.current.values()]
          .filter((item) => item.chatId === chatId)
          .map((item) => item.message)
          .filter(
            (message) =>
              saved.current.get(message.id) !== JSON.stringify(message)
          );
        const batches: UIMessage[][] = [];
        let batch: UIMessage[] = [];
        for (const message of changed) {
          if (
            batch.length &&
            (batch.length >= 50 ||
              JSON.stringify({ chatId, messages: [...batch, message] }).length >
                750000)
          ) {
            batches.push(batch);
            batch = [];
          }
          batch.push(message);
        }
        if (batch.length) batches.push(batch);
        for (const batch of batches) {
          await callbacks.current.mutateAsync({ chatId, messages: batch });
          batch.forEach((message) => {
            saved.current.set(message.id, JSON.stringify(message));
          });
          if (callbacks.current.chatId === chatId)
            callbacks.current.onSaved(chatId);
        }
        failed.current.delete(chatId);
      }
      function enqueue() {
        queue.current = queue.current.then(save).catch(() => {
          failed.current.add(chatId);
          toast.error(callbacks.current.t('conversation_save_failed'), {
            action: {
              label: callbacks.current.t('retry_save'),
              onClick: enqueue,
            },
          });
        });
      }
      enqueue();
    },
    [chatId]
  );
  const flush = useCallback(async () => {
    let pending: Promise<void>;
    do {
      pending = queue.current;
      await pending;
    } while (pending !== queue.current);
    if (failed.current.has(chatId))
      throw new Error('Live conversation has unsaved messages');
  }, [chatId]);
  return { onChange, flush };
}
