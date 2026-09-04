'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

type GreetingKey =
  | 'good_morning'
  | 'good_afternoon'
  | 'good_evening'
  | 'good_night';

const actions = [
  ['quick_calendar', 'quick_calendar_desc'],
  ['quick_tasks', 'quick_tasks_desc'],
  ['quick_focus', 'quick_focus_desc'],
  ['quick_log', 'quick_log_desc'],
] as const;

function getGreetingKey(): GreetingKey {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'good_morning';
  if (hour >= 12 && hour < 17) return 'good_afternoon';
  if (hour >= 17 && hour < 24) return 'good_evening';
  return 'good_night';
}

export function EmptyScreen({
  assistantName,
  setInput,
  userName,
}: {
  assistantName: string;
  setInput: (input: string) => void;
  userName?: string;
}) {
  const t = useTranslations('ai_chat');
  const greetingKey = useMemo(() => getGreetingKey(), []);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-4 py-10 sm:px-8 sm:py-14">
      <div className="relative mx-auto w-full max-w-3xl">
        <div className="pointer-events-none absolute top-8 left-1/2 h-44 w-44 -translate-x-1/2 rounded-full bg-dynamic-purple/12 blur-3xl" />
        <div className="pointer-events-none absolute top-40 right-10 h-32 w-32 rounded-full bg-dynamic-cyan/6 blur-3xl" />

        <div className="relative mx-auto w-full px-2 py-5 sm:px-6 sm:py-8">
          <div className="flex flex-col items-center text-center">
            <div className="mt-4 max-w-xl space-y-2">
              <h1 className="bg-linear-to-br from-foreground to-foreground/70 bg-clip-text font-bold text-2xl text-transparent tracking-tight sm:text-3xl">
                {assistantName}
              </h1>
              <p className="font-semibold text-muted-foreground text-sm tracking-tight sm:text-base">
                {t(greetingKey)}
                {userName ? `, ${userName}` : ''}!
              </p>
            </div>
          </div>

          <div className="mt-7 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {actions.map(([titleKey, descKey]) => (
              <button
                key={titleKey}
                type="button"
                onClick={() => setInput(t(titleKey))}
                className="group flex min-w-0 items-center justify-center gap-3 rounded-xl border border-border/30 bg-background/20 px-3.5 py-3 text-center transition-all duration-200 hover:border-dynamic-purple/30 hover:bg-dynamic-purple/5"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm leading-tight">
                    {t(titleKey)}
                  </p>
                  <p className="mt-1 line-clamp-1 text-muted-foreground text-xs leading-relaxed">
                    {t(descKey)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
