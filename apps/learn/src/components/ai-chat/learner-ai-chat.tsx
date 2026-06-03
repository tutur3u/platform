'use client';

import { DefaultChatTransport } from '@tuturuuu/ai/core';
import { useChat } from '@tuturuuu/ai/react';
import { RotateCcw, Send } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Textarea } from '@tuturuuu/ui/textarea';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  CoachSidebar,
  EmptyChat,
  MessageBubble,
  ThinkingIndicator,
} from './learner-ai-chat-panels';

const LEARNER_AI_MODEL = 'google/gemini-3-flash';

export function LearnerAiChat({ wsId }: { wsId: string }) {
  const t = useTranslations();
  const [input, setInput] = useState('');
  const [chatId, setChatId] = useState(() => generateRandomUUID());
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/ai/chat',
        body: {
          creditSource: 'workspace',
          model: LEARNER_AI_MODEL,
          wsId,
        },
        credentials: 'include',
      }),
    [wsId]
  );

  const { messages, sendMessage, status, stop } = useChat({
    id: chatId,
    transport,
  });

  const isBusy =
    isCreatingChat || status === 'streaming' || status === 'submitted';
  const hasMessages = messages.length > 0;

  const createChat = async (prompt: string) => {
    setIsCreatingChat(true);
    try {
      const response = await fetch('/api/ai/chat/new', {
        body: JSON.stringify({
          id: chatId,
          message: prompt,
          model: LEARNER_AI_MODEL,
        }),
        cache: 'no-store',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      if (!response.ok) return false;

      const payload = (await response.json()) as { id?: string };
      return payload.id === chatId;
    } finally {
      setIsCreatingChat(false);
    }
  };

  const submit = async (value: string) => {
    const prompt = value.trim();
    if (!prompt || isBusy) return;
    setInput('');

    if (!hasMessages) {
      const created = await createChat(prompt);
      if (!created) {
        setInput(prompt);
        return;
      }
    }

    await sendMessage({
      role: 'user',
      parts: [{ type: 'text', text: prompt }],
    });
  };

  return (
    <div className="grid min-h-[calc(100dvh-12rem)] gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <CoachSidebar />

      <section className="flex min-h-0 flex-col overflow-hidden border-2 border-border bg-background shadow-[9px_9px_0_var(--border)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-border border-b-2 p-4">
          <div>
            <h1 className="font-black text-3xl tracking-normal">
              {t('aiChat.title')}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t('aiChat.description')}
            </p>
          </div>
          <Button
            className="rounded-none border-2 border-border font-black shadow-[3px_3px_0_var(--border)] active:translate-x-1 active:translate-y-1 active:shadow-none"
            onClick={() => {
              if (isBusy) stop();
              setChatId(generateRandomUUID());
              setInput('');
            }}
            size="sm"
            type="button"
            variant="secondary"
          >
            <RotateCcw className="h-4 w-4" />
            {t('aiChat.newChat')}
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {hasMessages ? (
            messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))
          ) : (
            <EmptyChat onPickPrompt={submit} />
          )}
          {isBusy ? <ThinkingIndicator /> : null}
        </div>

        <form
          className="border-border border-t-2 bg-card p-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit(input);
          }}
        >
          <div className="flex items-end gap-2 border-2 border-border bg-background p-2 shadow-[4px_4px_0_var(--border)]">
            <Textarea
              className="max-h-40 min-h-12 resize-none rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
              disabled={isBusy}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit(input);
                }
              }}
              placeholder={t('aiChat.placeholder')}
              value={input}
            />
            <Button
              className="h-11 rounded-none border-2 border-border bg-primary text-primary-foreground shadow-[3px_3px_0_var(--border)] hover:bg-primary active:translate-x-1 active:translate-y-1 active:shadow-none"
              disabled={!input.trim() || isBusy}
              size="icon"
              type="submit"
            >
              <Send className="h-4 w-4" />
              <span className="sr-only">{t('aiChat.send')}</span>
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
