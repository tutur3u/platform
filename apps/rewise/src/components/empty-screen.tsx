import {
  ArrowUpRight,
  BrainCircuit,
  FileText,
  GraduationCap,
  Lightbulb,
  MessageCircle,
  Sparkles,
} from '@tuturuuu/icons';
import type { AIChat } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { getRewiseChatPath } from '@/lib/workspace-routes';

interface PromptStarter {
  icon: ReactNode;
  label: string;
  prompt: string;
}

export function EmptyScreen({
  chats = [],
  setInput,
  workspaceSlug,
}: {
  chats?: AIChat[];
  locale: string;
  setInput: (input: string) => void;
  workspaceSlug: string;
}) {
  const t = useTranslations('ai_chat');
  const starters: PromptStarter[] = [
    {
      icon: <BrainCircuit className="h-4 w-4" />,
      label: t('starter_plan'),
      prompt: t('starter_plan_prompt'),
    },
    {
      icon: <GraduationCap className="h-4 w-4" />,
      label: t('starter_learn'),
      prompt: t('starter_learn_prompt'),
    },
    {
      icon: <FileText className="h-4 w-4" />,
      label: t('starter_summarize'),
      prompt: t('starter_summarize_prompt'),
    },
    {
      icon: <Lightbulb className="h-4 w-4" />,
      label: t('starter_brainstorm'),
      prompt: t('starter_brainstorm_prompt'),
    },
  ];

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-3xl flex-col justify-center px-4 pt-8 pb-44 sm:px-6">
      <section className="relative py-8 sm:py-12">
        <div
          aria-hidden="true"
          className="absolute top-0 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-dynamic-purple/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute top-28 right-12 h-32 w-32 rounded-full bg-dynamic-cyan/6 blur-3xl"
        />

        <div className="relative flex flex-col items-center text-center">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl border border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <p className="font-medium text-muted-foreground text-xs tracking-wide">
            {t('workspace_intelligence')}
          </p>
          <h1 className="mt-2 max-w-2xl text-balance font-semibold text-3xl tracking-tight sm:text-4xl">
            {t('assistant_heading')}
          </h1>
          <p className="mt-3 max-w-xl text-pretty text-muted-foreground text-sm leading-6">
            {t('assistant_description')}
          </p>

          <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
            {starters.map((starter) => (
              <Button
                key={starter.label}
                type="button"
                variant="ghost"
                className="group h-auto min-h-12 justify-start gap-3 whitespace-normal rounded-xl border border-border/40 bg-background/30 px-3.5 py-3 text-left transition-all duration-200 hover:border-dynamic-purple/30 hover:bg-dynamic-purple/5 active:scale-[0.99]"
                onClick={() => setInput(starter.prompt)}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground transition-colors group-hover:bg-dynamic-purple/10 group-hover:text-dynamic-purple">
                  {starter.icon}
                </span>
                <span className="font-medium text-sm">{starter.label}</span>
              </Button>
            ))}
          </div>
        </div>
      </section>

      {chats.length > 0 ? (
        <section className="border-border/50 border-t pt-5">
          <div className="mb-3 flex items-end justify-between gap-3 px-1">
            <div>
              <h2 className="font-medium text-sm">{t('continue_working')}</h2>
              <p className="mt-0.5 text-muted-foreground text-xs">
                {t('continue_working_description')}
              </p>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {chats.slice(0, 4).map((chat) => (
              <Link
                key={chat.id}
                href={getRewiseChatPath(workspaceSlug, chat.id)}
                className="group flex items-center gap-3 rounded-xl border border-transparent bg-muted/35 p-3 transition-all duration-200 hover:border-dynamic-purple/20 hover:bg-dynamic-purple/5 active:scale-[0.99]"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background/70 text-muted-foreground">
                  <MessageCircle className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-sm">
                    {chat.title || t('untitled')}
                  </span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {chat.summary || chat.model || t('recent_conversations')}
                  </span>
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
