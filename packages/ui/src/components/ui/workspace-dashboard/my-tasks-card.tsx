'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { DashboardCard } from './dashboard-card';
import {
  DashboardCardEmpty,
  DashboardCardError,
  DashboardRowsSkeleton,
} from './dashboard-card-states';
import { type DashboardTaskRow, toTaskRows } from './dashboard-model';
import { dashboardTasksQuery } from './dashboard-queries';
import { TaskRow } from './task-row';
import { useCompleteDashboardTask } from './use-complete-dashboard-task';
import { useNow } from './use-now';

interface MyTasksCardProps {
  wsId: string;
  isPersonal: boolean;
  /** Tasks app destination for "All". */
  tasksHref: string;
  /** Tasks app task composer (`/[wsId]/tasks/new`). */
  newTaskHref: string;
}

const headerLink =
  'inline-flex items-center gap-0.5 whitespace-nowrap rounded-md px-1 text-muted-foreground text-xs hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring';

export function MyTasksCard({
  wsId,
  isPersonal,
  tasksHref,
  newTaskHref,
}: MyTasksCardProps) {
  const t = useTranslations('dashboard.overview');
  const now = useNow();
  const query = useQuery(dashboardTasksQuery(wsId, isPersonal));
  const complete = useCompleteDashboardTask(wsId, isPersonal);

  return (
    <DashboardCard
      id="tasks"
      title={t('my_tasks')}
      meta={
        query.status === 'success'
          ? t('open_count', { count: query.data.totalActiveTasks })
          : null
      }
      actions={
        <>
          <a
            href={newTaskHref}
            aria-label={t('new_task')}
            title={t('new_task')}
            className={cn(headerLink, 'size-7 justify-center px-0')}
          >
            <Plus aria-hidden className="size-4" />
          </a>
          <a href={tasksHref} className={headerLink}>
            {t('view_all')}
            <ChevronRight aria-hidden className="size-3.5" />
          </a>
        </>
      }
    >
      {query.status === 'pending' ? (
        <DashboardRowsSkeleton rows={4} label={t('loading')} />
      ) : query.status === 'error' ? (
        <DashboardCardError
          message={t('tasks_error')}
          retryLabel={t('retry')}
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : query.data.totalActiveTasks === 0 ? (
        <DashboardCardEmpty
          action={
            <a href={newTaskHref} className={cn(headerLink, 'px-0')}>
              <Plus aria-hidden className="size-3.5" />
              {t('new_task')}
            </a>
          }
        >
          {t('no_open_tasks')}
        </DashboardCardEmpty>
      ) : (
        <TaskGroups
          rows={toTaskRows(query.data, now)}
          pendingId={complete.isPending ? complete.variables?.id : undefined}
          onComplete={(row) => complete.mutate(row.task)}
        />
      )}
    </DashboardCard>
  );
}

function TaskGroups({
  rows,
  pendingId,
  onComplete,
}: {
  rows: DashboardTaskRow[];
  pendingId?: string;
  onComplete: (row: DashboardTaskRow) => void;
}) {
  const t = useTranslations('dashboard.overview');
  const groups = (['overdue', 'today', 'upcoming'] as const)
    .map((key) => ({ key, rows: rows.filter((row) => row.group === key) }))
    .filter((group) => group.rows.length > 0);

  return (
    <div className="grid gap-1">
      {groups.map((group) => (
        <div key={group.key} className="min-w-0">
          <h3
            className={cn(
              'pt-2 pb-0.5 font-semibold text-xs',
              group.key === 'overdue'
                ? 'text-dynamic-red'
                : 'text-muted-foreground'
            )}
          >
            {t(`group_${group.key}`)}
          </h3>
          <ul className="grid min-w-0">
            {group.rows.map((row) => (
              <TaskRow
                key={row.id}
                row={row}
                pending={pendingId === row.id}
                onComplete={() => onComplete(row)}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
