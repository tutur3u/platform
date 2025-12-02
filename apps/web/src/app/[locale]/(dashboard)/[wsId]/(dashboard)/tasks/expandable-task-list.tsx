'use client';

import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  LayoutGrid,
  UserRound,
} from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
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
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState } from 'react';

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
    board: {
      id: string;
      name: string | null;
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
  const { openTask } = useTaskDialog();
  const t = useTranslations('tasks');
  const [showAll, setShowAll] = useState(false);
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks);

  // Update local tasks when props change
  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

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
          label: t('priority_urgent'),
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
          label: t('priority_medium'),
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

        return (
          <button
            key={task.id}
            type="button"
            className={cn(
              'group relative w-full cursor-pointer overflow-hidden rounded-xl border text-left transition-all duration-200 hover:shadow-lg',
              taskOverdue && !task.archived
                ? 'border-dynamic-red/30 bg-card'
                : 'border-border/50 bg-card hover:border-border'
            )}
            onClick={(e) => handleEditTask(task, e)}
          >
            {/* Left accent bar for overdue tasks */}
            {taskOverdue && !task.archived && (
              <div className="absolute top-0 bottom-0 left-0 w-1 bg-dynamic-red" />
            )}

            {/* Main content */}
            <div className={cn('p-4', taskOverdue && !task.archived && 'pl-5')}>
              {/* Top row: Task name + Priority */}
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h4 className="line-clamp-2 font-semibold text-foreground text-sm leading-tight transition-colors group-hover:text-primary">
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
                {task.list?.board?.id && task.list?.board?.ws_id && (
                  <>
                    <Link
                      href={`/${task.list.board.ws_id}/tasks/boards/${task.list.board.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 rounded-md bg-dynamic-green/10 px-2 py-0.5 font-medium text-dynamic-green transition-colors hover:underline"
                    >
                      <LayoutGrid className="h-3 w-3" />
                      {task.list?.board?.name || t('board')}
                    </Link>
                    {task.list?.name && (
                      <span className="text-muted-foreground/40">›</span>
                    )}
                  </>
                )}

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
                    <div className="-space-x-1.5 flex">
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
            </div>
          </button>
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
