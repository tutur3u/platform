'use client';

import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskWithRelations } from '@tuturuuu/types';
import type { Task as PrimitiveTask } from '@tuturuuu/types/primitives/Task';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
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
import { type MouseEvent, useEffect, useState } from 'react';

interface TaskListWithCompletionProps {
  tasks: TaskWithRelations[];
  isPersonal?: boolean;
  initialLimit?: number;
  onTaskUpdate?: () => void;
}

export default function TaskListWithCompletion({
  tasks,
  initialLimit = 3,
  onTaskUpdate,
}: TaskListWithCompletionProps) {
  const { openTask } = useTaskDialog();
  const [showAll, setShowAll] = useState(false);
  const [localTasks, setLocalTasks] = useState<TaskWithRelations[]>(tasks);
  const [completingTasks, setCompletingTasks] = useState<Set<string>>(
    new Set()
  );

  // Update local tasks when props change
  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  const displayedTasks = showAll
    ? localTasks
    : localTasks.slice(0, initialLimit);
  const hasMoreTasks = localTasks.length > initialLimit;

  const handleToggleComplete = async (
    task: TaskWithRelations,
    e?: React.MouseEvent | Record<string, never>
  ): Promise<void> => {
    if (e && 'preventDefault' in e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!task.list?.board?.id) {
      toast.error('Task is not associated with a board');
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
        toast.error('Could not find appropriate lists for task completion');
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
                list_id: targetListId,
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
        isCompleted ? 'Task marked as incomplete' : 'Task completed!'
      );

      // Trigger parent refresh for server data
      if (onTaskUpdate) {
        onTaskUpdate();
      }
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error('Failed to update task');

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

  const handleEditTask = (task: TaskWithRelations, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Validate that the task has a valid board ID before opening
    if (!task.list?.board?.id) {
      toast.error('Task is not associated with a board');
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

    // Type assertion is safe here because we're transforming the nested structure
    // to match the flat structure expected by openTask (Task type from primitives)
    openTask(
      transformedTask as unknown as PrimitiveTask,
      boardId,
      undefined,
      true
    );
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
        const isCompleted = task.list?.status === 'done';
        const isCompleting = completingTasks.has(task.id);

        return (
          <div
            key={task.id}
            className={cn(
              'group relative overflow-hidden rounded-xl border p-5 shadow-sm transition-all duration-300',
              taskOverdue && !task.archived && !isCompleted
                ? 'border-dynamic-red/30 bg-linear-to-br from-dynamic-red/5 via-dynamic-red/3 to-transparent'
                : isCompleted
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
                className="min-w-0 flex-1 text-left lg:gap-y-3"
                onClick={(e) => handleEditTask(task, e)}
              >
                {/* Desktop layout (md/lg): Task name + metadata on line 1, labels/projects on line 2 */}
                {/* Check if line 2 will have content */}
                {(() => {
                  const hasLabels = task.labels && task.labels.length > 0;
                  const hasProjects = task.projects && task.projects.length > 0;
                  const hasLine2 = hasLabels || hasProjects;
                  return (
                    <div
                      className={cn('flex flex-col', hasLine2 ? 'gap-y-3' : '')}
                    >
                      {/* Line 1: Task name on left, Board → List → Due date → Assignees + Estimation on right */}
                      <div className="hidden items-center justify-between gap-2 md:flex">
                        <h4
                          className={cn(
                            'flex-1 font-bold text-base leading-snug transition-colors duration-200 group-hover:text-primary',
                            isCompleted
                              ? 'text-muted-foreground line-through'
                              : 'text-foreground'
                          )}
                        >
                          {task.name}
                        </h4>
                        {/* Right side: Board → List → Due → Assignees → Estimation */}
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs">
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

                          {task.list?.board?.id && task.list?.name && (
                            <span className="text-muted-foreground/40">→</span>
                          )}

                          {/* List name */}
                          {task.list?.name && (
                            <span className="truncate rounded-lg bg-dynamic-purple/10 px-2.5 py-1 font-semibold text-dynamic-purple shadow-sm ring-1 ring-dynamic-purple/20">
                              {task.list.name}
                            </span>
                          )}

                          {endDate && (
                            <span className="text-muted-foreground/30">•</span>
                          )}

                          {/* Due date */}
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

                          {/* Assignees */}
                          {task.assignees && task.assignees.length > 0 && (
                            <>
                              <span className="text-muted-foreground/30">
                                •
                              </span>
                              <div className="-space-x-2 flex">
                                {task.assignees.slice(0, 2).map((assignee) => (
                                  <Avatar
                                    key={assignee.user?.id}
                                    className="h-6 w-6 border-2 border-background shadow-sm ring-1 ring-border/50 transition-all duration-200 hover:z-10 hover:scale-110 hover:ring-primary/30"
                                  >
                                    <AvatarImage
                                      src={
                                        assignee.user?.avatar_url || undefined
                                      }
                                      alt={
                                        assignee.user?.display_name || 'User'
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

                          {/* Estimation */}
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

                {/* Mobile layout (sm and below): Responsive multi-line layout */}
                <div className="space-y-4 md:hidden">
                  {/* Task name with estimation */}
                  <div className="mt-1 flex items-start gap-3">
                    <h4
                      className={cn(
                        'line-clamp-2 flex-1 font-bold text-base leading-snug transition-colors duration-200 group-hover:text-primary',
                        isCompleted
                          ? 'text-muted-foreground line-through'
                          : 'text-foreground'
                      )}
                    >
                      {task.name}
                    </h4>
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

                  {/* Metadata rows */}
                  <div className="space-y-3">
                    {/* First line: Board → List → Due date */}
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
                      {/* Board name */}
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

                      {/* List name */}
                      {task.list?.name && (
                        <span className="truncate rounded-lg bg-dynamic-purple/10 px-2 py-0.5 font-semibold text-dynamic-purple text-xs shadow-sm ring-1 ring-dynamic-purple/20">
                          {task.list.name}
                        </span>
                      )}

                      {endDate && (
                        <span className="text-muted-foreground/30">•</span>
                      )}

                      {/* Due date */}
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

                      {/* Assignees */}
                      {task.assignees && task.assignees.length > 0 && (
                        <>
                          <span className="text-muted-foreground/30">•</span>
                          <div className="-space-x-2 flex">
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

                {/* Description
                {task.description && getDescriptionText(task.description) && (
                  <p className="line-clamp-2 rounded-lg border border-border/50 bg-muted/30 px-3.5 py-2.5 text-muted-foreground text-xs leading-relaxed shadow-sm backdrop-blur-sm">
                    {getDescriptionText(task.description)}
                  </p>
                )} */}
              </button>
            </div>
          </div>
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
                <ChevronUp className="group-hover:-translate-y-0.5 h-4 w-4 transition-transform" />
                <span>Show Less</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
                <span>
                  Show {tasks.length - initialLimit} More Task
                  {tasks.length - initialLimit !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
