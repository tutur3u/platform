'use client';

import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  LayoutGrid,
  Loader2,
  UserRound,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  getIconComponentByKey,
  type WorkspaceBoardIconKey,
} from '@tuturuuu/ui/custom/icon-picker';
import { toast } from '@tuturuuu/ui/sonner';
import { useTaskDialog } from '@tuturuuu/ui/tu-do/hooks/useTaskDialog';
import { TaskEstimationDisplay } from '@tuturuuu/ui/tu-do/shared/task-estimation-display';
import { TaskLabelsDisplay } from '@tuturuuu/ui/tu-do/shared/task-labels-display';
import { cn } from '@tuturuuu/utils/format';
import { getDescriptionText } from '@tuturuuu/utils/text-helper';
import {
  formatDistanceToNow,
  isToday,
  isTomorrow,
  isYesterday,
} from 'date-fns';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

interface Task {
  id: string;
  name: string;
  description?: string | null;
  priority?: string | null;
  end_date?: string | null;
  start_date?: string | null;
  estimation_points?: number | null;
  archived?: boolean | null;
  list: {
    id: string;
    name: string | null;
    status?: string | null;
    board: {
      id: string;
      name: string | null;
      icon?: string | null;
      ws_id: string;
      estimation_type?: string | null;
      extended_estimation?: boolean;
      allow_zero_estimates?: boolean;
      workspaces: {
        id: string;
        name: string | null;
        personal: boolean | null;
      } | null;
    } | null;
  } | null;
  assignees: Array<{
    user: {
      id: string;
      display_name: string | null;
      avatar_url?: string | null;
    } | null;
  }> | null;
  labels?: Array<{
    label: {
      id: string;
      name: string;
      color: string;
      created_at: string;
    } | null;
  }> | null;
}

interface ExpandableTaskListProps {
  tasks: Task[];
  isPersonal?: boolean;
  initialLimit?: number;
}

export default function ExpandableTaskList({
  tasks,
  isPersonal = false,
  initialLimit = 3,
}: ExpandableTaskListProps) {
  const { openTask, onUpdate } = useTaskDialog();
  const t = useTranslations('tasks');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks);
  const [completingTasks, setCompletingTasks] = useState<Set<string>>(
    new Set()
  );

  // Update local tasks when props change
  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  // Handle task updates (refresh when tasks are edited)
  const handleUpdate = useCallback(() => {
    console.log('🔄 ExpandableTaskList: Refreshing dashboard tasks...');
    // Small delay to ensure task save has completed
    setTimeout(() => {
      console.log('🔄 ExpandableTaskList: Calling router.refresh()');
      router.refresh();
    }, 150);
  }, [router]);

  // Register update handler with the task dialog (returns cleanup fn)
  useEffect(() => {
    const cleanup = onUpdate(handleUpdate);
    return cleanup;
  }, [onUpdate, handleUpdate]);

  // Toggle task completion
  const handleToggleComplete = async (
    task: Task,
    e?: React.MouseEvent | Record<string, never>
  ): Promise<void> => {
    if (e && 'preventDefault' in e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!task.list?.board?.id) {
      toast.error(t('task_not_associated'));
      return;
    }

    const supabase = createClient();
    setCompletingTasks((prev) => new Set(prev).add(task.id));

    // Store original task for rollback
    const originalTask = task;

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
      const targetList = isCompleted ? notStartedList : doneList;

      // Optimistically update local state
      setLocalTasks((prevTasks) =>
        prevTasks.map((t) =>
          t.id === task.id
            ? {
                ...t,
                list: {
                  ...t.list!,
                  id: targetListId,
                  status: targetList.status,
                },
              }
            : t
        )
      );

      // Move task to appropriate list
      const { error } = await supabase
        .from('tasks')
        .update({ list_id: targetListId })
        .eq('id', task.id);

      if (error) throw error;

      toast.success(
        isCompleted ? t('task_marked_incomplete') : t('task_completed')
      );

      // Refresh the page data
      handleUpdate();
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error(t('failed_to_update_task'));

      // Rollback optimistic update on error
      setLocalTasks((prevTasks) =>
        prevTasks.map((t) => (t.id === task.id ? originalTask : t))
      );
    } finally {
      setCompletingTasks((prev) => {
        const newSet = new Set(prev);
        newSet.delete(task.id);
        return newSet;
      });
    }
  };

  const displayedTasks = showAll
    ? localTasks
    : localTasks.slice(0, initialLimit);
  const hasMoreTasks = localTasks.length > initialLimit;

  const handleEditTask = (task: Task, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

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

    const boardId = task.list?.board?.id || '';
    openTask(transformedTask as any, boardId, undefined);
  };

  const getPriorityConfig = (priority: string | null) => {
    switch (priority) {
      case 'critical':
      case 'urgent':
        return {
          color: 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/20',
          label: t('priority_critical'),
        };
      case 'high':
        return {
          color:
            'bg-dynamic-orange/10 text-dynamic-orange border-dynamic-orange/20',
          label: t('priority_high'),
        };
      case 'normal':
      case 'medium':
        return {
          color:
            'bg-dynamic-yellow/10 text-dynamic-yellow border-dynamic-yellow/20',
          label: t('priority_normal'),
        };
      case 'low':
        return {
          color:
            'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20',
          label: t('priority_low'),
        };
      default:
        return {
          color: 'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/20',
          label: priority,
        };
    }
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
        const startDate = task.start_date ? new Date(task.start_date) : null;
        const now = new Date();
        const priorityConfig = task.priority
          ? getPriorityConfig(task.priority)
          : null;
        const isCompleted = task.list?.status === 'done';
        const isCompleting = completingTasks.has(task.id);

        return (
          <div
            key={task.id}
            className={cn(
              'group relative overflow-hidden rounded-xl border transition-all duration-200 hover:shadow-lg',
              taskOverdue && !task.archived && !isCompleted
                ? 'border-dynamic-red/30 bg-card'
                : isCompleted
                  ? 'border-dynamic-green/20 bg-dynamic-green/5 opacity-70'
                  : 'border-border/50 bg-card hover:border-border'
            )}
          >
            {/* Left accent bar for overdue tasks */}
            {taskOverdue && !task.archived && !isCompleted && (
              <div className="absolute top-0 bottom-0 left-0 w-1 bg-dynamic-red" />
            )}

            {/* Main content */}
            <div
              className={cn(
                'flex items-start gap-3 p-4',
                taskOverdue && !task.archived && !isCompleted && 'pl-5'
              )}
            >
              {/* Checkbox for completion */}
              <div className="flex items-start pt-1">
                {isCompleting ? (
                  <div className="p-0.5">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : isCompleted ? (
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
                className="min-w-0 flex-1 text-left"
                onClick={(e) => handleEditTask(task, e)}
              >
                {/* Top row: Task name + Priority */}
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h4
                      className={cn(
                        'line-clamp-2 font-semibold text-sm leading-tight transition-colors group-hover:text-primary',
                        isCompleted
                          ? 'text-muted-foreground line-through'
                          : 'text-foreground'
                      )}
                    >
                      {task.name}
                    </h4>
                  </div>

                  {/* Priority + Overdue badges */}
                  <div className="flex shrink-0 items-center gap-2">
                    {taskOverdue && !task.archived && (
                      <Badge
                        variant="destructive"
                        className="gap-1 bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/20"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        <span className="text-[10px] uppercase">
                          {t('overdue')}
                        </span>
                      </Badge>
                    )}
                    {priorityConfig && (
                      <Badge
                        className={cn(
                          'font-medium text-[10px] uppercase',
                          priorityConfig.color
                        )}
                      >
                        {priorityConfig.label}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Metadata row */}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                  {/* Workspace (for personal view) */}
                  {isPersonal && task.list?.board?.ws_id && (
                    <>
                      <Link
                        href={`/${task.list.board.ws_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          'flex items-center gap-1 rounded-md px-2 py-0.5 font-medium transition-colors hover:underline',
                          task.list?.board?.workspaces?.personal
                            ? 'bg-dynamic-purple/10 text-dynamic-purple'
                            : 'bg-dynamic-blue/10 text-dynamic-blue'
                        )}
                      >
                        {task.list?.board?.workspaces?.personal ? (
                          <>
                            <UserRound className="h-3 w-3" />
                            {t('personal')}
                          </>
                        ) : (
                          task.list?.board?.workspaces?.name
                        )}
                      </Link>
                      <span className="text-muted-foreground/40">›</span>
                    </>
                  )}

                  {/* Board */}
                  {task.list?.board?.id &&
                    task.list?.board?.ws_id &&
                    (() => {
                      const BoardIcon =
                        getIconComponentByKey(
                          task.list.board.icon as WorkspaceBoardIconKey | null
                        ) ?? LayoutGrid;
                      return (
                        <>
                          <Link
                            href={`/${task.list.board.ws_id}/tasks/boards/${task.list.board.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 rounded-md bg-dynamic-green/10 px-2 py-0.5 font-medium text-dynamic-green transition-colors hover:underline"
                          >
                            <BoardIcon className="h-3 w-3" />
                            {task.list?.board?.name || t('board')}
                          </Link>
                          {task.list?.name && (
                            <span className="text-muted-foreground/40">›</span>
                          )}
                        </>
                      );
                    })()}

                  {/* List */}
                  {task.list?.name && (
                    <span className="rounded-md bg-muted px-2 py-0.5 font-medium">
                      {task.list.name}
                    </span>
                  )}

                  {/* Dates */}
                  {endDate && (
                    <>
                      <span className="text-muted-foreground/30">•</span>
                      <span
                        className={cn(
                          'flex items-center gap-1 rounded-md px-2 py-0.5 font-medium',
                          taskOverdue && !task.archived
                            ? 'bg-dynamic-red/10 text-dynamic-red'
                            : 'bg-dynamic-orange/10 text-dynamic-orange'
                        )}
                      >
                        <Calendar className="h-3 w-3" />
                        {formatSmartDate(endDate)}
                      </span>
                    </>
                  )}

                  {startDate && startDate > now && (
                    <>
                      <span className="text-muted-foreground/30">•</span>
                      <span className="flex items-center gap-1 rounded-md bg-dynamic-blue/10 px-2 py-0.5 font-medium text-dynamic-blue">
                        <Clock className="h-3 w-3" />
                        {t('starts')} {formatSmartDate(startDate)}
                      </span>
                    </>
                  )}
                </div>

                {/* Bottom row: Assignees, Labels, Estimation */}
                {((task.assignees && task.assignees.length > 0) ||
                  (task.labels && task.labels.length > 0) ||
                  (task.estimation_points !== null &&
                    task.estimation_points !== undefined)) && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {/* Assignees */}
                    {task.assignees && task.assignees.length > 0 && (
                      <div className="flex -space-x-1.5">
                        {task.assignees.slice(0, 3).map((assignee) => (
                          <Avatar
                            key={assignee.user?.id}
                            className="h-6 w-6 border-2 border-background ring-1 ring-border/50"
                          >
                            <AvatarImage
                              src={assignee.user?.avatar_url || undefined}
                              alt={assignee.user?.display_name || 'User'}
                            />
                            <AvatarFallback className="bg-muted font-medium text-[10px]">
                              {(assignee.user?.display_name || 'U')
                                .charAt(0)
                                .toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        ))}
                        {task.assignees.length > 3 && (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted font-medium text-[10px] ring-1 ring-border/50">
                            +{task.assignees.length - 3}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Separator */}
                    {task.assignees &&
                      task.assignees.length > 0 &&
                      ((task.labels && task.labels.length > 0) ||
                        task.estimation_points !== null) && (
                        <div className="h-4 w-px bg-border" />
                      )}

                    {/* Labels */}
                    {task.labels && task.labels.length > 0 && (
                      <TaskLabelsDisplay
                        labels={task.labels
                          .map((tl) => tl.label)
                          .filter(
                            (label): label is NonNullable<typeof label> =>
                              label !== null
                          )}
                        size="sm"
                        maxDisplay={3}
                        hiddenLabelsLabel={tCommon('hidden_labels')}
                      />
                    )}

                    {/* Separator */}
                    {task.labels &&
                      task.labels.length > 0 &&
                      task.estimation_points !== null &&
                      task.estimation_points !== undefined && (
                        <div className="h-4 w-px bg-border" />
                      )}

                    {/* Estimation */}
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
                )}

                {/* Description preview */}
                {task.description && getDescriptionText(task.description) && (
                  <p className="mt-3 line-clamp-2 border-border/50 border-t pt-3 text-muted-foreground text-xs leading-relaxed">
                    {getDescriptionText(task.description)}
                  </p>
                )}
              </button>
            </div>
          </div>
        );
      })}

      {/* Show more/less button */}
      {hasMoreTasks && (
        <div className="flex justify-center pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAll(!showAll)}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            {showAll ? (
              <>
                <ChevronUp className="h-4 w-4" />
                {t('show_less')}
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                {t('show_more_tasks', {
                  count: tasks.length - initialLimit,
                })}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
