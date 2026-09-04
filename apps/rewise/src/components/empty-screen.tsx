import {
  BrainCircuit,
  FileText,
  GraduationCap,
  Lightbulb,
  Sparkles,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

interface PromptStarter {
  icon: ReactNode;
  label: string;
  prompt: string;
}

export function EmptyScreen({
  setInput,
}: {
  setInput: (input: string) => void;
}) {
  const t = useTranslations('ai_chat');
  const starters: PromptStarter[] = [
    {
      icon: <BrainCircuit className="size-4" />,
      label: t('starter_plan'),
      prompt: t('starter_plan_prompt'),
    },
    {
      icon: <GraduationCap className="size-4" />,
      label: t('starter_learn'),
      prompt: t('starter_learn_prompt'),
    },
    {
      icon: <FileText className="size-4" />,
      label: t('starter_summarize'),
      prompt: t('starter_summarize_prompt'),
    },
    {
      icon: <Lightbulb className="size-4" />,
      label: t('starter_brainstorm'),
      prompt: t('starter_brainstorm_prompt'),
    },
  ];

  return (
    <main className="flex h-full min-h-0 w-full items-center justify-center px-4 py-8 sm:px-8 sm:py-12">
      <div className="relative mx-auto w-full max-w-2xl">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-1/2 size-44 -translate-x-1/2 rounded-full bg-primary/8 blur-3xl"
        />

        <div className="relative flex flex-col items-center text-center">
          <div className="flex size-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <Sparkles className="size-4" />
          </div>
          <h1 className="mt-4 font-semibold text-2xl tracking-tight sm:text-3xl">
            Rewise
          </h1>
          <p className="mt-2 max-w-lg text-pretty text-muted-foreground text-sm leading-6">
            {t('assistant_heading')}
          </p>

          <div className="mt-7 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
            {starters.map((starter) => (
              <Button
                key={starter.label}
                type="button"
                variant="ghost"
                className="group h-auto min-h-12 justify-center gap-2.5 whitespace-normal rounded-xl border border-border/30 bg-background/20 px-3.5 py-3 text-center transition-colors hover:border-primary/30 hover:bg-primary/5"
                onClick={() => setInput(starter.prompt)}
              >
                <span className="text-muted-foreground transition-colors group-hover:text-primary">
                  {starter.icon}
                </span>
                <span className="font-medium text-sm">{starter.label}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
