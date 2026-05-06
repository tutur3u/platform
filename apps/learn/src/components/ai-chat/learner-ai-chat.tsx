'use client';

import { DefaultChatTransport } from '@tuturuuu/ai/core';
import { useChat } from '@tuturuuu/ai/react';
import type { UIMessage } from '@tuturuuu/ai/types';
import {
  BookOpen,
  Bot,
  HeartPulse,
  LoaderCircle,
  RotateCcw,
  Send,
  Sparkles,
  User,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

const LEARNER_AI_MODEL = 'google/gemini-3-flash';

function getMessageText(message: UIMessage) {
  return message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .filter(Boolean)
    .join('\n');
}

export function LearnerAiChat({ wsId }: { wsId: string }) {
  const t = useTranslations();
  const [input, setInput] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const chatId = useMemo(
    () => `tulearn-${wsId}-${resetKey}-${crypto.randomUUID()}`,
    [resetKey, wsId]
  );
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

  const isBusy = status === 'streaming' || status === 'submitted';
  const hasMessages = messages.length > 0;

  const submit = async (value: string) => {
    const prompt = value.trim();
    if (!prompt || isBusy) return;
    setInput('');
    await sendMessage({
      role: 'user',
      parts: [{ type: 'text', text: prompt }],
    });
  };

  return (
    <div className="grid min-h-[calc(100vh-12rem)] gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="space-y-4">
        <section className="rounded-[2rem] border border-dynamic-green/25 bg-dynamic-green/10 p-5">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-background text-dynamic-green shadow-sm">
            <Bot className="h-6 w-6" />
          </div>
          <h2 className="font-bold text-2xl tracking-normal">
            {t('aiChat.coachTitle')}
          </h2>
          <p className="mt-3 text-muted-foreground text-sm leading-6">
            {t('aiChat.coachDescription')}
          </p>
        </section>

        <section className="grid gap-3">
          {[
            {
              icon: HeartPulse,
              label: t('aiChat.featurePractice'),
              tone: 'green',
            },
            {
              icon: BookOpen,
              label: t('aiChat.featureLessons'),
              tone: 'blue',
            },
            {
              icon: Sparkles,
              label: t('aiChat.featureExplain'),
              tone: 'orange',
            },
          ].map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                className={cn(
                  'flex items-center gap-3 rounded-[1.35rem] border bg-card p-4 font-semibold text-sm',
                  feature.tone === 'green' &&
                    'border-dynamic-green/20 text-dynamic-green',
                  feature.tone === 'blue' &&
                    'border-dynamic-blue/20 text-dynamic-blue',
                  feature.tone === 'orange' &&
                    'border-dynamic-orange/20 text-dynamic-orange'
                )}
                key={feature.label}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {feature.label}
              </div>
            );
          })}
        </section>
      </aside>

      <section className="flex min-h-0 flex-col overflow-hidden rounded-[2rem] border border-border bg-background shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-border border-b p-4">
          <div>
            <h1 className="font-bold text-2xl tracking-normal">
              {t('aiChat.title')}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t('aiChat.description')}
            </p>
          </div>
          <Button
            className="rounded-full"
            onClick={() => {
              if (isBusy) stop();
              setResetKey((current) => current + 1);
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
          {isBusy ? (
            <div className="flex items-center gap-2 rounded-2xl border border-dynamic-blue/20 bg-dynamic-blue/10 px-4 py-3 font-medium text-dynamic-blue text-sm">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              {t('aiChat.thinking')}
            </div>
          ) : null}
        </div>

        <form
          className="border-border border-t bg-card/70 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit(input);
          }}
        >
          <div className="flex items-end gap-2 rounded-[1.5rem] border border-border bg-background p-2 shadow-sm">
            <Textarea
              className="max-h-40 min-h-12 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
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
              className="h-11 rounded-2xl bg-dynamic-green text-primary-foreground hover:bg-dynamic-green/90"
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

function EmptyChat({
  onPickPrompt,
}: {
  onPickPrompt: (prompt: string) => void | Promise<void>;
}) {
  const t = useTranslations();
  const prompts = [
    t('aiChat.promptReview'),
    t('aiChat.promptExplain'),
    t('aiChat.promptQuiz'),
  ];

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-5 rounded-[1.75rem] border border-dynamic-green/20 border-dashed bg-dynamic-green/5 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-dynamic-green text-primary-foreground shadow-sm">
        <Sparkles className="h-8 w-8" />
      </div>
      <div>
        <h2 className="font-bold text-3xl tracking-normal">
          {t('aiChat.emptyTitle')}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground leading-7">
          {t('aiChat.emptyDescription')}
        </p>
      </div>
      <div className="grid w-full max-w-2xl gap-2 sm:grid-cols-3">
        {prompts.map((prompt) => (
          <button
            className="rounded-2xl border border-border bg-background px-4 py-3 text-left font-medium text-sm transition hover:border-dynamic-green/30 hover:bg-dynamic-green/10 hover:text-dynamic-green"
            key={prompt}
            onClick={() => onPickPrompt(prompt)}
            type="button"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const text = getMessageText(message);
  const isUser = message.role === 'user';
  const Icon = isUser ? User : Bot;

  if (!text) return null;

  return (
    <article
      className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}
    >
      {!isUser ? (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-dynamic-green/10 text-dynamic-green">
          <Icon className="h-5 w-5" />
        </div>
      ) : null}
      <div
        className={cn(
          'max-w-[min(42rem,85%)] whitespace-pre-wrap rounded-[1.5rem] px-4 py-3 text-sm leading-7',
          isUser
            ? 'bg-dynamic-green text-primary-foreground'
            : 'border border-border bg-card text-foreground'
        )}
      >
        {text}
      </div>
      {isUser ? (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-dynamic-blue/10 text-dynamic-blue">
          <Icon className="h-5 w-5" />
        </div>
      ) : null}
    </article>
  );
}
