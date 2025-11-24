'use client';

import {
  Calendar,
  CheckCircle2,
  ChevronUp,
  Clock,
  Flag,
  LayoutDashboard,
} from '@tuturuuu/icons';
import type { TaskWithRelations } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import TaskListWithCompletion from './task-list-with-completion';

interface TaskListProps {
  wsId: string;
  isPersonal: boolean;
  commandBarLoading: boolean;
  isAiGenerating?: boolean;
  overdueTasks: TaskWithRelations[] | undefined;
  todayTasks: TaskWithRelations[] | undefined;
  upcomingTasks: TaskWithRelations[] | undefined;
  totalActiveTasks: number;
  collapsedSections: {
    overdue: boolean;
    today: boolean;
    upcoming: boolean;
  };
  toggleSection: (section: 'overdue' | 'today' | 'upcoming') => void;
  handleUpdate: () => void;
}

// Group tasks by priority for better organization
const groupTasksByPriority = (tasks: TaskWithRelations[] | undefined) => {
  const emptyResult = {
    critical: [] as TaskWithRelations[],
    high: [] as TaskWithRelations[],
    normal: [] as TaskWithRelations[],
    low: [] as TaskWithRelations[],
    none: [] as TaskWithRelations[],
  };

  if (!tasks) return emptyResult;

  return tasks.reduce(
    (acc, task) => {
      const priority = task.priority || 'none';
      if (priority === 'critical' || priority === 'urgent') {
        acc.critical.push(task);
      } else if (priority === 'high') {
        acc.high.push(task);
      } else if (priority === 'normal' || priority === 'medium') {
        acc.normal.push(task);
      } else if (priority === 'low') {
        acc.low.push(task);
      } else {
        acc.none.push(task);
      }
      return acc;
    },
    {
      critical: [] as TaskWithRelations[],
      high: [] as TaskWithRelations[],
      normal: [] as TaskWithRelations[],
      low: [] as TaskWithRelations[],
      none: [] as TaskWithRelations[],
    }
  );
};

export default function TaskList({
  wsId,
  isPersonal,
  commandBarLoading,
  isAiGenerating = false,
  overdueTasks,
  todayTasks,
  upcomingTasks,
  totalActiveTasks,
  collapsedSections,
  toggleSection,
  handleUpdate,
}: TaskListProps) {
  const t = useTranslations();
  const params = useParams();
  const locale = params?.locale as string | undefined;

  return (
    <>
      {/* Loading message when tasks are being created */}
      {commandBarLoading && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-linear-to-br from-primary/5 to-primary/10 p-4 shadow-sm">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="font-medium text-sm">
            {isAiGenerating
              ? 'Generating tasks with AI...'
              : 'Creating your task...'}
          </p>
        </div>
      )}

      {/* Overdue Tasks */}
      {overdueTasks && overdueTasks.length > 0 ? (
        <div className="space-y-4">
          {/* Section Header */}
          <button
            type="button"
            onClick={() => toggleSection('overdue')}
            className="w-full text-left transition-all hover:opacity-90"
          >
            <div className="flex items-center justify-between rounded-2xl border border-dynamic-red/30 bg-linear-to-br from-dynamic-red/10 via-dynamic-red/5 to-background p-6 shadow-lg">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-dynamic-red/20 shadow-inner">
                  <Clock className="h-6 w-6 text-dynamic-red" />
                </div>
                <div>
                  <h3 className="font-bold text-2xl text-dynamic-red">
                    {t('ws-tasks.overdue')}
                  </h3>
                  <p className="mt-1 text-muted-foreground text-sm">
                    Requires immediate attention
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge
                  variant="secondary"
                  className="h-10 rounded-xl bg-dynamic-red/20 px-4 font-bold text-dynamic-red text-lg shadow-md"
                >
                  {overdueTasks.length}
                </Badge>
                <ChevronUp
                  className={cn(
                    'h-6 w-6 text-dynamic-red transition-transform duration-300',
                    !collapsedSections.overdue && 'rotate-180'
                  )}
                />
              </div>
            </div>
          </button>

          {/* Task List - Grouped by Priority */}
          {!collapsedSections.overdue && (
            <div className="space-y-6">
              {(() => {
                const grouped = groupTasksByPriority(overdueTasks);
                return (
                  <>
                    {/* Critical Priority */}
                    {grouped.critical.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 px-2">
                          <div className="h-2 w-2 rounded-full bg-dynamic-red" />
                          <span className="font-bold text-dynamic-red text-xs uppercase tracking-wider">
                            Critical Priority ({grouped.critical.length})
                          </span>
                          <div className="h-px flex-1 bg-linear-to-r from-dynamic-red/30 to-transparent" />
                        </div>
                        <TaskListWithCompletion
                          tasks={grouped.critical}
                          isPersonal={isPersonal}
                          initialLimit={10}
                          onTaskUpdate={handleUpdate}
                        />
                      </div>
                    )}

                    {/* High Priority */}
                    {grouped.high.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 px-2">
                          <div className="h-2 w-2 rounded-full bg-dynamic-orange" />
                          <span className="font-bold text-dynamic-orange text-xs uppercase tracking-wider">
                            High Priority ({grouped.high.length})
                          </span>
                          <div className="h-px flex-1 bg-linear-to-r from-dynamic-orange/30 to-transparent" />
                        </div>
                        <TaskListWithCompletion
                          tasks={grouped.high}
                          isPersonal={isPersonal}
                          initialLimit={10}
                          onTaskUpdate={handleUpdate}
                        />
                      </div>
                    )}

                    {/* Normal Priority */}
                    {grouped.normal.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 px-2">
                          <div className="h-2 w-2 rounded-full bg-dynamic-blue" />
                          <span className="font-bold text-dynamic-blue text-xs uppercase tracking-wider">
                            Normal Priority ({grouped.normal.length})
                          </span>
                          <div className="h-px flex-1 bg-linear-to-r from-dynamic-blue/30 to-transparent" />
                        </div>
                        <TaskListWithCompletion
                          tasks={grouped.normal}
                          isPersonal={isPersonal}
                          initialLimit={10}
                          onTaskUpdate={handleUpdate}
                        />
                      </div>
                    )}

                    {/* Low Priority + No Priority */}
                    {(grouped.low.length > 0 || grouped.none.length > 0) && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 px-2">
                          <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                          <span className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                            Low Priority (
                            {grouped.low.length + grouped.none.length})
                          </span>
                          <div className="h-px flex-1 bg-linear-to-r from-muted-foreground/30 to-transparent" />
                        </div>
                        <TaskListWithCompletion
                          tasks={[...grouped.low, ...grouped.none]}
                          isPersonal={isPersonal}
                          initialLimit={10}
                          onTaskUpdate={handleUpdate}
                        />
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      ) : null}

      {/* Due Today */}
      {todayTasks && todayTasks.length > 0 ? (
        <div className="space-y-4">
          {/* Section Header */}
          <button
            type="button"
            onClick={() => toggleSection('today')}
            className="w-full text-left transition-all hover:opacity-90"
          >
            <div className="flex items-center justify-between rounded-2xl border border-dynamic-orange/30 bg-linear-to-br from-dynamic-orange/10 via-dynamic-orange/5 to-background p-6 shadow-lg">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-dynamic-orange/20 shadow-inner">
                  <Calendar className="h-6 w-6 text-dynamic-orange" />
                </div>
                <div>
                  <h3 className="font-bold text-2xl text-dynamic-orange">
                    {t('ws-tasks.due_today')}
                  </h3>
                  <p className="mt-1 text-muted-foreground text-sm">
                    Complete by end of day
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge
                  variant="secondary"
                  className="h-10 rounded-xl bg-dynamic-orange/20 px-4 font-bold text-dynamic-orange text-lg shadow-md"
                >
                  {todayTasks.length}
                </Badge>
                <ChevronUp
                  className={cn(
                    'h-6 w-6 text-dynamic-orange transition-transform duration-300',
                    !collapsedSections.today && 'rotate-180'
                  )}
                />
              </div>
            </div>
          </button>

          {/* Task List - Grouped by Priority */}
          {!collapsedSections.today && (
            <div className="space-y-6">
              {(() => {
                const grouped = groupTasksByPriority(todayTasks);
                return (
                  <>
                    {/* Critical Priority */}
                    {grouped.critical.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 px-2">
                          <div className="h-2 w-2 rounded-full bg-dynamic-red" />
                          <span className="font-bold text-dynamic-red text-xs uppercase tracking-wider">
                            Critical Priority ({grouped.critical.length})
                          </span>
                          <div className="h-px flex-1 bg-linear-to-r from-dynamic-red/30 to-transparent" />
                        </div>
                        <TaskListWithCompletion
                          tasks={grouped.critical}
                          isPersonal={isPersonal}
                          initialLimit={10}
                          onTaskUpdate={handleUpdate}
                        />
                      </div>
                    )}

                    {/* High Priority */}
                    {grouped.high.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 px-2">
                          <div className="h-2 w-2 rounded-full bg-dynamic-orange" />
                          <span className="font-bold text-dynamic-orange text-xs uppercase tracking-wider">
                            High Priority ({grouped.high.length})
                          </span>
                          <div className="h-px flex-1 bg-linear-to-r from-dynamic-orange/30 to-transparent" />
                        </div>
                        <TaskListWithCompletion
                          tasks={grouped.high}
                          isPersonal={isPersonal}
                          initialLimit={10}
                          onTaskUpdate={handleUpdate}
                        />
                      </div>
                    )}

                    {/* Normal Priority */}
                    {grouped.normal.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 px-2">
                          <div className="h-2 w-2 rounded-full bg-dynamic-blue" />
                          <span className="font-bold text-dynamic-blue text-xs uppercase tracking-wider">
                            Normal Priority ({grouped.normal.length})
                          </span>
                          <div className="h-px flex-1 bg-linear-to-r from-dynamic-blue/30 to-transparent" />
                        </div>
                        <TaskListWithCompletion
                          tasks={grouped.normal}
                          isPersonal={isPersonal}
                          initialLimit={10}
                          onTaskUpdate={handleUpdate}
                        />
                      </div>
                    )}

                    {/* Low Priority + No Priority */}
                    {(grouped.low.length > 0 || grouped.none.length > 0) && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 px-2">
                          <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                          <span className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                            Low Priority (
                            {grouped.low.length + grouped.none.length})
                          </span>
                          <div className="h-px flex-1 bg-linear-to-r from-muted-foreground/30 to-transparent" />
                        </div>
                        <TaskListWithCompletion
                          tasks={[...grouped.low, ...grouped.none]}
                          isPersonal={isPersonal}
                          initialLimit={10}
                          onTaskUpdate={handleUpdate}
                        />
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      ) : null}

      {/* Upcoming Tasks */}
      {upcomingTasks && upcomingTasks.length > 0 ? (
        <div className="space-y-4">
          {/* Section Header */}
          <button
            type="button"
            onClick={() => toggleSection('upcoming')}
            className="w-full text-left transition-all hover:opacity-90"
          >
            <div className="flex items-center justify-between rounded-2xl border border-dynamic-blue/30 bg-linear-to-br from-dynamic-blue/10 via-dynamic-blue/5 to-background p-6 shadow-lg">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-dynamic-blue/20 shadow-inner">
                  <Flag className="h-6 w-6 text-dynamic-blue" />
                </div>
                <div>
                  <h3 className="font-bold text-2xl text-dynamic-blue">
                    {t('ws-tasks.upcoming')}
                  </h3>
                  <p className="mt-1 text-muted-foreground text-sm">
                    Plan ahead and stay on track
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge
                  variant="secondary"
                  className="h-10 rounded-xl bg-dynamic-blue/20 px-4 font-bold text-dynamic-blue text-lg shadow-md"
                >
                  {upcomingTasks.length}
                </Badge>
                <ChevronUp
                  className={cn(
                    'h-6 w-6 text-dynamic-blue transition-transform duration-300',
                    !collapsedSections.upcoming && 'rotate-180'
                  )}
                />
              </div>
            </div>
          </button>

          {/* Task List - Grouped by Priority */}
          {!collapsedSections.upcoming && (
            <div className="space-y-6">
              {(() => {
                const grouped = groupTasksByPriority(upcomingTasks);
                return (
                  <>
                    {/* Critical Priority */}
                    {grouped.critical.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 px-2">
                          <div className="h-2 w-2 rounded-full bg-dynamic-red" />
                          <span className="font-bold text-dynamic-red text-xs uppercase tracking-wider">
                            Critical Priority ({grouped.critical.length})
                          </span>
                          <div className="h-px flex-1 bg-linear-to-r from-dynamic-red/30 to-transparent" />
                        </div>
                        <TaskListWithCompletion
                          tasks={grouped.critical}
                          isPersonal={isPersonal}
                          initialLimit={10}
                          onTaskUpdate={handleUpdate}
                        />
                      </div>
                    )}

                    {/* High Priority */}
                    {grouped.high.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 px-2">
                          <div className="h-2 w-2 rounded-full bg-dynamic-orange" />
                          <span className="font-bold text-dynamic-orange text-xs uppercase tracking-wider">
                            High Priority ({grouped.high.length})
                          </span>
                          <div className="h-px flex-1 bg-linear-to-r from-dynamic-orange/30 to-transparent" />
                        </div>
                        <TaskListWithCompletion
                          tasks={grouped.high}
                          isPersonal={isPersonal}
                          initialLimit={10}
                          onTaskUpdate={handleUpdate}
                        />
                      </div>
                    )}

                    {/* Normal Priority */}
                    {grouped.normal.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 px-2">
                          <div className="h-2 w-2 rounded-full bg-dynamic-blue" />
                          <span className="font-bold text-dynamic-blue text-xs uppercase tracking-wider">
                            Normal Priority ({grouped.normal.length})
                          </span>
                          <div className="h-px flex-1 bg-linear-to-r from-dynamic-blue/30 to-transparent" />
                        </div>
                        <TaskListWithCompletion
                          tasks={grouped.normal}
                          isPersonal={isPersonal}
                          initialLimit={10}
                          onTaskUpdate={handleUpdate}
                        />
                      </div>
                    )}

                    {/* Low Priority + No Priority */}
                    {(grouped.low.length > 0 || grouped.none.length > 0) && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 px-2">
                          <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                          <span className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                            Low Priority (
                            {grouped.low.length + grouped.none.length})
                          </span>
                          <div className="h-px flex-1 bg-linear-to-r from-muted-foreground/30 to-transparent" />
                        </div>
                        <TaskListWithCompletion
                          tasks={[...grouped.low, ...grouped.none]}
                          isPersonal={isPersonal}
                          initialLimit={10}
                          onTaskUpdate={handleUpdate}
                        />
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      ) : null}

      {/* All Caught Up State */}
      {totalActiveTasks === 0 && !commandBarLoading && (
        <Card className="border-none bg-transparent">
          <CardContent className="flex flex-col items-center justify-center gap-6 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-dynamic-green/15">
              <CheckCircle2 className="h-10 w-10 text-dynamic-green" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-2xl">You're all caught up!</h3>
              <p className="mx-auto max-w-md text-muted-foreground">
                No active tasks right now. Browse your boards to view all tasks
                or take a moment to plan your next move.
              </p>
            </div>
            {locale && (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button variant="default" asChild className="gap-2">
                  <Link href={`/${locale}/${wsId}/tasks/boards`}>
                    <LayoutDashboard className="h-4 w-4" />
                    Browse Boards
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
