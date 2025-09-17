'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  UserRound,
} from '@tuturuuu/ui/icons';
import { TaskEstimationDisplay } from '@tuturuuu/ui/tu-do/shared/task-estimation-display';
import { TaskLabelsDisplay } from '@tuturuuu/ui/tu-do/shared/task-labels-display';
import { getDescriptionText } from '@tuturuuu/ui/utils/text-helper';
import { cn } from '@tuturuuu/utils/format';
import {
  formatDistanceToNow,
  isToday,
  isTomorrow,
  isYesterday,
} from 'date-fns';
import Link from 'next/link';
import { useState } from 'react';

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
  initialLimit = 5,
}: ExpandableTaskListProps) {
  const [showAll, setShowAll] = useState(false);
  const displayedTasks = showAll ? tasks : tasks.slice(0, initialLimit);
  const hasMoreTasks = tasks.length > initialLimit;

  const getPriorityColor = (priority: string | null) => {
    switch (priority) {
      case 'critical':
      case 'urgent':
        return 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/20';
      case 'high':
        return 'bg-dynamic-orange/10 text-dynamic-orange border-dynamic-orange/20';
      case 'normal':
      case 'medium':
        return 'bg-dynamic-yellow/10 text-dynamic-yellow border-dynamic-yellow/20';
      case 'low':
        return 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20';
      default:
        return 'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/20';
    }
  };

  const getPriorityLabel = (priority: string | null) => {
    switch (priority) {
      case 'critical':
        return 'Urgent';
      case 'high':
        return 'High';
      case 'normal':
      case 'medium':
        return 'Medium';
      case 'low':
        return 'Low';
      default:
        return priority;
    }
  };

  const formatSmartDate = (date: Date) => {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    if (isYesterday(date)) return 'Yesterday';
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

        return (
          <div
            key={task.id}
            className={cn(
              'group relative rounded-xl border bg-gradient-to-br p-4 transition-all duration-300 hover:scale-[1.02] hover:shadow-md',
              taskOverdue && !task.archived
                ? 'border-dynamic-red/30 from-dynamic-red/5 via-dynamic-red/3 to-dynamic-red/10 shadow-sm ring-1 ring-dynamic-red/20'
                : 'border-dynamic-orange/20 from-dynamic-orange/5 via-dynamic-orange/3 to-dynamic-red/5 hover:border-dynamic-orange/30'
            )}
          >
            {/* Overdue indicator */}
            {taskOverdue && !task.archived && (
              <div className="absolute top-0 right-0 h-0 w-0 border-t-[20px] border-t-dynamic-red border-l-[20px] border-l-transparent">
                <AlertCircle className="-top-4 -right-[18px] absolute h-3 w-3" />
              </div>
            )}

            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h4 className="line-clamp-1 font-semibold text-foreground text-sm transition-colors duration-200">
                      {task.name}
                    </h4>
                    {task.description && (
                      <p className="mt-1.5 line-clamp-2 text-muted-foreground text-xs leading-relaxed">
                        {getDescriptionText(task.description)}
                      </p>
                    )}

                    {/* Dates section */}
                    {(startDate || endDate) && (
                      <div className="mt-3 space-y-1.5">
                        {startDate && startDate > now && (
                          <div className="flex items-center gap-1.5 rounded-md bg-dynamic-blue/5 px-2 py-1 text-muted-foreground">
                            <Clock className="h-3 w-3 shrink-0 text-dynamic-blue" />
                            <span className="truncate font-medium text-xs">
                              Starts {formatSmartDate(startDate)}
                            </span>
                          </div>
                        )}
                        {endDate && (
                          <div
                            className={cn(
                              'flex items-center gap-1.5 rounded-md px-2 py-1',
                              taskOverdue && !task.archived
                                ? 'bg-dynamic-red/10 font-medium text-dynamic-red'
                                : 'bg-dynamic-orange/5 text-muted-foreground'
                            )}
                          >
                            <Calendar
                              className={cn(
                                'h-3 w-3 shrink-0',
                                taskOverdue && !task.archived
                                  ? 'text-dynamic-red'
                                  : 'text-dynamic-orange'
                              )}
                            />
                            <span className="truncate font-medium text-xs">
                              Due {formatSmartDate(endDate)}
                            </span>
                            {taskOverdue && !task.archived && (
                              <Badge className="ml-1 h-4 bg-dynamic-red px-1.5 font-bold text-[9px] text-white tracking-wide shadow-sm">
                                OVERDUE
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        {isPersonal && task.list?.board?.ws_id && (
                          <>
                            <Link
                              href={`/${task.list.board.ws_id}`}
                              className={cn(
                                'rounded-md px-2 py-1 font-medium transition-all duration-200 hover:scale-105',
                                task.list?.board?.workspaces?.personal
                                  ? 'bg-dynamic-purple/10 text-dynamic-purple hover:bg-dynamic-purple/20'
                                  : 'bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20'
                              )}
                            >
                              {task.list?.board?.workspaces?.personal ? (
                                <UserRound className="h-3 w-3" />
                              ) : (
                                task.list?.board?.workspaces?.name
                              )}
                            </Link>
                            <span className="text-muted-foreground">•</span>
                          </>
                        )}
                        {task.list?.board?.id && task.list?.board?.ws_id && (
                          <>
                            <Link
                              href={`/${task.list.board.ws_id}/tasks/boards/${task.list.board.id}`}
                              className="rounded-md bg-dynamic-green/10 px-2 py-1 font-medium text-dynamic-green transition-all duration-200 hover:scale-105 hover:bg-dynamic-green/20"
                            >
                              {task.list?.board?.name || 'Board'}
                            </Link>
                            <span className="text-muted-foreground">•</span>
                          </>
                        )}
                        {task.list?.name &&
                          task.list?.board?.id &&
                          task.list?.board?.ws_id && (
                            <Link
                              href={`/${task.list.board.ws_id}/tasks/boards/${task.list.board.id}`}
                              className="rounded-md bg-dynamic-orange/10 px-2 py-1 font-medium text-dynamic-orange transition-all duration-200 hover:scale-105 hover:bg-dynamic-orange/20"
                            >
                              {task.list.name}
                            </Link>
                          )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex min-w-0 flex-col items-end gap-2.5">
                {/* Top row: Priority and Estimation */}
                <div className="flex items-center gap-2">
                  {task.priority && (
                    <Badge
                      className={cn(
                        'font-bold text-xs shadow-sm transition-all duration-200 hover:scale-105',
                        getPriorityColor(task.priority)
                      )}
                    >
                      {getPriorityLabel(task.priority)}
                    </Badge>
                  )}
                  {task.estimation_points && (
                    <TaskEstimationDisplay
                      points={task.estimation_points}
                      size="sm"
                      showIcon={false}
                      estimationType={task.list?.board?.estimation_type}
                    />
                  )}
                </div>

                {/* Labels row */}
                {task.labels && task.labels.length > 0 && (
                  <div className="flex justify-end">
                    <TaskLabelsDisplay
                      labels={task.labels
                        .map((tl) => tl.label)
                        .filter(
                          (label): label is NonNullable<typeof label> =>
                            label !== null
                        )}
                      size="sm"
                      maxDisplay={2}
                    />
                  </div>
                )}

                {/* Assignees count */}
                <div className="font-medium text-dynamic-orange/70 text-xs">
                  {task.assignees && task.assignees.length > 1 && (
                    <span className="rounded-md bg-dynamic-orange/10 px-2 py-1">
                      +{task.assignees.length - 1} others
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {hasMoreTasks && (
        <div className="flex justify-center pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAll(!showAll)}
            className="h-9 px-4 transition-all duration-200 hover:scale-105 hover:bg-dynamic-orange/10 hover:text-dynamic-orange hover:shadow-sm"
          >
            {showAll ? (
              <>
                <ChevronUp className="mr-1.5 h-3.5 w-3.5" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="mr-1.5 h-3.5 w-3.5" />
                Show {tasks.length - initialLimit} More
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
