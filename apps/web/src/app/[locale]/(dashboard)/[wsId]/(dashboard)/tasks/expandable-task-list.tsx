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
import { TaskEditDialog } from '@tuturuuu/ui/tu-do/shared/task-edit-dialog';
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
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const displayedTasks = showAll ? tasks : tasks.slice(0, initialLimit);
  const hasMoreTasks = tasks.length > initialLimit;

  const handleEditTask = (task: Task, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingTask(task);
    setIsEditDialogOpen(true);
  };

  const handleCloseEditDialog = () => {
    setIsEditDialogOpen(false);
    setEditingTask(null);
  };

  const handleUpdateTask = () => {
    // Trigger refresh by re-rendering
    window.location.reload();
  };

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
          <button
            key={task.id}
            type="button"
            className={cn(
              'group relative w-full cursor-pointer rounded-xl border p-4 text-left transition-all duration-300 hover:shadow-lg',
              taskOverdue && !task.archived
                ? 'border-dynamic-red/30 bg-dynamic-red/5 shadow-sm ring-1 ring-dynamic-red/20'
                : 'border-dynamic-orange/20 bg-dynamic-orange/5 hover:border-dynamic-orange/30'
            )}
            onClick={(e) => handleEditTask(task, e)}
          >
            {/* Overdue indicator - Enhanced */}
            {taskOverdue && !task.archived && (
              <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-dynamic-red/15 px-3 py-1 ring-1 ring-dynamic-red/30 backdrop-blur-sm">
                <AlertCircle className="h-3.5 w-3.5 text-dynamic-red" />
                <span className="font-bold text-[10px] text-dynamic-red tracking-widest">
                  OVERDUE
                </span>
              </div>
            )}

            {/* Main content area */}
            <div className="flex items-start gap-4">
              {/* Left side - Task info */}
              <div className="min-w-0 flex-1 space-y-3">
                {/* Task name and priority badge */}
                <div className="flex items-start gap-3">
                  <h4 className="line-clamp-2 flex-1 font-semibold text-foreground text-sm leading-snug transition-colors duration-200">
                    {task.name}
                  </h4>
                  {task.priority && (
                    <Badge
                      className={cn(
                        'shrink-0 font-semibold text-[10px] tracking-wide shadow-sm',
                        getPriorityColor(task.priority)
                      )}
                    >
                      {getPriorityLabel(task.priority)}
                    </Badge>
                  )}
                </div>

                {/* Metadata row - Improved layout */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                  {/* Board/List context */}
                  {task.list?.board?.id && task.list?.board?.ws_id && (
                    <Link
                      href={`/${task.list.board.ws_id}/tasks/boards/${task.list.board.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="group/link flex items-center gap-1.5 rounded-md bg-dynamic-green/10 px-2 py-1 font-medium text-dynamic-green transition-all hover:bg-dynamic-green/20"
                    >
                      <span className="truncate group-hover/link:underline">
                        {task.list?.board?.name || 'Board'}
                      </span>
                    </Link>
                  )}

                  {task.list?.name && (
                    <>
                      <span className="text-foreground">→</span>
                      <span className="truncate rounded-md bg-dynamic-purple/10 px-2 py-1 text-dynamic-purple">
                        {task.list.name}
                      </span>
                    </>
                  )}

                  {/* Workspace badge for personal view */}
                  {isPersonal && task.list?.board?.ws_id && (
                    <>
                      <span className="text-muted-foreground/30">•</span>
                      <Link
                        href={`/${task.list.board.ws_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          'group/ws flex items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-all',
                          task.list?.board?.workspaces?.personal
                            ? 'bg-dynamic-purple/10 text-dynamic-purple hover:bg-dynamic-purple/20'
                            : 'bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20'
                        )}
                      >
                        {task.list?.board?.workspaces?.personal ? (
                          <>
                            <UserRound className="h-3.5 w-3.5" />
                            <span className="truncate group-hover/ws:underline">
                              Personal
                            </span>
                          </>
                        ) : (
                          <span className="truncate group-hover/ws:underline">
                            {task.list?.board?.workspaces?.name}
                          </span>
                        )}
                      </Link>
                    </>
                  )}

                  {/* Date info - most important */}
                  {(endDate || (startDate && startDate > now)) && (
                    <span className="text-muted-foreground/30">•</span>
                  )}

                  {endDate && (
                    <div
                      className={cn(
                        'flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors',
                        taskOverdue && !task.archived
                          ? 'bg-dynamic-red/10 font-semibold text-dynamic-red'
                          : 'bg-dynamic-orange/10 text-dynamic-orange'
                      )}
                    >
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {formatSmartDate(endDate)}
                      </span>
                    </div>
                  )}

                  {startDate && startDate > now && (
                    <div className="flex items-center gap-1.5 rounded-md bg-dynamic-blue/10 px-2 py-1 text-dynamic-blue">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        Starts {formatSmartDate(startDate)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Bottom row - labels, estimation, assignees - Enhanced */}
                <div className="flex flex-wrap items-center gap-2.5">
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
                      maxDisplay={4}
                    />
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

                  {/* Assignees */}
                  {task.assignees && task.assignees.length > 0 && (
                    <div className="flex items-center gap-1.5 rounded-md bg-dynamic-blue/10 px-2 py-1 text-[10px] text-dynamic-blue ring-1 ring-dynamic-blue/20">
                      <UserRound className="h-3.5 w-3.5" />
                      <span className="font-medium">
                        {task.assignees.length}
                      </span>
                    </div>
                  )}
                </div>

                {/* Description - only show if exists */}
                {task.description && (
                  <p className="line-clamp-2 rounded-md bg-muted/40 px-3 py-2 text-muted-foreground text-xs leading-relaxed">
                    {getDescriptionText(task.description)}
                  </p>
                )}
              </div>
            </div>
          </button>
        );
      })}

      {hasMoreTasks && (
        <div className="flex justify-center pt-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAll(!showAll)}
            className="group h-10 gap-2 px-6 transition-all duration-200 hover:scale-105 hover:bg-dynamic-orange/10 hover:text-dynamic-orange hover:shadow-md"
          >
            {showAll ? (
              <>
                <ChevronUp className="h-4 w-4 transition-transform" />
                <span className="font-medium">Show Less</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 transition-transform" />
                <span className="font-medium">
                  Show {tasks.length - initialLimit} More Tasks
                </span>
              </>
            )}
          </Button>
        </div>
      )}

      {/* Task Edit Dialog */}
      {editingTask && (
        <TaskEditDialog
          task={editingTask as any}
          boardId={editingTask.list?.board?.id || ''}
          isOpen={isEditDialogOpen}
          onClose={handleCloseEditDialog}
          onUpdate={handleUpdateTask}
        />
      )}
    </div>
  );
}
