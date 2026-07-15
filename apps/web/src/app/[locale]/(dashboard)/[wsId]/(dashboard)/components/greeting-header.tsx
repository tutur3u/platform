'use client';

import { Sparkles } from '@tuturuuu/icons';
import { AiCreditIndicator } from '@tuturuuu/tasks-ui/tu-do/my-tasks/ai-credit-indicator';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import MiraNameBadge from './mira-name-badge';

type GreetingKey =
  | 'good_morning'
  | 'good_afternoon'
  | 'good_evening'
  | 'good_night';

interface GreetingHeaderProps {
  currentUser: {
    display_name?: string | null;
    full_name?: string | null;
    email?: string | null;
  };
  assistantName: string;
  wsId: string;
}

function getGreetingKey(): GreetingKey {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'good_morning';
  if (hour >= 12 && hour < 17) return 'good_afternoon';
  if (hour >= 17 && hour < 24) return 'good_evening';
  return 'good_night';
}

export default function GreetingHeader({
  currentUser,
  assistantName,
  wsId,
}: GreetingHeaderProps) {
  const t = useTranslations('dashboard.greeting');

  const greetingKey = useMemo(() => getGreetingKey(), []);
  const userName =
    currentUser.display_name ||
    currentUser.full_name ||
    currentUser.email ||
    '';

  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="truncate font-semibold text-2xl tracking-tight sm:text-3xl">
          {t(greetingKey)}
          {userName ? `, ${userName}` : ''}!
        </h1>
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-muted-foreground">
          <Sparkles className="h-4 w-4 shrink-0 text-dynamic-purple" />
          <span className="text-sm">
            {t('assistant_ready', { name: assistantName })}
          </span>
          <MiraNameBadge currentName={assistantName} />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <AiCreditIndicator wsId={wsId} />
      </div>
    </div>
  );
}
