'use client';

import { ArrowUp, Grip, Sparkles } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export type HiveAgentMessage = {
  content: string;
  id: string;
  role: 'agent' | 'user';
};

type HiveAgentComposerProps = {
  lastMessage?: HiveAgentMessage | null;
  onSubmit: (prompt: string) => void;
};

export function HiveAgentComposer({
  lastMessage,
  onSubmit,
}: HiveAgentComposerProps) {
  const t = useTranslations('studio.agent');
  const [input, setInput] = useState('');
  const canSubmit = input.trim().length > 0;

  return (
    <div className="pointer-events-auto mx-auto flex w-[min(560px,calc(100vw-2rem))] flex-col items-center gap-2">
      {lastMessage ? (
        <div className="max-w-full rounded-full border border-border/60 bg-background/82 px-3 py-1.5 text-muted-foreground text-xs shadow-foreground/10 shadow-lg backdrop-blur-md">
          <span className="mr-2 font-medium text-foreground">
            {lastMessage.role === 'agent' ? t('agent_name') : t('you')}
          </span>
          <span className="line-clamp-1">{lastMessage.content}</span>
        </div>
      ) : null}
      <form
        className="flex w-full items-center gap-2 rounded-full border border-white/75 bg-background/78 p-2 shadow-2xl shadow-foreground/15 ring-1 ring-foreground/5 backdrop-blur-xl"
        onSubmit={(event) => {
          event.preventDefault();
          const prompt = input.trim();
          if (!prompt) return;
          onSubmit(prompt);
          setInput('');
        }}
      >
        <Grip className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
        <Sparkles className="h-4 w-4 shrink-0 text-dynamic-green" />
        <input
          aria-label={t('input_label')}
          className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted-foreground"
          onChange={(event) => setInput(event.target.value)}
          value={input}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={t('send')}
              className="h-10 w-10 shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground"
              disabled={!canSubmit}
              size="icon"
              type="submit"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{t('send')}</TooltipContent>
        </Tooltip>
      </form>
    </div>
  );
}
