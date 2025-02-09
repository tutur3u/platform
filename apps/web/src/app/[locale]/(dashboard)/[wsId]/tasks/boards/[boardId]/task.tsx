import { AssigneeSelect } from './_components/assignee-select';
import { TaskActions } from './task-actions';
import { updateTask } from '@/lib/task-helper';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@repo/ui/components/ui/badge';
import { Button } from '@repo/ui/components/ui/button';
import { Card } from '@repo/ui/components/ui/card';
import { Checkbox } from '@repo/ui/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@repo/ui/components/ui/tooltip';
import { cn } from '@repo/ui/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tutur3u/supabase/next/client';
import { Task as TaskType } from '@tutur3u/types/primitives/TaskBoard';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  Calendar,
  Clock,
  Flag,
  GripVertical,
  Loader2,
  Pencil,
} from 'lucide-react';
import { useState } from 'react';

export interface Task extends TaskType {}

interface Props {
  task: Task;
  boardId: string;
  isOverlay?: boolean;
  onUpdate?: () => void;
}

export function TaskCard({ task, boardId, isOverlay, onUpdate }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: {
      type: 'Task',
      task: {
        ...task,
        list_id: String(task.list_id),
      },
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    height: 'var(--task-height)',
  };

  const isOverdue = task.end_date && new Date(task.end_date) < new Date();
  const startDate = task.start_date ? new Date(task.start_date) : null;
  const endDate = task.end_date ? new Date(task.end_date) : null;
  const createdAt = new Date(task.created_at);

  async function handleArchiveToggle() {
    if (!onUpdate) return;

    try {
      setIsLoading(true);
      const newArchiveState = !task.archived;

      // Optimistically update the task in the cache
      queryClient.setQueryData(
        ['tasks', boardId],
        (oldData: Task[] | undefined) => {
          if (!oldData) return oldData;
          return oldData.map((t) =>
            t.id === task.id ? { ...t, archived: newArchiveState } : t
          );
        }
      );

      const supabase = createClient();
      const updatedTask = await updateTask(supabase, task.id, {
        archived: newArchiveState,
      });

      // Update the cache with the server response
      queryClient.setQueryData(
        ['tasks', boardId],
        (oldData: Task[] | undefined) => {
          if (!oldData) return oldData;
          return oldData.map((t) =>
            t.id === updatedTask.id ? updatedTask : t
          );
        }
      );

      onUpdate();
    } catch (error) {
      // Revert the optimistic update by invalidating the query
      queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
      console.error('Failed to update task archive status:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleQuickPriorityChange(priority: number | null) {
    if (!onUpdate) return;

    try {
      setIsLoading(true);
      const newPriority = priority || undefined;

      // Optimistically update the task in the cache
      queryClient.setQueryData(
        ['tasks', boardId],
        (oldData: Task[] | undefined) => {
          if (!oldData) return oldData;
          return oldData.map((t) =>
            t.id === task.id ? { ...t, priority: newPriority } : t
          );
        }
      );

      const supabase = createClient();
      const updatedTask = await updateTask(supabase, task.id, {
        priority: priority || null,
      });

      // Update the cache with the server response
      queryClient.setQueryData(
        ['tasks', boardId],
        (oldData: Task[] | undefined) => {
          if (!oldData) return oldData;
          return oldData.map((t) =>
            t.id === updatedTask.id ? updatedTask : t
          );
        }
      );

      onUpdate();
    } catch (error) {
      // Revert the optimistic update by invalidating the query
      queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
      console.error('Failed to update task priority:', error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative flex flex-col gap-3 rounded-lg border p-3 text-left text-sm transition-all',
        'hover:border-primary/20 hover:shadow-md',
        'touch-none select-none',
        isDragging && 'z-50 scale-[1.02] bg-background opacity-90 shadow-lg',
        isOverlay && 'shadow-lg',
        task.archived && 'bg-muted/50',
        isOverdue && !task.archived && 'border-destructive/50'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          {...attributes}
          {...listeners}
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0 cursor-grab text-muted-foreground opacity-50 transition-all',
            'group-hover:opacity-100',
            isDragging && 'opacity-100',
            isOverlay && 'cursor-grabbing'
          )}
        >
          <GripVertical className="h-4 w-4" />
        </div>

        <div className="flex-1 space-y-3">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={task.archived}
              className="mt-1 h-4 w-4 shrink-0 transition-colors"
              disabled={isLoading}
              onCheckedChange={handleArchiveToggle}
            />
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <p
                  className={cn(
                    'line-clamp-2 flex-1 leading-tight font-medium',
                    task.archived && 'text-muted-foreground line-through'
                  )}
                >
                  {task.name}
                </p>
                {!isOverlay && onUpdate && (
                  <div className="flex -space-x-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={isLoading}
                          onClick={() => setIsEditDialogOpen(true)}
                        >
                          <Pencil className="h-3 w-3" />
                          <span className="sr-only">Edit task</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit task</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            'h-6 w-6',
                            !task.priority && 'opacity-50'
                          )}
                          disabled={isLoading}
                          onClick={() =>
                            handleQuickPriorityChange(task.priority ? null : 1)
                          }
                        >
                          {isLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Flag
                              className={cn(
                                'h-3 w-3',
                                task.priority === 1 &&
                                  'fill-destructive stroke-destructive',
                                task.priority === 2 &&
                                  'fill-yellow-500 stroke-yellow-500',
                                task.priority === 3 &&
                                  'fill-green-500 stroke-green-500'
                              )}
                            />
                          )}
                          <span className="sr-only">Toggle priority</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Toggle priority</TooltipContent>
                    </Tooltip>
                  </div>
                )}
              </div>
              {task.description && (
                <p className="line-clamp-2 text-xs leading-normal text-muted-foreground">
                  {task.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {task.priority && (
              <Badge
                variant={getPriorityVariant(task.priority)}
                className="text-[10px] font-medium"
              >
                P{task.priority}
              </Badge>
            )}
            {startDate && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                Starts {formatDistanceToNow(startDate, { addSuffix: true })}
              </div>
            )}
            {endDate && (
              <div
                className={cn(
                  'flex items-center gap-1',
                  isOverdue && !task.archived
                    ? 'font-medium text-destructive'
                    : 'text-muted-foreground'
                )}
              >
                <Calendar className="h-3 w-3" />
                Due {formatDistanceToNow(endDate, { addSuffix: true })}
              </div>
            )}
            {isOverdue && !task.archived && (
              <div className="flex items-center gap-1 font-medium text-destructive">
                <AlertCircle className="h-3 w-3" />
                Overdue
              </div>
            )}
            <AssigneeSelect
              taskId={task.id}
              assignees={task.assignees}
              onUpdate={onUpdate}
            />
          </div>
        </div>
      </div>

      {!isOverlay && onUpdate && (
        <TaskActions
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          taskId={task.id}
          taskName={task.name}
          taskDescription={task.description || null}
          startDate={task.start_date || null}
          endDate={task.end_date || null}
          priority={task.priority || null}
          archived={task.archived}
          assignees={task.assignees || []}
          onUpdate={onUpdate}
        />
      )}

      <div className="text-[10px] text-muted-foreground/50">
        Created {formatDistanceToNow(createdAt, { addSuffix: true })}
      </div>
    </Card>
  );
}

function getPriorityVariant(
  priority: number
): 'default' | 'secondary' | 'destructive' {
  switch (priority) {
    case 1:
      return 'destructive';
    case 2:
      return 'secondary';
    default:
      return 'default';
  }
}
