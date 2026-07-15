'use client';

import { Calendar, Clock, Flag } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';

interface MyTasksHeaderProps {
  overdueCount: number;
  todayCount: number;
  upcomingCount: number;
}

export function MyTasksHeader({
  overdueCount,
  todayCount,
  upcomingCount,
}: MyTasksHeaderProps) {
  const t = useTranslations();
  const locale = useLocale();

  const { greetingMessage, formattedDate } = useMemo(() => {
    const now = new Date();
    const hour = now.getHours();
    let greeting: string;
    if (hour >= 5 && hour < 12) greeting = t('ws-tasks.good_morning');
    else if (hour >= 12 && hour < 18) greeting = t('ws-tasks.good_afternoon');
    else if (hour >= 18 && hour < 22) greeting = t('ws-tasks.good_evening');
    else greeting = t('ws-tasks.good_night');

    return {
      greetingMessage: greeting,
      formattedDate: now.toLocaleDateString(locale, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
    };
  }, [t, locale]);

  const cards = [
    {
      key: 'overdue',
      count: overdueCount,
      label: t('ws-tasks.overdue'),
      icon: Clock,
      bg: 'bg-dynamic-red/5',
      border: 'border-dynamic-red/15',
      iconBg: 'bg-dynamic-red/10',
      text: 'text-dynamic-red',
    },
    {
      key: 'today',
      count: todayCount,
      label: t('ws-tasks.due_today'),
      icon: Calendar,
      bg: 'bg-dynamic-orange/5',
      border: 'border-dynamic-orange/15',
      iconBg: 'bg-dynamic-orange/10',
      text: 'text-dynamic-orange',
    },
    {
      key: 'upcoming',
      count: upcomingCount,
      label: t('ws-tasks.upcoming'),
      icon: Flag,
      bg: 'bg-dynamic-blue/5',
      border: 'border-dynamic-blue/15',
      iconBg: 'bg-dynamic-blue/10',
      text: 'text-dynamic-blue',
    },
  ] as const;

  return (
    <div className="space-y-4">
      {/* Greeting */}
      <div className="space-y-1 px-1">
        <h1 className="font-bold text-2xl tracking-tight md:text-3xl">
          {greetingMessage}
        </h1>
        <p className="text-muted-foreground text-sm">{formattedDate}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        {cards.map((card) => (
          <div
            key={card.key}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-colors md:flex-row md:gap-3 md:p-4',
              card.bg,
              card.border
            )}
          >
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg md:h-9 md:w-9',
                card.iconBg
              )}
            >
              <card.icon className={cn('h-4 w-4 md:h-5 md:w-5', card.text)} />
            </div>
            <div className="text-center md:text-left">
              <p
                className={cn(
                  'font-bold text-lg leading-none md:text-xl',
                  card.text
                )}
              >
                {card.count}
              </p>
              <p className="mt-0.5 text-muted-foreground text-xs">
                {card.label}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
