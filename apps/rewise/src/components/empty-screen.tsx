import {
  ArrowUpRight,
  BrainCircuit,
  FileText,
  GraduationCap,
  Lightbulb,
  MessageCircle,
  Sparkles,
  WandSparkles,
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
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 pt-4 md:px-6 md:pt-8">
      <section className="relative overflow-hidden rounded-3xl border bg-card/80 px-5 py-8 shadow-sm md:px-10 md:py-12">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-linear-to-br from-dynamic-blue/10 via-transparent to-dynamic-purple/10"
        />
        <div className="relative max-w-3xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-dynamic-blue/20 bg-dynamic-blue/10 px-3 py-1 font-medium text-dynamic-blue text-xs">
            <Sparkles className="h-3.5 w-3.5" />
            {t('workspace_intelligence')}
          </div>
          <h1 className="max-w-2xl text-balance font-bold text-3xl tracking-tight md:text-5xl">
            {t('assistant_heading')}
          </h1>
          <p className="mt-4 max-w-2xl text-balance text-muted-foreground text-sm leading-6 md:text-base">
            {t('assistant_description')}
          </p>

          <div className="mt-7 grid gap-2 sm:grid-cols-2">
            {starters.map((starter) => (
              <Button
                key={starter.label}
                type="button"
                variant="outline"
                className="h-auto min-h-12 justify-start gap-3 whitespace-normal rounded-xl bg-background/70 px-4 py-3 text-left hover:border-dynamic-blue/30 hover:bg-dynamic-blue/5"
                onClick={() => setInput(starter.prompt)}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-dynamic-blue/10 text-dynamic-blue">
                  {starter.icon}
                </span>
                <span>{starter.label}</span>
              </Button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {[
          [<MessageCircle key="chat" />, 'capability_conversation'],
          [<WandSparkles key="tools" />, 'capability_tools'],
          [<FileText key="files" />, 'capability_files'],
        ].map(([icon, key]) => (
          <div
            key={key as string}
            className="rounded-2xl border bg-card p-4 text-sm"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-dynamic-purple/10 text-dynamic-purple [&>svg]:h-4 [&>svg]:w-4">
              {icon}
            </div>
            <p className="font-semibold">{t(`${key}_title`)}</p>
            <p className="mt-1 text-muted-foreground leading-5">
              {t(`${key}_description`)}
            </p>
          </div>
        ))}
      </section>

      {chats.length > 0 ? (
        <section className="rounded-2xl border bg-card p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">{t('continue_working')}</h2>
              <p className="text-muted-foreground text-sm">
                {t('continue_working_description')}
              </p>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {chats.slice(0, 4).map((chat) => (
              <Link
                key={chat.id}
                href={getRewiseChatPath(workspaceSlug, chat.id)}
                className="group flex items-center gap-3 rounded-xl border bg-background/60 p-3 transition-colors hover:border-dynamic-purple/30 hover:bg-dynamic-purple/5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
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
                <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
