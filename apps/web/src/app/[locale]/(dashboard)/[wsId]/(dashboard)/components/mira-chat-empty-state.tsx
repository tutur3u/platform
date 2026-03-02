'use client';

import { cn } from '@tuturuuu/utils/format';
import { emptyStateActions, type GreetingKey } from './mira-chat-constants';
import MiraNameBadge from './mira-name-badge';

interface MiraChatEmptyStateProps {
  assistantName: string;
  greetingKey: GreetingKey;
  greetingT: (key: GreetingKey) => string;
  onQuickAction: (value: string) => void;
  t: (...args: any[]) => string;
  userName?: string;
}

export function MiraChatEmptyState({
  assistantName,
  greetingKey,
  greetingT,
  onQuickAction,
  t,
  userName,
}: MiraChatEmptyStateProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-4 py-10 sm:px-8 sm:py-14">
      <div className="relative mx-auto w-full max-w-3xl">
        <div className="pointer-events-none absolute top-8 left-1/2 h-44 w-44 -translate-x-1/2 rounded-full bg-dynamic-purple/12 blur-3xl" />
        <div className="pointer-events-none absolute top-40 right-10 h-32 w-32 rounded-full bg-dynamic-cyan/6 blur-3xl" />

        <div className="relative mx-auto w-full px-2 py-5 sm:px-6 sm:py-8">
          <div className="flex flex-col items-center text-center">
            <div className="mt-4 max-w-xl space-y-2">
              <h2 className="text-2xl tracking-tight sm:text-3xl">
                <MiraNameBadge currentName={assistantName} className="px-0.5">
                  <span className="bg-linear-to-br from-foreground to-foreground/70 bg-clip-text font-bold text-transparent">
                    {assistantName}
                  </span>
                </MiraNameBadge>
              </h2>
              <p className="font-semibold text-muted-foreground text-sm tracking-tight sm:text-base">
                {greetingT(greetingKey)}
                {userName ? `, ${userName}` : ''}!
              </p>
            </div>
          </div>

          <div className="mt-7 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {emptyStateActions.map((action) => {
              return (
                <button
                  key={action.titleKey}
                  type="button"
                  onClick={() => onQuickAction(t(action.titleKey))}
                  className={cn(
                    'group flex min-w-0 items-center justify-center gap-3 rounded-xl border border-border/30 bg-background/20 px-3.5 py-3 text-center transition-all duration-200',
                    'hover:border-dynamic-purple/30 hover:bg-dynamic-purple/5'
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-sm leading-tight">
                      {t(action.titleKey)}
                    </p>
                    <p className="mt-1 line-clamp-1 text-muted-foreground text-xs leading-relaxed">
                      {t(action.descKey)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
