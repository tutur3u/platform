import { AssigneeSelect } from './_components/assignee-select';
import { TaskEditDialog } from './_components/task-edit-dialog';
import { TaskTagsDisplay } from './_components/task-tags-display';
import { TaskActions } from './task-actions';
import { moveTask, useDeleteTask, useUpdateTask } from '@/lib/task-helper';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { Task, TaskList } from '@tuturuuu/types/primitives/TaskBoard';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import {
  AlertCircle,
  Calendar,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Edit3,
  Flag,
  GripVertical,
  Loader2,
  MoreHorizontal,
  Sparkles,
  Trash2,
  X,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import {
  addDays,
  format,
  formatDistanceToNow,
  isToday,
  isTomorrow,
  isYesterday,
} from 'date-fns';
import { useEffect, useMemo, useRef, useState } from 'react';
import React from 'react';

interface Props {
  task: Task;
  boardId: string;
  taskList?: TaskList;
  isOverlay?: boolean;
  onUpdate: () => void;
  availableLists?: TaskList[]; // Optional: pass from parent to avoid redundant API calls
  isSelected?: boolean;
  isMultiSelectMode?: boolean;
  onSelect?: (taskId: string, event: React.MouseEvent) => void;
}

// Lightweight drag overlay version
export function LightweightTaskCard({ task }: { task: Task }) {
  return (
    <Card className="pointer-events-none w-full max-w-[350px] scale-105 opacity-95 shadow-xl ring-2 ring-primary/20 select-none bg-background/95 backdrop-blur-sm">
      <div className="flex flex-col gap-2 p-4">
        <div className="truncate text-base font-semibold">{task.name}</div>
        <div className="flex items-center gap-2">
          {task.priority && (
            <Badge variant="secondary" className="text-xs">
              {['', 'Urgent', 'High', 'Medium', 'Low'][task.priority]}
            </Badge>
          )}
          {task.tags && task.tags.length > 0 && (
            <span className="text-xs text-muted-foreground">
              +{task.tags.length} tags
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

// Memoized full TaskCard
export const TaskCard = React.memo(function TaskCard({
  task,
  boardId,
  taskList,
  isOverlay,
  onUpdate,
  availableLists: propAvailableLists,
  isSelected = false,
  isMultiSelectMode = false,
  onSelect,
}: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(task.name);
  const [editDescription, setEditDescription] = useState(
    task.description || ''
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [customDateOpen, setCustomDateOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [availableLists, setAvailableLists] = useState<TaskList[]>([]);
  const datePickerRef = useRef<HTMLButtonElement>(null);
  const updateTaskMutation = useUpdateTask(boardId);
  const deleteTaskMutation = useDeleteTask(boardId);

  // Fetch available task lists for the board (only if not provided as prop)
  useEffect(() => {
    if (propAvailableLists) {
      setAvailableLists(propAvailableLists);
      return;
    }

    const fetchTaskLists = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('task_lists')
        .select('*')
        .eq('board_id', boardId)
        .eq('deleted', false)
        .order('position')
        .order('created_at');

      if (!error && data) {
        setAvailableLists(data as TaskList[]);
      }
    };

    fetchTaskLists();
  }, [boardId, propAvailableLists]);

  // Find the first list with 'done' or 'closed' status
  const getTargetCompletionList = () => {
    const doneList = availableLists.find((list) => list.status === 'done');
    const closedList = availableLists.find((list) => list.status === 'closed');
    return doneList || closedList || null;
  };

  const targetCompletionList = getTargetCompletionList();
  const canMoveToCompletion =
    targetCompletionList && targetCompletionList.id !== task.list_id;

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

  // Quick actions
  async function handleQuickEdit() {
    if (editName.trim() === '') return;

    setIsLoading(true);
    updateTaskMutation.mutate(
      {
        taskId: task.id,
        updates: {
          name: editName.trim(),
          description: editDescription.trim() || undefined,
        },
      },
      {
        onSettled: () => {
          setIsLoading(false);
          setIsEditing(false);
          onUpdate?.();
        },
      }
    );
  }

  async function handlePriorityChange(priority: number) {
    setIsLoading(true);
    updateTaskMutation.mutate(
      { taskId: task.id, updates: { priority } },
      {
        onSettled: () => {
          setIsLoading(false);
          onUpdate?.();
        },
      }
    );
  }

  async function handleDueDateChange(days: number | null) {
    const newDate =
      days !== null ? addDays(new Date(), days).toISOString() : null;
    setIsLoading(true);
    updateTaskMutation.mutate(
      { taskId: task.id, updates: { end_date: newDate } },
      {
        onSettled: () => {
          setIsLoading(false);
          onUpdate?.();
        },
      }
    );
  }

  async function handleCustomDateChange(date: Date | undefined) {
    const newDate = date ? date.toISOString() : null;
    setIsLoading(true);
    updateTaskMutation.mutate(
      { taskId: task.id, updates: { end_date: newDate } },
      {
        onSettled: () => {
          setIsLoading(false);
          setCustomDateOpen(false);
          onUpdate?.();
        },
      }
    );
  }

  async function handleMoveToCompletion() {
    if (!targetCompletionList || !onUpdate) return;

    setIsLoading(true);

    // Use the standard moveTask function to ensure consistent logic
    const supabase = createClient();
    try {
      await moveTask(supabase, task.id, targetCompletionList.id);
      // Manually invalidate queries since we're not using the mutation hook
      onUpdate();
    } catch (error) {
      console.error('Failed to move task to completion:', error);
      toast({
        title: 'Error',
        description: 'Failed to complete task. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setMenuOpen(false);
    }
  }

  async function handleDelete() {
    setIsLoading(true);
    deleteTaskMutation.mutate(task.id, {
      onSuccess: () => {
        setDeleteDialogOpen(false);
        onUpdate?.();
      },
      onSettled: () => {
        setIsLoading(false);
      },
    });
  }

  // Dynamic color mappings based on task list color
  const getListColorClasses = (color: SupportedColor) => {
    const colorMap: Record<SupportedColor, string> = {
      GRAY: 'border-dynamic-gray/70 bg-dynamic-gray/5',
      RED: 'border-dynamic-red/70 bg-dynamic-red/5',
      BLUE: 'border-dynamic-blue/70 bg-dynamic-blue/5',
      GREEN: 'border-dynamic-green/70 bg-dynamic-green/5',
      YELLOW: 'border-dynamic-yellow/70 bg-dynamic-yellow/5',
      ORANGE: 'border-dynamic-orange/70 bg-dynamic-orange/5',
      PURPLE: 'border-dynamic-purple/70 bg-dynamic-purple/5',
      PINK: 'border-dynamic-pink/70 bg-dynamic-pink/5',
      INDIGO: 'border-dynamic-indigo/70 bg-dynamic-indigo/5',
      CYAN: 'border-dynamic-cyan/70 bg-dynamic-cyan/5',
    };
    return colorMap[color] || colorMap.GRAY;
  };

  const getPriorityBorderColor = () => {
    if (!task.priority) return '';
    switch (task.priority) {
      case 1:
        return 'border-dynamic-red/70';
      case 2:
        return 'border-dynamic-orange/70';
      case 3:
        return 'border-dynamic-yellow/70';
      default:
        return 'border-dynamic-blue/70';
    }
  };

  const getPriorityIndicator = () => {
    if (!task.priority) return null;
    const colors = {
      1: 'bg-dynamic-red/10 border-dynamic-red/30 text-dynamic-red',
      2: 'bg-dynamic-orange/10 border-dynamic-orange/30 text-dynamic-orange',
      3: 'bg-dynamic-yellow/10 border-dynamic-yellow/30 text-dynamic-yellow',
      4: 'bg-dynamic-blue/10 border-dynamic-blue/30 text-dynamic-blue',
    };

    const labels = {
      1: 'Urgent',
      2: 'High',
      3: 'Medium',
      4: 'Low',
    };

    return (
      <Badge
        variant="secondary"
        className={cn(
          'scale-85 px-1.5 py-0.5 text-xs',
          colors[task.priority as keyof typeof colors]
        )}
      >
        <Flag className="mr-1 h-3 w-3" />
        {labels[task.priority as keyof typeof labels]}
      </Badge>
    );
  };

  // Use task list color if available, otherwise use priority or default
  const getCardColorClasses = () => {
    if (taskList?.color) {
      return getListColorClasses(taskList.color);
    }
    if (task.priority) {
      return getPriorityBorderColor();
    }
    return 'border-l-dynamic-gray/30';
  };

  // Memoize drag handle for performance
  const DragHandle = useMemo(
    () => (
      <div
        {...attributes}
        {...listeners}
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0 cursor-grab text-muted-foreground/60 transition-all duration-200',
          'group-hover:text-foreground/80',
          'hover:scale-110 hover:text-primary/80',
          isDragging && 'cursor-grabbing text-primary',
          isOverlay && 'cursor-grabbing'
        )}
        title="Drag to move task"
      >
        <GripVertical className="h-4 w-4" />
      </div>
    ),
    [attributes, listeners, isDragging, isOverlay]
  );

  // Hide the source card during drag (unless in overlay)
  if (isDragging && !isOverlay) return null;

  return (
    <Card
      data-id={task.id}
      ref={setNodeRef}
      style={style}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => onSelect?.(task.id, e)}
      className={cn(
        'group relative overflow-hidden rounded-lg border-l-4 transition-all duration-200',
        'cursor-default hover:shadow-md',
        // Task list or priority-based styling
        getCardColorClasses(),
        // Dragging state
        isDragging && 'z-50 scale-105 shadow-xl ring-2 ring-primary/30',
        isOverlay && 'shadow-xl ring-2 ring-primary/30',
        // Archive state (completed tasks)
        task.archived && 'opacity-70 saturate-75',
        // Overdue state
        isOverdue &&
          !task.archived &&
          'border-dynamic-red/70 bg-dynamic-red/10 ring-1 ring-dynamic-red/20',
        // Hover state
        !isDragging &&
          'hover:border-primary/30 hover:ring-1 hover:ring-primary/15',
        // Selection state
        isSelected && 'ring-2 ring-primary/50 bg-primary/5 shadow-md',
        // Visual feedback for invalid drop (dev only)
        process.env.NODE_ENV === 'development' &&
          isDragging &&
          !isOverlay &&
          'ring-2 ring-red-400/60'
      )}
    >
      {/* Overdue indicator */}
      {isOverdue && !task.archived && (
        <div className="absolute top-0 right-0 h-0 w-0 border-t-[20px] border-l-[20px] border-t-dynamic-red/80 border-l-transparent">
          <AlertCircle className="absolute -top-4 -right-[18px] h-3 w-3" />
        </div>
      )}

      {/* Selection indicator */}
      {isMultiSelectMode && isSelected && (
        <div className="absolute top-2 left-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-sm">
          ✓
        </div>
      )}

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-1">
          {DragHandle}

          <div className="min-w-0 flex-1">
            {isEditing ? (
              <div className="space-y-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleQuickEdit();
                    if (e.key === 'Escape') {
                      setIsEditing(false);
                      setEditName(task.name);
                      setEditDescription(task.description || '');
                    }
                  }}
                  className="text-sm font-semibold"
                  autoFocus
                />
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Add description..."
                  className="text-xs"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={handleQuickEdit}
                    disabled={isLoading}
                    className="h-7 px-3 text-xs"
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIsEditing(false);
                      setEditName(task.name);
                      setEditDescription(task.description || '');
                    }}
                    className="h-7 px-3 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-1 flex items-center gap-2">
                  <button
                    type="button"
                    className={cn(
                      'w-full cursor-pointer text-left text-xs leading-tight font-semibold transition-colors',
                      task.archived
                        ? 'text-muted-foreground line-through'
                        : 'text-foreground group-hover:text-foreground/90 hover:text-primary'
                    )}
                    onClick={() => setIsEditing(true)}
                    aria-label={`Edit task: ${task.name}`}
                  >
                    {task.name}
                  </button>
                </div>
                {/* Description (truncated, tooltip on hover) */}
                {task.description && (
                  <div className="mb-1">
                    <button
                      type="button"
                      className="line-clamp-2 w-full cursor-pointer border-none bg-transparent p-0 text-left text-xs text-muted-foreground hover:text-foreground/80 focus:outline-none"
                      title={task.description}
                      onClick={() => setIsEditing(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ')
                          setIsEditing(true);
                      }}
                    >
                      {task.description}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          {/* Actions (date picker, menu) remain unchanged */}
          <div className="flex items-center justify-end gap-1">
            {/* Custom Date Picker - Separate from Dropdown */}
            {!isOverlay && (
              <Popover open={customDateOpen} onOpenChange={setCustomDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    ref={datePickerRef}
                    variant="ghost"
                    size="xs"
                    className={cn(
                      'h-7 w-7 shrink-0 p-0 transition-all duration-200',
                      'hover:scale-105 hover:bg-dynamic-purple/10 hover:text-dynamic-purple/80',
                      isHovered || customDateOpen
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100',
                      customDateOpen &&
                        'bg-dynamic-purple/10 text-dynamic-purple/80'
                    )}
                    disabled={isLoading}
                  >
                    <CalendarPlus className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto p-0"
                  side="top"
                  sideOffset={8}
                  align="end"
                >
                  <div className="min-w-[320px] space-y-4 p-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">
                        Set Due Date
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 hover:bg-muted"
                        onClick={() => setCustomDateOpen(false)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>

                    {/* Quick Date Options */}
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDueDateChange(0)}
                        className="justify-start text-xs"
                      >
                        <CalendarDays className="h-3 w-3" />
                        Today
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDueDateChange(1)}
                        className="justify-start text-xs"
                      >
                        <CalendarDays className="h-3 w-3" />
                        Tomorrow
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDueDateChange(7)}
                        className="justify-start text-xs"
                      >
                        <CalendarDays className="h-3 w-3" />
                        Next Week
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDueDateChange(30)}
                        className="justify-start text-xs"
                      >
                        <CalendarDays className="h-3 w-3" />
                        Next Month
                      </Button>
                    </div>

                    <div className="border-t pt-3">
                      <Label className="mb-2 block text-xs text-muted-foreground">
                        Or pick a specific date:
                      </Label>
                      <DateTimePicker
                        date={
                          task.end_date ? new Date(task.end_date) : undefined
                        }
                        setDate={handleCustomDateChange}
                        showTimeSelect={false}
                        minDate={new Date()}
                      />
                    </div>

                    {task.end_date && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-muted-foreground hover:text-foreground"
                        onClick={() => handleCustomDateChange(undefined)}
                      >
                        <X className="h-4 w-4" />
                        Remove Due Date
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {/* Main Actions Menu - Simplified */}
            {!isOverlay && (
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="xs"
                    className={cn(
                      'h-7 w-7 shrink-0 p-0 transition-all duration-200',
                      'hover:scale-105 hover:bg-muted/80',
                      isHovered || menuOpen
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100',
                      menuOpen && 'bg-muted ring-1 ring-border'
                    )}
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-48"
                  sideOffset={5}
                >
                  <DropdownMenuItem
                    onClick={() => {
                      setEditDialogOpen(true);
                      setMenuOpen(false);
                    }}
                    className="cursor-pointer"
                  >
                    <Edit3 className="h-4 w-4" />
                    Edit task
                  </DropdownMenuItem>

                  {/* Quick Completion Action */}
                  {canMoveToCompletion && (
                    <DropdownMenuItem
                      onClick={handleMoveToCompletion}
                      className="cursor-pointer"
                      disabled={isLoading}
                    >
                      <CheckCircle2 className="h-4 w-4 text-dynamic-green/80" />
                      Mark as{' '}
                      {targetCompletionList?.status === 'done'
                        ? 'Done'
                        : 'Closed'}
                    </DropdownMenuItem>
                  )}

                  {canMoveToCompletion && <DropdownMenuSeparator />}

                  {/* Priority Actions */}
                  <DropdownMenuItem
                    onClick={() => {
                      handlePriorityChange(1);
                      setMenuOpen(false);
                    }}
                    className="cursor-pointer"
                  >
                    <Flag className="h-4 w-4 text-dynamic-red/80" />
                    Urgent Priority
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      handlePriorityChange(2);
                      setMenuOpen(false);
                    }}
                    className="cursor-pointer"
                  >
                    <Flag className="h-4 w-4 text-dynamic-orange/80" />
                    High Priority
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      handlePriorityChange(3);
                      setMenuOpen(false);
                    }}
                    className="cursor-pointer"
                  >
                    <Flag className="h-4 w-4 text-dynamic-yellow/80" />
                    Medium Priority
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      handlePriorityChange(4);
                      setMenuOpen(false);
                    }}
                    className="cursor-pointer"
                  >
                    <Flag className="h-4 w-4 text-dynamic-blue/80" />
                    Low Priority
                  </DropdownMenuItem>

                  {task.end_date && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          handleDueDateChange(null);
                          setMenuOpen(false);
                        }}
                        className="cursor-pointer text-muted-foreground"
                      >
                        <X className="h-4 w-4" />
                        Remove Due Date
                      </DropdownMenuItem>
                    </>
                  )}

                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setDeleteDialogOpen(true);
                      setMenuOpen(false);
                    }}
                    className="cursor-pointer text-dynamic-red/80 hover:bg-dynamic-red/10 hover:text-dynamic-red/90"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete task
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        {/* Dates Row (compact, smaller font) */}
        {(startDate || endDate) && (
          <div className="mb-1 flex items-center gap-2 text-[10px] text-muted-foreground">
            {startDate && (
              <span className="flex items-center gap-1">
                <Clock className="h-2.5 w-2.5 shrink-0" />
                Starts {formatSmartDate(startDate)}
              </span>
            )}
            {startDate && endDate && <span className="mx-1">•</span>}
            {endDate && (
              <span
                className={cn(
                  'flex items-center gap-1',
                  isOverdue && !task.archived
                    ? 'font-medium text-dynamic-red/80'
                    : ''
                )}
              >
                <Calendar className="h-2.5 w-2.5 shrink-0" />
                Due {formatSmartDate(endDate)}
                {isOverdue && !task.archived && (
                  <Badge className="ml-1 h-4 bg-dynamic-red/80 px-1 text-[9px] text-white">
                    OVERDUE
                  </Badge>
                )}
                {endDate && !isOverdue && !task.archived && (
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    ({format(endDate, 'MMM dd')})
                  </span>
                )}
              </span>
            )}
          </div>
        )}
        {/* Bottom Row: Three-column layout for assignee, priority/tags, and checkbox, with only one tag visible and +N tooltip for extras */}
        <div className="flex h-8 min-w-0 items-center gap-x-1 overflow-hidden whitespace-nowrap">
          {/* Assignee: left, not cut off */}
          <div className="max-w-[120px] min-w-0 flex-shrink-0 truncate overflow-hidden">
            <AssigneeSelect
              taskId={task.id}
              assignees={task.assignees}
              onUpdate={onUpdate}
            />
          </div>
          {/* Priority */}
          {!task.archived && task.priority && (
            <div className="max-w-[80px] min-w-0 overflow-hidden">
              {getPriorityIndicator()}
            </div>
          )}
          {/* Tags and +N: do NOT shrink */}
          {!task.archived && task.tags && task.tags.length > 0 && (
            <div className="max-w-[180px] min-w-0">
              <TaskTagsDisplay
                tags={task.tags}
                maxDisplay={1}
                className="mt-0 h-6 truncate rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                clickable={false}
              />
            </div>
          )}
          {/* Checkbox: always at far right */}
          <div className="ml-auto flex-shrink-0">
            <Checkbox
              checked={task.archived}
              className={cn(
                'h-4 w-4 transition-all duration-200',
                'data-[state=checked]:border-dynamic-green/70 data-[state=checked]:bg-dynamic-green/70',
                'hover:scale-110 hover:border-primary/50',
                getListColorClasses(taskList?.color as SupportedColor),
                isOverdue &&
                  !task.archived &&
                  'border-dynamic-red/70 bg-dynamic-red/10 ring-1 ring-dynamic-red/20'
              )}
              style={
                !task.archived && taskList?.status === 'done'
                  ? {
                      animation: 'pulse 4s ease-in-out infinite',
                      borderColor: 'rgb(245 158 11 / 0.3)',
                      backgroundColor: 'rgb(245 158 11 / 0.6)',
                    }
                  : undefined
              }
              disabled={isLoading}
              onCheckedChange={handleArchiveToggle}
              onClick={(e) => e.stopPropagation()}
              title={
                !task.archived && taskList?.status === 'done'
                  ? 'Task is in Done list but not individually checked'
                  : undefined
              }
            />
          </div>
        </div>
      </div>

      {/* Footer - Enhanced priority indicator */}
      {!task.archived && task.priority === 1 && (
        <div className="mt-3 flex items-center justify-center border-t border-dynamic-red/20 pt-2">
          <div className="flex items-center gap-1 text-dynamic-red/80">
            <Sparkles className="h-3 w-3 animate-pulse" />
            <span className="text-[10px] font-medium">Urgent Priority</span>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{task.name}&quot;? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete task'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task Edit Dialog */}
      <TaskEditDialog
        task={task}
        isOpen={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        onUpdate={onUpdate}
        availableLists={availableLists}
      />

      {!isOverlay && (
        <TaskActions taskId={task.id} boardId={boardId} onUpdate={onUpdate} />
      )}
    </Card>
  );
});
