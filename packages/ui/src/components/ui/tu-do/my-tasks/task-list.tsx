'use client';

import {
  Calendar,
  CheckCircle2,
  Clock,
  Flag,
  LayoutDashboard,
  Loader2,
} from '@tuturuuu/icons';
import type { TaskWithRelations } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef } from 'react';
import { useTasksHref } from '../tasks-route-context';
import { TaskSection } from './task-section';

interface TaskListProps {
  wsId: string;
  userId: string;
  isPersonal: boolean;
  commandBarLoading: boolean;
  isAiGenerating?: boolean;
  queryLoading?: boolean;
  overdueTasks: TaskWithRelations[] | undefined;
  todayTasks: TaskWithRelations[] | undefined;
  upcomingTasks: TaskWithRelations[] | undefined;
  completedTasks: TaskWithRelations[];
  totalActiveTasks: number;
  totalCompletedTasks: number;
  hasMoreCompleted: boolean;
  isFetchingMoreCompleted: boolean;
  onFetchMoreCompleted: () => void;
  collapsedSections: {
    overdue: boolean;
    today: boolean;
    upcoming: boolean;
    completed: boolean;
  };
  toggleSection: (
    section: 'overdue' | 'today' | 'upcoming' | 'completed'
  ) => void;
  handleUpdate: () => void;
  availableLabels?: Array<{ id: string; name: string; color: string }>;
  onCreateNewLabel?: () => void;
}

export default function TaskList({
  wsId,
  userId,
  isPersonal,
  commandBarLoading,
  isAiGenerating = false,
  queryLoading = false,
  overdueTasks,
  todayTasks,
  upcomingTasks,
  completedTasks,
  totalActiveTasks,
  totalCompletedTasks,
  hasMoreCompleted,
  isFetchingMoreCompleted,
  onFetchMoreCompleted,
  collapsedSections,
  toggleSection,
  handleUpdate,
  availableLabels,
  onCreateNewLabel,
}: TaskListProps) {
  const t = useTranslations();
  const tasksHref = useTasksHref();
  const params = useParams();
  const locale = params?.locale as string | undefined;

  // Infinite scroll trigger for completed tasks
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (
        entry?.isIntersecting &&
        hasMoreCompleted &&
        !isFetchingMoreCompleted
      ) {
        onFetchMoreCompleted();
      }
    },
    [hasMoreCompleted, isFetchingMoreCompleted, onFetchMoreCompleted]
  );

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(handleIntersection, {
      rootMargin: '200px',
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleIntersection]);

  return (
    <div className="space-y-4">
      {/* Loading state for command bar actions */}
      {commandBarLoading && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-linear-to-br from-primary/5 to-primary/10 p-4 shadow-sm">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="font-medium text-sm">
            {isAiGenerating
              ? t('ws-tasks.generating_tasks_ai')
              : t('ws-tasks.creating_your_task')}
          </p>
        </div>
      )}

      {/* Skeleton loading state for initial query */}
      {queryLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-border/50 p-5 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <Skeleton className="h-5 w-5 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-20 rounded-lg" />
                    <Skeleton className="h-4 w-16 rounded-lg" />
                    <Skeleton className="h-4 w-24 rounded-lg" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Overdue Tasks */}
      {overdueTasks && overdueTasks.length > 0 && (
        <TaskSection
          title={t('ws-tasks.overdue')}
          subtitle={t('ws-tasks.requires_attention')}
          icon={<Clock className="h-4 w-4 text-dynamic-red" />}
          colorToken="red"
          tasks={overdueTasks}
          isCollapsed={collapsedSections.overdue}
          onToggle={() => toggleSection('overdue')}
          isPersonal={isPersonal}
          userId={userId}
          onTaskUpdate={handleUpdate}
          availableLabels={availableLabels}
          onCreateNewLabel={onCreateNewLabel}
        />
      )}

      {/* Due Today */}
      {todayTasks && todayTasks.length > 0 && (
        <TaskSection
          title={t('ws-tasks.due_today')}
          subtitle={t('ws-tasks.complete_by_end_of_day')}
          icon={<Calendar className="h-4 w-4 text-dynamic-orange" />}
          colorToken="orange"
          tasks={todayTasks}
          isCollapsed={collapsedSections.today}
          onToggle={() => toggleSection('today')}
          isPersonal={isPersonal}
          userId={userId}
          onTaskUpdate={handleUpdate}
          availableLabels={availableLabels}
          onCreateNewLabel={onCreateNewLabel}
        />
      )}

      {/* Upcoming Tasks */}
      {upcomingTasks && upcomingTasks.length > 0 && (
        <TaskSection
          title={t('ws-tasks.upcoming')}
          subtitle={t('ws-tasks.plan_ahead')}
          icon={<Flag className="h-4 w-4 text-dynamic-blue" />}
          colorToken="blue"
          tasks={upcomingTasks}
          isCollapsed={collapsedSections.upcoming}
          onToggle={() => toggleSection('upcoming')}
          isPersonal={isPersonal}
          userId={userId}
          onTaskUpdate={handleUpdate}
          availableLabels={availableLabels}
          onCreateNewLabel={onCreateNewLabel}
        />
      )}

      {/* All Caught Up State */}
      {totalActiveTasks === 0 && !commandBarLoading && !queryLoading && (
        <Card className="border-none bg-transparent">
          <CardContent className="flex flex-col items-center justify-center gap-6 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-dynamic-green/15">
              <CheckCircle2 className="h-10 w-10 text-dynamic-green" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-2xl">
                {t('ws-tasks.all_caught_up')}
              </h3>
              <p className="mx-auto max-w-md text-muted-foreground">
                {t('ws-tasks.all_caught_up_description')}
              </p>
            </div>
            {locale && (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button variant="default" asChild className="gap-2">
                  <Link href={`/${locale}/${wsId}${tasksHref('/boards')}`}>
                    <LayoutDashboard className="h-4 w-4" />
                    {t('ws-tasks.browse_boards')}
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Completed Tasks */}
      {completedTasks.length > 0 && (
        <>
          <TaskSection
            title={t('ws-tasks.completed')}
            subtitle={`${totalCompletedTasks} ${t('ws-tasks.tasks_completed')}`}
            icon={<CheckCircle2 className="h-4 w-4 text-dynamic-green" />}
            colorToken="green"
            tasks={completedTasks}
            isCollapsed={collapsedSections.completed}
            onToggle={() => toggleSection('completed')}
            isPersonal={isPersonal}
            userId={userId}
            onTaskUpdate={handleUpdate}
            availableLabels={availableLabels}
            onCreateNewLabel={onCreateNewLabel}
          />

          {/* Infinite scroll trigger */}
          {!collapsedSections.completed && (
            <div ref={loadMoreRef} className="flex justify-center py-2">
              {isFetchingMoreCompleted && (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
