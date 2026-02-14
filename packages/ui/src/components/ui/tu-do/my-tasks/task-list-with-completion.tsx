'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  UserCheck,
  UserMinus,
  UserRoundCog,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskWithRelations } from '@tuturuuu/types';
import type { Task as PrimitiveTask } from '@tuturuuu/types/primitives/Task';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { toast } from '@tuturuuu/ui/sonner';
import { useTaskDialog } from '@tuturuuu/ui/tu-do/hooks/useTaskDialog';
import { TaskEstimationDisplay } from '@tuturuuu/ui/tu-do/shared/task-estimation-display';
import { cn } from '@tuturuuu/utils/format';
import {
  formatDistanceToNow,
  isToday,
  isTomorrow,
  isYesterday,
} from 'date-fns';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type MouseEvent, useState } from 'react';
import { MyTaskContextMenu } from './my-task-context-menu';
import { MY_TASKS_QUERY_KEY, type MyTasksData } from './use-my-tasks-query';

interface TaskListWithCompletionProps {
  tasks: TaskWithRelations[];
  isPersonal?: boolean;
  userId: string;
  initialLimit?: number;
  onTaskUpdate?: () => void;
  availableLabels?: Array<{ id: string; name: string; color: string }>;
  onCreateNewLabel?: () => void;
}

export default function TaskListWithCompletion({
  tasks,
  isPersonal = false,
  userId,
  initialLimit = 3,
  onTaskUpdate,
  availableLabels = [],
  onCreateNewLabel,
}: TaskListWithCompletionProps) {
  const t = useTranslations('ws-tasks');
  const { openTask } = useTaskDialog();
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [completingTasks, setCompletingTasks] = useState<Set<string>>(
    new Set()
  );
  const [contextMenuTaskId, setContextMenuTaskId] = useState<string | null>(
    null
  );
  const [menuGuardUntil, setMenuGuardUntil] = useState(0);

  const displayedTasks = showAll ? tasks : tasks.slice(0, initialLimit);
  const hasMoreTasks = tasks.length > initialLimit;

  // Helper: remove a task from query cache optimistically
  const removeTaskFromCache = (taskId: string) => {
    queryClient.setQueriesData<MyTasksData>(
      { queryKey: [MY_TASKS_QUERY_KEY] },
      (old) => {
        if (!old) return old;
        return {
          ...old,
          overdue: old.overdue.filter((t) => t.id !== taskId),
          today: old.today.filter((t) => t.id !== taskId),
          upcoming: old.upcoming.filter((t) => t.id !== taskId),
          totalActiveTasks: old.totalActiveTasks - 1,
        };
      }
    );
  };

  // Helper: restore query cache from snapshot
  const restoreCache = (
    snapshot: [readonly unknown[], MyTasksData | undefined][]
  ) => {
    for (const [key, data] of snapshot) {
      queryClient.setQueryData(key, data);
    }
  };

  // Helper: snapshot current query cache
  const snapshotCache = () => {
    const queries = queryClient.getQueriesData<MyTasksData>({
      queryKey: [MY_TASKS_QUERY_KEY],
    });
    return queries.map(
      ([key, data]) =>
        [key, data] as [readonly unknown[], MyTasksData | undefined]
    );
  };

  const handleToggleComplete = async (
    task: TaskWithRelations,
    e?: React.MouseEvent | Record<string, never>
  ): Promise<void> => {
    if (e && 'preventDefault' in e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Undo "done with my part" — clear personally_unassigned override
    if (task.overrides?.personally_unassigned) {
      setCompletingTasks((prev) => new Set(prev).add(task.id));
      try {
        const response = await fetch(
          `/api/v1/users/me/tasks/${task.id}/overrides`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ personally_unassigned: false }),
          }
        );
        if (!response.ok) throw new Error('Failed to update override');
        toast.success(t('restored_to_active'));
        onTaskUpdate?.();
      } catch (error) {
        console.error('Error updating task override:', error);
        toast.error(t('failed_update_task'));
      } finally {
        setCompletingTasks((prev) => {
          const newSet = new Set(prev);
          newSet.delete(task.id);
          return newSet;
        });
      }
      return;
    }

    // Self-managed personal completion toggle
    if (task.overrides?.self_managed) {
      const isAlreadyDone = !!task.overrides.completed_at;
      setCompletingTasks((prev) => new Set(prev).add(task.id));
      const snapshot = snapshotCache();
      if (!isAlreadyDone) removeTaskFromCache(task.id);

      try {
        const response = await fetch(
          `/api/v1/users/me/tasks/${task.id}/overrides`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              completed_at: isAlreadyDone ? null : new Date().toISOString(),
            }),
          }
        );
        if (!response.ok) throw new Error('Failed to update override');
        toast.success(
          isAlreadyDone
            ? t('personal_completion_undone')
            : t('task_personally_completed')
        );
        onTaskUpdate?.();
      } catch (error) {
        console.error('Error updating task override:', error);
        toast.error(t('failed_update_task_reverted'));
        if (!isAlreadyDone) restoreCache(snapshot);
      } finally {
        setCompletingTasks((prev) => {
          const newSet = new Set(prev);
          newSet.delete(task.id);
          return newSet;
        });
      }
      return;
    }

    if (!task.list?.board?.id) {
      toast.error(t('task_not_on_board'));
      return;
    }

    const supabase = createClient();
    setCompletingTasks((prev) => new Set(prev).add(task.id));
    const snapshot = snapshotCache();

    try {
      // Find the board's done list
      const { data: lists } = await supabase
        .from('task_lists')
        .select('id, status')
        .eq('board_id', task.list.board.id)
        .eq('deleted', false);

      const doneList = lists?.find((l) => l.status === 'done');
      const notStartedList = lists?.find((l) => l.status === 'not_started');

      if (!doneList || !notStartedList) {
        toast.error(t('could_not_find_lists'));
        setCompletingTasks((prev) => {
          const newSet = new Set(prev);
          newSet.delete(task.id);
          return newSet;
        });
        return;
      }

      const isCompleted = task.list?.status === 'done';
      const targetListId = isCompleted ? notStartedList.id : doneList.id;

      // Optimistic: remove from view (completion hides task)
      removeTaskFromCache(task.id);

      // Move task to appropriate list
      const { error } = await supabase
        .from('tasks')
        .update({ list_id: targetListId })
        .eq('id', task.id);

      if (error) throw error;

      // When completing a task, clear redundant personal overrides
      if (
        !isCompleted &&
        (task.overrides?.completed_at || task.overrides?.personally_unassigned)
      ) {
        await fetch(`/api/v1/users/me/tasks/${task.id}/overrides`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            completed_at: null,
            personally_unassigned: false,
          }),
        }).catch(() => {
          // Non-critical cleanup — don't block the completion flow
        });
      }

      toast.success(
        isCompleted ? t('task_marked_incomplete') : t('task_completed_toast')
      );
      onTaskUpdate?.();
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error(t('failed_update_task_reverted'));
      restoreCache(snapshot);
    } finally {
      setCompletingTasks((prev) => {
        const newSet = new Set(prev);
        newSet.delete(task.id);
        return newSet;
      });
    }
  };

  const handlePersonalUnassign = async (
    task: TaskWithRelations,
    e: MouseEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setCompletingTasks((prev) => new Set(prev).add(task.id));
    const snapshot = snapshotCache();
    removeTaskFromCache(task.id);

    try {
      const response = await fetch(
        `/api/v1/users/me/tasks/${task.id}/overrides`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ personally_unassigned: true }),
        }
      );
      if (!response.ok) throw new Error('Failed to update override');
      toast.success(t('marked_done_with_part'));
      onTaskUpdate?.();
    } catch (error) {
      console.error('Error updating task override:', error);
      toast.error(t('failed_update_task_reverted'));
      restoreCache(snapshot);
    } finally {
      setCompletingTasks((prev) => {
        const newSet = new Set(prev);
        newSet.delete(task.id);
        return newSet;
      });
    }
  };

  const handleEditTask = (task: TaskWithRelations, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!task.list?.board?.id) {
      toast.error(t('task_not_on_board'));
      return;
    }

    const boardId = task.list.board.id;

    const transformedTask = {
      ...task,
      labels: task.labels
        ?.map((tl) => tl.label)
        .filter((label): label is NonNullable<typeof label> => label !== null),
      assignees: task.assignees
        ?.map((ta) => ta.user)
        .filter((user): user is NonNullable<typeof user> => user !== null)
        .map((user) => ({
          id: user.id,
          display_name: user.display_name,
          avatar_url: user.avatar_url,
        })),
    };

    openTask(
      transformedTask as unknown as PrimitiveTask,
      boardId,
      undefined,
      true,
      {
        taskWsId: task.list.board.ws_id,
        taskWorkspacePersonal:
          (task.list.board as any).workspaces?.personal ?? undefined,
      }
    );
  };

  const formatSmartDate = (date: Date) => {
    if (isToday(date)) return t('date_today');
    if (isTomorrow(date)) return t('date_tomorrow');
    if (isYesterday(date)) return t('date_yesterday');
    return formatDistanceToNow(date, { addSuffix: true });
  };

  const isOverdue = (endDate: string | null | undefined) => {
    if (!endDate) return false;
    return new Date(endDate) < new Date();
  };

  return (
    <div className="space-y-3">
      {displayedTasks.map((task) => {
        const taskOverdue = isOverdue(task.end_date);
        const endDate = task.end_date ? new Date(task.end_date) : null;
        const isCompleted = task.list?.status === 'done';
        const isPersonallyCompleted = !!task.overrides?.completed_at;
        const isPersonallyUnassigned = !!task.overrides?.personally_unassigned;
        const isCompleting = completingTasks.has(task.id);

        return (
          <MyTaskContextMenu
            key={task.id}
            task={task}
            userId={userId}
            open={contextMenuTaskId === task.id}
            onOpenChange={(open) => {
              setContextMenuTaskId(open ? task.id : null);
            }}
            menuGuardUntil={menuGuardUntil}
            isPersonal={isPersonal}
            availableLabels={availableLabels}
            onTaskUpdate={onTaskUpdate ?? (() => {})}
            onCreateNewLabel={onCreateNewLabel}
          >
            <div
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenuTaskId(task.id);
                setMenuGuardUntil(Date.now() + 300);
              }}
              className={cn(
                'group relative overflow-hidden rounded-xl border p-5 shadow-sm transition-all duration-300',
                taskOverdue &&
                  !task.archived &&
                  !isCompleted &&
                  !isPersonallyCompleted &&
                  !isPersonallyUnassigned
                  ? 'border-dynamic-red/30 bg-linear-to-br from-dynamic-red/5 via-dynamic-red/3 to-transparent'
                  : isCompleted ||
                      isPersonallyCompleted ||
                      isPersonallyUnassigned
                    ? 'border-dynamic-green/20 bg-dynamic-green/5 opacity-70'
                    : 'border-border/50 bg-linear-to-br from-card via-card/95 to-card/90 hover:border-primary/30 hover:shadow-lg'
              )}
            >
              {/* Main content area */}
              <div className="flex items-start gap-3">
                {/* Checkbox for completion */}
                <div className="flex items-start pt-1">
                  {isCompleting ? (
                    <div className="p-0.5">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  ) : isCompleted ||
                    isPersonallyCompleted ||
                    isPersonallyUnassigned ? (
                    <button
                      type="button"
                      onClick={(e) => handleToggleComplete(task, e)}
                      className="group/checkbox rounded-md p-0.5 transition-all hover:bg-muted/50"
                    >
                      <CheckCircle2 className="h-5 w-5 text-dynamic-green transition-transform group-hover/checkbox:scale-110" />
                    </button>
                  ) : (
                    <Checkbox
                      checked={false}
                      onCheckedChange={() =>
                        handleToggleComplete(task, {} as Record<string, never>)
                      }
                      className="h-5 w-5 transition-all hover:scale-110 hover:border-primary"
                    />
                  )}
                </div>

                {/* Task info - clickable area */}
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left lg:gap-y-3"
                  onClick={(e) => handleEditTask(task, e)}
                >
                  {/* Desktop layout */}
                  {(() => {
                    const hasLabels = task.labels && task.labels.length > 0;
                    const hasProjects =
                      task.projects && task.projects.length > 0;
                    const hasLine2 = hasLabels || hasProjects;
                    return (
                      <div
                        className={cn(
                          'flex flex-col',
                          hasLine2 ? 'gap-y-3' : ''
                        )}
                      >
                        <div className="hidden items-center justify-between gap-2 md:flex">
                          <div className="flex flex-1 items-center gap-2">
                            <h4
                              className={cn(
                                'font-bold text-base leading-snug transition-colors duration-200 group-hover:text-primary',
                                isCompleted ||
                                  isPersonallyCompleted ||
                                  isPersonallyUnassigned
                                  ? 'text-muted-foreground line-through'
                                  : 'text-foreground'
                              )}
                            >
                              {task.name}
                            </h4>
                            {task.overrides?.self_managed && (
                              <Badge
                                variant="secondary"
                                className="h-5 shrink-0 gap-1 border-dynamic-purple/30 bg-dynamic-purple/15 px-1.5 text-[10px] text-dynamic-purple"
                              >
                                <UserRoundCog className="h-3 w-3" />
                              </Badge>
                            )}
                            {isPersonallyCompleted && (
                              <Badge
                                variant="secondary"
                                className="h-5 shrink-0 gap-1 border-dynamic-green/30 bg-dynamic-green/15 px-1.5 text-[10px] text-dynamic-green"
                              >
                                <UserCheck className="h-3 w-3" />
                                <span className="hidden sm:inline">
                                  {t('personally_done')}
                                </span>
                              </Badge>
                            )}
                            {isPersonallyUnassigned && (
                              <Badge
                                variant="secondary"
                                className="h-5 shrink-0 gap-1 border-dynamic-orange/30 bg-dynamic-orange/15 px-1.5 text-[10px] text-dynamic-orange"
                              >
                                <UserMinus className="h-3 w-3" />
                                <span className="hidden sm:inline">
                                  {t('done_with_my_part')}
                                </span>
                              </Badge>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs">
                            {task.list?.board?.id &&
                              task.list?.board?.ws_id && (
                                <Link
                                  href={`/${task.list.board.ws_id}/tasks/boards/${task.list.board.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="group/link flex items-center gap-1.5 rounded-lg bg-dynamic-green/10 px-2.5 py-1 font-semibold text-dynamic-green shadow-sm ring-1 ring-dynamic-green/20 transition-all hover:bg-dynamic-green/20 hover:shadow-md"
                                >
                                  <span className="truncate group-hover/link:underline">
                                    {task.list?.board?.name || 'Board'}
                                  </span>
                                </Link>
                              )}

                            {task.list?.board?.id && task.list?.name && (
                              <span className="text-muted-foreground/40">
                                →
                              </span>
                            )}

                            {task.list?.name && (
                              <span className="truncate rounded-lg bg-dynamic-purple/10 px-2.5 py-1 font-semibold text-dynamic-purple shadow-sm ring-1 ring-dynamic-purple/20">
                                {task.list.name}
                              </span>
                            )}

                            {endDate && (
                              <span className="text-muted-foreground/30">
                                •
                              </span>
                            )}

                            {endDate && (
                              <div
                                className={cn(
                                  'flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium shadow-sm ring-1 transition-colors',
                                  taskOverdue && !task.archived && !isCompleted
                                    ? 'bg-dynamic-red/10 text-dynamic-red ring-dynamic-red/20'
                                    : 'bg-dynamic-orange/10 text-dynamic-orange ring-dynamic-orange/20'
                                )}
                              >
                                <Calendar className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">
                                  {formatSmartDate(endDate)}
                                </span>
                              </div>
                            )}

                            {task.assignees && task.assignees.length > 0 && (
                              <>
                                <span className="text-muted-foreground/30">
                                  •
                                </span>
                                <div className="flex -space-x-2">
                                  {task.assignees
                                    .slice(0, 2)
                                    .map((assignee) => (
                                      <Avatar
                                        key={assignee.user?.id}
                                        className="h-6 w-6 border-2 border-background shadow-sm ring-1 ring-border/50 transition-all duration-200 hover:z-10 hover:scale-110 hover:ring-primary/30"
                                      >
                                        <AvatarImage
                                          src={
                                            assignee.user?.avatar_url ||
                                            undefined
                                          }
                                          alt={
                                            assignee.user?.display_name ||
                                            'User'
                                          }
                                        />
                                        <AvatarFallback className="font-semibold text-[9px]">
                                          {(assignee.user?.display_name || 'U')
                                            .charAt(0)
                                            .toUpperCase()}
                                        </AvatarFallback>
                                      </Avatar>
                                    ))}
                                  {task.assignees.length > 2 && (
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-linear-to-br from-primary/20 to-primary/10 font-bold text-[8px] text-primary shadow-sm ring-1 ring-border/50">
                                      +{task.assignees.length - 2}
                                    </div>
                                  )}
                                </div>
                              </>
                            )}

                            {task.estimation_points !== null &&
                              task.estimation_points !== undefined && (
                                <>
                                  <span className="text-muted-foreground/30">
                                    •
                                  </span>
                                  <TaskEstimationDisplay
                                    points={task.estimation_points}
                                    size="sm"
                                    showIcon={true}
                                    estimationType={
                                      task.list?.board?.estimation_type
                                    }
                                  />
                                </>
                              )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Mobile layout */}
                  <div className="space-y-4 md:hidden">
                    <div className="mt-1 flex items-start gap-3">
                      <h4
                        className={cn(
                          'line-clamp-2 flex-1 font-bold text-base leading-snug transition-colors duration-200 group-hover:text-primary',
                          isCompleted ||
                            isPersonallyCompleted ||
                            isPersonallyUnassigned
                            ? 'text-muted-foreground line-through'
                            : 'text-foreground'
                        )}
                      >
                        {task.name}
                      </h4>
                      {task.overrides?.self_managed && (
                        <Badge
                          variant="secondary"
                          className="h-5 shrink-0 gap-1 border-dynamic-purple/30 bg-dynamic-purple/15 px-1.5 text-[10px] text-dynamic-purple"
                        >
                          <UserRoundCog className="h-3 w-3" />
                        </Badge>
                      )}
                      {isPersonallyCompleted && (
                        <Badge
                          variant="secondary"
                          className="h-5 shrink-0 gap-1 border-dynamic-green/30 bg-dynamic-green/15 px-1.5 text-[10px] text-dynamic-green"
                        >
                          <UserCheck className="h-3 w-3" />
                        </Badge>
                      )}
                      {isPersonallyUnassigned && (
                        <Badge
                          variant="secondary"
                          className="h-5 shrink-0 gap-1 border-dynamic-orange/30 bg-dynamic-orange/15 px-1.5 text-[10px] text-dynamic-orange"
                        >
                          <UserMinus className="h-3 w-3" />
                        </Badge>
                      )}
                      {task.estimation_points !== null &&
                        task.estimation_points !== undefined && (
                          <TaskEstimationDisplay
                            points={task.estimation_points}
                            size="sm"
                            showIcon={true}
                            estimationType={task.list?.board?.estimation_type}
                          />
                        )}
                    </div>

                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
                        {task.list?.board?.id && task.list?.board?.ws_id && (
                          <Link
                            href={`/${task.list.board.ws_id}/tasks/boards/${task.list.board.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="group/link flex items-center gap-1 rounded-lg bg-dynamic-green/10 px-2 py-0.5 font-semibold text-dynamic-green shadow-sm ring-1 ring-dynamic-green/20 transition-all hover:bg-dynamic-green/20"
                          >
                            <span className="truncate group-hover/link:underline">
                              {task.list?.board?.name || 'Board'}
                            </span>
                          </Link>
                        )}

                        {task.list?.board?.id && task.list?.name && (
                          <span className="text-muted-foreground/40">→</span>
                        )}

                        {task.list?.name && (
                          <span className="truncate rounded-lg bg-dynamic-purple/10 px-2 py-0.5 font-semibold text-dynamic-purple text-xs shadow-sm ring-1 ring-dynamic-purple/20">
                            {task.list.name}
                          </span>
                        )}

                        {endDate && (
                          <span className="text-muted-foreground/30">•</span>
                        )}

                        {endDate && (
                          <div
                            className={cn(
                              'flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium shadow-sm ring-1 transition-colors',
                              taskOverdue && !task.archived && !isCompleted
                                ? 'bg-dynamic-red/10 text-dynamic-red ring-dynamic-red/20'
                                : 'bg-dynamic-orange/10 text-dynamic-orange ring-dynamic-orange/20'
                            )}
                          >
                            <Calendar className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">
                              {formatSmartDate(endDate)}
                            </span>
                          </div>
                        )}

                        {task.assignees && task.assignees.length > 0 && (
                          <>
                            <span className="text-muted-foreground/30">•</span>
                            <div className="flex -space-x-2">
                              {task.assignees.slice(0, 2).map((assignee) => (
                                <Avatar
                                  key={assignee.user?.id}
                                  className="h-6 w-6 border-2 border-background shadow-sm ring-1 ring-border/50 transition-all duration-200 hover:z-10 hover:scale-110 hover:ring-primary/30"
                                >
                                  <AvatarImage
                                    src={assignee.user?.avatar_url || undefined}
                                    alt={assignee.user?.display_name || 'User'}
                                  />
                                  <AvatarFallback className="font-semibold text-[9px]">
                                    {(assignee.user?.display_name || 'U')
                                      .charAt(0)
                                      .toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                              ))}
                              {task.assignees.length > 2 && (
                                <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-linear-to-br from-primary/20 to-primary/10 font-bold text-[8px] text-primary shadow-sm ring-1 ring-border/50">
                                  +{task.assignees.length - 2}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </button>

                {/* Inline "Done with my part" action for self-managed tasks */}
                {task.overrides?.self_managed && !isCompleting && (
                  <button
                    type="button"
                    onClick={(e) => handlePersonalUnassign(task, e)}
                    className="hidden shrink-0 items-center gap-1 self-center rounded-md px-2 py-1 text-dynamic-red text-xs transition-opacity hover:bg-dynamic-red/10 md:flex md:opacity-0 md:group-hover:opacity-100"
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </MyTaskContextMenu>
        );
      })}

      {hasMoreTasks && (
        <div className="flex justify-center pt-6">
          <Button
            variant="outline"
            size="default"
            onClick={() => setShowAll(!showAll)}
            className="group h-11 gap-2.5 rounded-xl border-2 px-8 font-semibold shadow-sm transition-all duration-200 hover:scale-105 hover:border-primary hover:bg-primary/5 hover:shadow-lg"
          >
            {showAll ? (
              <>
                <ChevronUp className="h-4 w-4 transition-transform group-hover:-translate-y-0.5" />
                <span>{t('show_less')}</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
                <span>
                  {t('show_n_more_tasks', {
                    count: tasks.length - initialLimit,
                  })}
                </span>
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
