'use client';

import {
  CalendarClock,
  CircleCheck,
  LifeBuoy,
  Sun,
  UserX,
} from '@tuturuuu/icons';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

export interface TutoringOverviewCounts {
  completed: number | undefined;
  missed: number | undefined;
  pending: number | undefined;
  queue: number | undefined;
  today: number | undefined;
}

interface StatDefinition {
  accent: string;
  hint: string;
  icon: ReactNode;
  key: keyof TutoringOverviewCounts;
  label: string;
}

function StatCard({
  definition,
  isLoading,
  value,
}: {
  definition: StatDefinition;
  isLoading: boolean;
  value: number | undefined;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-3 p-3 md:p-4">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
            definition.accent
          )}
        >
          {definition.icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-muted-foreground text-xs">
            {definition.label}
          </p>
          {isLoading && value === undefined ? (
            <Skeleton className="mt-1 h-6 w-10" />
          ) : (
            <p className="font-semibold text-xl leading-tight">{value ?? 0}</p>
          )}
          <p className="truncate text-[11px] text-muted-foreground">
            {definition.hint}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function TutoringOverview({
  counts,
  isLoading,
}: {
  counts: TutoringOverviewCounts;
  isLoading: boolean;
}) {
  const t = useTranslations('ws-tutoring');

  const definitions: StatDefinition[] = [
    {
      accent: 'border-dynamic-blue/25 bg-dynamic-blue/10 text-dynamic-blue',
      hint: t('stat_today_hint'),
      icon: <Sun className="h-4 w-4" />,
      key: 'today',
      label: t('stat_today'),
    },
    {
      accent:
        'border-dynamic-orange/25 bg-dynamic-orange/10 text-dynamic-orange',
      hint: t('stat_pending_hint'),
      icon: <CalendarClock className="h-4 w-4" />,
      key: 'pending',
      label: t('stat_pending'),
    },
    {
      accent: 'border-dynamic-green/25 bg-dynamic-green/10 text-dynamic-green',
      hint: t('stat_completed_hint'),
      icon: <CircleCheck className="h-4 w-4" />,
      key: 'completed',
      label: t('stat_completed'),
    },
    {
      accent: 'border-dynamic-red/25 bg-dynamic-red/10 text-dynamic-red',
      hint: t('stat_missed_hint'),
      icon: <UserX className="h-4 w-4" />,
      key: 'missed',
      label: t('stat_missed'),
    },
    {
      accent:
        'border-dynamic-purple/25 bg-dynamic-purple/10 text-dynamic-purple',
      hint: t('stat_queue_hint'),
      icon: <LifeBuoy className="h-4 w-4" />,
      key: 'queue',
      label: t('stat_queue'),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
      {definitions.map((definition) => (
        <StatCard
          key={definition.key}
          definition={definition}
          isLoading={isLoading}
          value={counts[definition.key]}
        />
      ))}
    </div>
  );
}
