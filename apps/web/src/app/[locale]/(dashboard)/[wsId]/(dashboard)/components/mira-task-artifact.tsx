'use client';

import { TaskSummaryCard } from '@tuturuuu/tasks-ui/tu-do/shared/task-summary-card';
import { isTaskPriority } from '@tuturuuu/types/primitives/Priority';
import { Button } from '@tuturuuu/ui/button';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { getTasksAppUrlClient } from '@/lib/tasks-app-url-client';
import type { ArtifactRow } from './mira-artifact-data';

export function MiraTaskArtifact({
  rows,
  initialFilter = 'all',
}: {
  rows: ArtifactRow[];
  initialFilter?: string;
}) {
  const t = useTranslations('dashboard.mira_workspace');
  const format = useFormatter();
  const locale = useLocale();
  const [filter, setFilter] = useState(initialFilter);
  const [limit, setLimit] = useState(12);
  const [previousFilter, setPreviousFilter] = useState(initialFilter);
  if (previousFilter !== initialFilter) {
    setPreviousFilter(initialFilter);
    setFilter(initialFilter);
    setLimit(12);
  }
  const groups = ['overdue', 'today', 'upcoming'] as const;
  const visible = rows.filter(
    (row) => filter === 'all' || row.group === filter
  );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5">
        {groups.map((group) => (
          <button
            key={group}
            type="button"
            aria-pressed={filter === group}
            onClick={() => {
              setFilter(filter === group ? 'all' : group);
              setLimit(12);
            }}
            className={`flex items-center justify-between gap-1 rounded-lg border px-2.5 py-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-pressed:border-primary ${group === 'overdue' ? 'bg-destructive/5' : group === 'today' ? 'bg-chart-1/10' : 'bg-chart-2/10'}`}
          >
            <span
              className={`order-2 font-semibold text-xs tabular-nums ${group === 'overdue' ? 'text-destructive' : ''}`}
            >
              {rows.filter((row) => row.group === group).length}
            </span>
            <span className="text-muted-foreground text-xs">{t(group)}</span>
          </button>
        ))}
      </div>
      {visible.length === 0 && (
        <p className="py-4 text-center text-muted-foreground text-xs">
          {t('no_matching_items')}
        </p>
      )}
      <ul className="grid @min-[36rem]:grid-cols-2 gap-2">
        {visible.slice(0, limit).map((row) => (
          <li key={row.id}>
            <TaskSummaryCard
              title={row.title}
              href={
                row.path
                  ? getTasksAppUrlClient(`/${locale}${row.path}`)
                  : undefined
              }
              source={row.detail}
              listName={row.listName}
              priority={isTaskPriority(row.priority) ? row.priority : undefined}
              priorityLabel={
                isTaskPriority(row.priority) ? t(row.priority) : undefined
              }
              date={row.date}
              dateLabel={
                row.date
                  ? format.dateTime(new Date(row.date), {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZone:
                        Intl.DateTimeFormat().resolvedOptions().timeZone,
                    })
                  : t('no_due_date')
              }
              overdue={row.group === 'overdue'}
              estimationPoints={row.estimationPoints}
              estimationType={row.estimationType}
              estimationLabel={t('estimation')}
              labels={row.labels}
              assignees={row.assignees}
            />
          </li>
        ))}
      </ul>
      {visible.length > limit && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-full text-xs"
          onClick={() => setLimit(limit + 12)}
        >
          {t('show_more', { count: visible.length - limit })}
        </Button>
      )}
    </div>
  );
}
