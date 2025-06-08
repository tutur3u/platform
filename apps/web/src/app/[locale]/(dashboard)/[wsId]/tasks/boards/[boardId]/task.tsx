import { AssigneeSelect } from './_components/assignee-select';
import { TaskActions } from './task-actions';
import { useUpdateTask } from '@/lib/task-helper';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task as TaskType } from '@tuturuuu/types/primitives/TaskBoard';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  AlertCircle,
  Calendar,
  Clock,
  Flag,
  GripVertical,
  Sparkles,
} from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import {
  formatDistanceToNow,
  isToday,
  isTomorrow,
  isYesterday,
} from 'date-fns';
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
  const [isHovered, setIsHovered] = useState(false);
  const updateTaskMutation = useUpdateTask(boardId);
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

  const now = new Date();
  const isOverdue = task.end_date && new Date(task.end_date) < now;
  const startDate = task.start_date ? new Date(task.start_date) : null;
  const endDate = task.end_date ? new Date(task.end_date) : null;
  const createdAt = new Date(task.created_at);

  // Enhanced date formatting
  const formatSmartDate = (date: Date) => {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    if (isYesterday(date)) return 'Yesterday';
    return formatDistanceToNow(date, { addSuffix: true });
  };

  async function handleArchiveToggle() {
    if (!onUpdate) return;

    setIsLoading(true);
    updateTaskMutation.mutate(
      { taskId: task.id, updates: { archived: !task.archived } },
      {
        onSettled: () => {
          setIsLoading(false);
          onUpdate();
        },
      }
    );
  }

  const getPriorityBorderColor = () => {
    if (!task.priority) return '';
    switch (task.priority) {
      case 1:
        return 'border-l-red-500 dark:border-l-red-400';
      case 2:
        return 'border-l-yellow-500 dark:border-l-yellow-400';
      case 3:
        return 'border-l-green-500 dark:border-l-green-400';
      default:
        return 'border-l-blue-500 dark:border-l-blue-400';
    }
  };

  const getPriorityGlow = () => {
    if (!isHovered || !task.priority) return '';
    switch (task.priority) {
      case 1:
        return 'shadow-red-500/20 dark:shadow-red-400/20';
      case 2:
        return 'shadow-yellow-500/20 dark:shadow-yellow-400/20';
      case 3:
        return 'shadow-green-500/20 dark:shadow-green-400/20';
      default:
        return 'shadow-blue-500/20 dark:shadow-blue-400/20';
    }
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'group relative overflow-hidden rounded-xl border-l-4 transition-all duration-300 ease-out',
        'hover:-translate-y-0.5 hover:shadow-lg',
        'cursor-pointer touch-none select-none',
        // Priority-based left border
        task.priority
          ? getPriorityBorderColor()
          : 'border-l-gray-200 dark:border-l-gray-700',
        // Priority-based glow effect
        isHovered && task.priority && `shadow-lg ${getPriorityGlow()}`,
        // Dragging state
        isDragging &&
          'z-50 scale-105 bg-background shadow-2xl ring-2 ring-primary/20',
        isOverlay && 'shadow-2xl ring-2 ring-primary/20',
        // Archive state
        task.archived && 'bg-gray-50/80 opacity-75 dark:bg-gray-900/50',
        // Overdue state
        isOverdue &&
          !task.archived &&
          'border-red-200 bg-red-50/30 dark:border-red-800 dark:bg-red-950/20',
        // Hover state
        !isDragging &&
          'hover:border-primary/30 hover:bg-gradient-to-br hover:from-white hover:to-gray-50/50 dark:hover:from-gray-950 dark:hover:to-gray-900/50'
      )}
    >
      {/* Overdue indicator */}
      {isOverdue && !task.archived && (
        <div className="absolute top-0 right-0 h-0 w-0 border-t-[20px] border-l-[20px] border-t-red-500 border-l-transparent">
          <AlertCircle className="absolute -top-4 -right-[18px] h-3 w-3 text-white" />
        </div>
      )}

      <div className="p-4">
        {/* Header */}
        <div className="mb-3 flex items-start gap-3">
          <div
            {...attributes}
            {...listeners}
            className={cn(
              'mt-1 h-4 w-4 shrink-0 cursor-grab text-gray-400 transition-all duration-200',
              'group-hover:text-gray-600 dark:group-hover:text-gray-300',
              'hover:scale-110',
              isDragging && 'cursor-grabbing text-primary',
              isOverlay && 'cursor-grabbing'
            )}
          >
            <GripVertical className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-start justify-between gap-2">
              <h3
                className={cn(
                  'text-sm leading-tight font-semibold transition-colors',
                  task.archived
                    ? 'text-gray-500 line-through dark:text-gray-400'
                    : 'text-gray-900 group-hover:text-gray-800 dark:text-gray-100 dark:group-hover:text-gray-50'
                )}
              >
                {task.name}
              </h3>
            </div>

            {task.description && (
              <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                {task.description}
              </p>
            )}
          </div>
        </div>

        {/* Metadata */}
        <div className="space-y-3">
          {/* Priority and Status */}
          <div className="flex flex-wrap items-center gap-2">
            {task.priority && (
              <Badge
                variant={getPriorityVariant(task.priority)}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[10px] font-medium shadow-sm',
                  task.priority === 1 &&
                    'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
                  task.priority === 2 &&
                    'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
                  task.priority === 3 &&
                    'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                )}
              >
                <Flag className="mr-1 h-2.5 w-2.5" />P{task.priority}
              </Badge>
            )}

            {task.archived && (
              <Badge
                variant="secondary"
                className="rounded-md px-2 py-0.5 text-[10px]"
              >
                Completed
              </Badge>
            )}
          </div>

          {/* Dates */}
          {(startDate || endDate) && (
            <div className="flex items-center gap-3 text-xs">
              {startDate && (
                <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                  <Clock className="h-3 w-3" />
                  <span>Starts {formatSmartDate(startDate)}</span>
                </div>
              )}
              {endDate && (
                <div
                  className={cn(
                    'flex items-center gap-1.5',
                    isOverdue && !task.archived
                      ? 'font-medium text-red-600 dark:text-red-400'
                      : 'text-gray-600 dark:text-gray-400'
                  )}
                >
                  <Calendar className="h-3 w-3" />
                  <span>Due {formatSmartDate(endDate)}</span>
                </div>
              )}
            </div>
          )}

          {/* Assignees */}
          <div className="flex items-center justify-between">
            <AssigneeSelect
              taskId={task.id}
              assignees={task.assignees}
              onUpdate={onUpdate}
            />

            <div className="flex items-center gap-2">
              <Checkbox
                checked={task.archived}
                className={cn(
                  'h-4 w-4 transition-all duration-200',
                  'data-[state=checked]:border-green-500 data-[state=checked]:bg-green-500',
                  'hover:scale-110'
                )}
                disabled={isLoading}
                onCheckedChange={handleArchiveToggle}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2 dark:border-gray-800">
          <span className="text-[10px] text-gray-500 dark:text-gray-500">
            Created {formatDistanceToNow(createdAt, { addSuffix: true })}
          </span>

          {!task.archived && task.priority === 1 && (
            <div className="flex items-center gap-1 text-red-500">
              <Sparkles className="h-3 w-3" />
              <span className="text-[10px] font-medium">High Priority</span>
            </div>
          )}
        </div>
      </div>

      {!isOverlay && onUpdate && (
        <TaskActions taskId={task.id} boardId={boardId} onUpdate={onUpdate} />
      )}
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
    case 3:
      return 'default';
    default:
      return 'secondary';
  }
}
