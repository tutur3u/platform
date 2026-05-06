'use client';

import type { UIMessage } from '@tuturuuu/ai/types';
import {
  BookOpen,
  Bot,
  HeartPulse,
  LoaderCircle,
  Sparkles,
  User,
} from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

export function getMessageText(message: UIMessage) {
  return message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .filter(Boolean)
    .join('\n');
}

export function CoachSidebar() {
  const t = useTranslations();
  const features = [
    { icon: HeartPulse, label: t('aiChat.featurePractice') },
    { icon: BookOpen, label: t('aiChat.featureLessons') },
    { icon: Sparkles, label: t('aiChat.featureExplain') },
  ];

  return (
    <aside className="space-y-4">
      <section className="border-2 border-foreground bg-dynamic-yellow/15 p-5 shadow-[7px_7px_0_var(--foreground)]">
        <div className="mb-4 flex h-12 w-12 items-center justify-center border-2 border-foreground bg-background shadow-[3px_3px_0_var(--foreground)]">
          <Bot className="h-6 w-6" />
        </div>
        <h2 className="font-black text-2xl tracking-normal">
          {t('aiChat.coachTitle')}
        </h2>
        <p className="mt-3 text-muted-foreground text-sm leading-6">
          {t('aiChat.coachDescription')}
        </p>
      </section>

      <section className="grid gap-3">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <div
              className="flex items-center gap-3 border-2 border-foreground bg-card p-4 font-black text-sm shadow-[5px_5px_0_var(--foreground)]"
              key={feature.label}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {feature.label}
            </div>
          );
        })}
      </section>
    </aside>
  );
}

export function EmptyChat({
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
    <div className="flex min-h-full flex-col items-center justify-center gap-5 border-2 border-foreground border-dashed bg-dynamic-yellow/10 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center border-2 border-foreground bg-dynamic-yellow shadow-[5px_5px_0_var(--foreground)]">
        <Sparkles className="h-8 w-8" />
      </div>
      <div>
        <h2 className="font-black text-3xl tracking-normal">
          {t('aiChat.emptyTitle')}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground leading-7">
          {t('aiChat.emptyDescription')}
        </p>
      </div>
      <div className="grid w-full max-w-2xl gap-2 sm:grid-cols-3">
        {prompts.map((prompt) => (
          <button
            className="border-2 border-foreground bg-background px-4 py-3 text-left font-black text-sm shadow-[3px_3px_0_var(--foreground)] transition hover:bg-dynamic-yellow/15 active:translate-x-1 active:translate-y-1 active:shadow-none"
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

export function ThinkingIndicator() {
  const t = useTranslations();
  return (
    <div className="flex items-center gap-2 border-2 border-foreground bg-dynamic-yellow/15 px-4 py-3 font-black text-sm shadow-[4px_4px_0_var(--foreground)]">
      <LoaderCircle className="h-4 w-4 animate-spin" />
      {t('aiChat.thinking')}
    </div>
  );
}

export function MessageBubble({ message }: { message: UIMessage }) {
  const text = getMessageText(message);
  const isUser = message.role === 'user';
  const Icon = isUser ? User : Bot;

  if (!text) return null;

  return (
    <article
      className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}
    >
      {!isUser ? <MessageAvatar icon={Icon} tone="assistant" /> : null}
      <div
        className={cn(
          'max-w-[min(42rem,85%)] whitespace-pre-wrap border-2 border-foreground px-4 py-3 text-sm leading-7 shadow-[4px_4px_0_var(--foreground)]',
          isUser
            ? 'bg-dynamic-yellow text-foreground'
            : 'bg-card text-foreground'
        )}
      >
        {text}
      </div>
      {isUser ? <MessageAvatar icon={Icon} tone="user" /> : null}
    </article>
  );
}

function MessageAvatar({
  icon: Icon,
  tone,
}: {
  icon: typeof Bot;
  tone: 'assistant' | 'user';
}) {
  return (
    <div
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center border-2 border-foreground shadow-[3px_3px_0_var(--foreground)]',
        tone === 'assistant' ? 'bg-background' : 'bg-dynamic-yellow'
      )}
    >
      <Icon className="h-5 w-5" />
    </div>
  );
}
