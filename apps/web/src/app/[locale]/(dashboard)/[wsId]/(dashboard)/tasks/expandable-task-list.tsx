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
              'group relative w-full cursor-pointer overflow-hidden rounded-xl border p-5 text-left shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-xl',
              taskOverdue && !task.archived
                ? 'border-dynamic-red/30 bg-gradient-to-br from-dynamic-red/5 via-dynamic-red/3 to-transparent ring-2 ring-dynamic-red/20'
                : 'border-border/50 bg-gradient-to-br from-card via-card/95 to-card/90 hover:border-primary/30 hover:ring-2 hover:ring-primary/10'
            )}
            onClick={(e) => handleEditTask(task, e)}
          >
            {/* Overdue indicator - Enhanced with animation */}
            {taskOverdue && !task.archived && (
              <div className="absolute top-4 right-4 flex items-center gap-1.5 rounded-full bg-dynamic-red px-3 py-1.5 shadow-lg ring-2 ring-dynamic-red/30 animate-pulse">
                <AlertCircle className="h-3.5 w-3.5 text-white" />
                <span className="font-bold text-[10px] text-white tracking-widest">
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
                  <h4 className="line-clamp-2 flex-1 font-bold text-foreground text-base leading-snug transition-colors duration-200 group-hover:text-primary">
                    {task.name}
                  </h4>
                  {task.priority && (
                    <Badge
                      className={cn(
                        'shrink-0 font-bold text-[10px] uppercase tracking-wider shadow-md ring-1',
                        getPriorityColor(task.priority)
                      )}
                    >
                      {getPriorityLabel(task.priority)}
                    </Badge>
                  )}
                </div>

                {/* Metadata row - Workspace → Board → List hierarchy */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs">
                  {/* Workspace badge - Always show for personal view */}
                  {isPersonal && task.list?.board?.ws_id && (
                    <Link
                      href={`/${task.list.board.ws_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className={cn(
                        'group/ws flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold shadow-sm ring-1 transition-all',
                        task.list?.board?.workspaces?.personal
                          ? 'bg-dynamic-purple/10 text-dynamic-purple ring-dynamic-purple/20 hover:bg-dynamic-purple/20 hover:shadow-md'
                          : 'bg-dynamic-blue/10 text-dynamic-blue ring-dynamic-blue/20 hover:bg-dynamic-blue/20 hover:shadow-md'
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
                  )}

                  {/* Arrow separator after workspace */}
                  {isPersonal && task.list?.board?.ws_id && (
                    <span className="text-muted-foreground/40">→</span>
                  )}

                  {/* Board name */}
                  {task.list?.board?.id && task.list?.board?.ws_id && (
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

                  {/* Arrow separator after board */}
                  {task.list?.board?.id && task.list?.name && (
                    <span className="text-muted-foreground/40">→</span>
                  )}

                  {/* List name */}
                  {task.list?.name && (
                    <span className="truncate rounded-lg bg-dynamic-purple/10 px-2.5 py-1 font-semibold text-dynamic-purple shadow-sm ring-1 ring-dynamic-purple/20">
                      {task.list.name}
                    </span>
                  )}

                  {/* Separator before dates */}
                  {(endDate || (startDate && startDate > now)) && (
                    <span className="text-muted-foreground/30">•</span>
                  )}

                  {/* Due date */}
                  {endDate && (
                    <div
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium shadow-sm ring-1 transition-colors',
                        taskOverdue && !task.archived
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

                  {/* Start date (if upcoming) */}
                  {startDate && startDate > now && (
                    <div className="flex items-center gap-1.5 rounded-lg bg-dynamic-blue/10 px-2.5 py-1 font-medium text-dynamic-blue shadow-sm ring-1 ring-dynamic-blue/20">
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
                    <div className="flex items-center gap-1.5 rounded-lg bg-dynamic-blue/10 px-2.5 py-1.5 font-semibold text-[11px] text-dynamic-blue shadow-sm ring-1 ring-dynamic-blue/20 transition-colors hover:bg-dynamic-blue/20">
                      <UserRound className="h-3.5 w-3.5" />
                      <span>
                        {task.assignees.length}
                      </span>
                    </div>
                  )}
                </div>

                {/* Description - only show if exists */}
                {task.description && (
                  <p className="line-clamp-2 rounded-lg border border-border/50 bg-muted/30 px-3.5 py-2.5 text-muted-foreground text-xs leading-relaxed shadow-sm backdrop-blur-sm">
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
            variant="outline"
            size="default"
            onClick={() => setShowAll(!showAll)}
            className="group h-11 gap-2.5 rounded-xl border-2 px-8 font-semibold shadow-sm transition-all duration-200 hover:scale-105 hover:border-primary hover:bg-primary/5 hover:shadow-lg"
          >
            {showAll ? (
              <>
                <ChevronUp className="h-4 w-4 transition-transform group-hover:-translate-y-0.5" />
                <span>Show Less</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
                <span>
                  Show {tasks.length - initialLimit} More Task{tasks.length - initialLimit !== 1 ? 's' : ''}
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
