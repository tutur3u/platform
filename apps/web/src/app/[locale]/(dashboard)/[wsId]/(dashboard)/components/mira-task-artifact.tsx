'use client';

import { ArrowUpRight, Circle, Flag } from '@tuturuuu/icons';
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
            className={`rounded-lg border px-2.5 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-pressed:border-primary ${group === 'overdue' ? 'bg-destructive/5' : group === 'today' ? 'bg-chart-1/10' : 'bg-chart-2/10'}`}
          >
            <span
              className={`block font-semibold text-xl tabular-nums ${group === 'overdue' ? 'text-destructive' : ''}`}
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
      <ul className="divide-y divide-border/60">
        {visible.slice(0, limit).map((row) => (
          <li key={row.id}>
            <a
              href={
                row.path
                  ? getTasksAppUrlClient(`/${locale}${row.path}`)
                  : undefined
              }
              target="_blank"
              rel="noreferrer"
              className="group flex gap-2 rounded-md px-1 py-2.5 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Circle
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
              />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 font-medium text-sm leading-snug">
                  {row.title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  {row.detail && (
                    <span className="max-w-full truncate">{row.detail}</span>
                  )}
                  {row.date && (
                    <time
                      dateTime={row.date}
                      className={
                        row.group === 'overdue' ? 'text-destructive' : ''
                      }
                    >
                      {format.dateTime(new Date(row.date), {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </time>
                  )}
                  {!row.date && <span>{t('no_due_date')}</span>}
                  {(row.priority === 'critical' || row.priority === 'high') && (
                    <span className="inline-flex items-center gap-1 text-destructive">
                      <Flag aria-hidden className="size-3" />
                      {t(row.priority)}
                    </span>
                  )}
                </div>
              </div>
              {row.path && (
                <ArrowUpRight
                  aria-hidden
                  className="mt-0.5 size-3 shrink-0 text-muted-foreground opacity-40 group-hover:opacity-100"
                />
              )}
            </a>
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
