import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import {
  AlertCircle,
  Calendar,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  CircleDashed,
  CircleFadingArrowUpIcon,
  CircleSlash,
  Clock,
  Edit3,
  Flag,
  GripVertical,
  List,
  Loader2,
  MoreHorizontal,
  Move,
  Trash2,
  UserMinus,
  UserStar,
  X,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import {
  moveTask,
  useDeleteTask,
  useUpdateTask,
} from '@tuturuuu/utils/task-helper';
import {
  addDays,
  format,
  formatDistanceToNow,
  isToday,
  isTomorrow,
  isYesterday,
} from 'date-fns';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TaskActions } from 'src/components/ui/tu-do/boards/boardId/task-actions';
import { AssigneeSelect } from 'src/components/ui/tu-do/shared/assignee-select';
import { TaskEditDialog } from 'src/components/ui/tu-do/shared/task-edit-dialog';
import { TaskTagsDisplay } from 'src/components/ui/tu-do/shared/task-tags-display';

interface Props {
  task: Task;
  boardId: string;
  taskList?: TaskList;
  isOverlay?: boolean;
  onUpdate: () => void;
  availableLists?: TaskList[]; // Optional: pass from parent to avoid redundant API calls
  isSelected?: boolean;
  isMultiSelectMode?: boolean;
  isPersonalWorkspace?: boolean;
  onSelect?: (taskId: string, event: React.MouseEvent) => void;
}

// Lightweight drag overlay version
export function LightweightTaskCard({ task }: { task: Task }) {
  const labels = {
    critical: 'Urgent',
    high: 'High',
    normal: 'Medium',
    low: 'Low',
  };

  return (
    <Card className="pointer-events-none w-full max-w-[350px] scale-105 select-none border-2 border-primary/20 bg-background opacity-95 shadow-xl ring-2 ring-primary/20">
      <div className="flex flex-col gap-2 p-4">
        <div className="truncate font-semibold text-base">{task.name}</div>
        <div className="flex items-center gap-2">
          {task.priority && (
            <Badge variant="secondary" className="text-xs">
              {labels[task.priority as keyof typeof labels]}
            </Badge>
          )}
          {task.tags && task.tags.length > 0 && (
            <span className="text-muted-foreground text-xs">
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
  isPersonalWorkspace = false,
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

  async function handlePriorityChange(priority: TaskPriority | null) {
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

  async function handleRemoveAllAssignees() {
    if (!task.assignees || task.assignees.length === 0) return;

    setIsLoading(true);
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from('task_assignees')
        .delete()
        .eq('task_id', task.id);

      if (error) {
        throw error;
      }

      toast({
        title: 'Success',
        description: 'All assignees removed from task',
      });

      onUpdate?.();
    } catch (error) {
      console.error('Failed to remove all assignees:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove assignees. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setMenuOpen(false);
    }
  }

  async function handleRemoveAssignee(assigneeId: string) {
    setIsLoading(true);
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from('task_assignees')
        .delete()
        .eq('task_id', task.id)
        .eq('user_id', assigneeId);

      if (error) {
        throw error;
      }

      const assignee = task.assignees?.find((a) => a.id === assigneeId);
      toast({
        title: 'Success',
        description: `${assignee?.display_name || assignee?.email || 'Assignee'} removed from task`,
      });

      onUpdate?.();
    } catch (error) {
      console.error('Failed to remove assignee:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove assignee. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setMenuOpen(false);
    }
  }

  async function handleMoveToList(targetListId: string) {
    if (targetListId === task.list_id) {
      setMenuOpen(false);
      return; // Already in this list
    }

    setIsLoading(true);
    const supabase = createClient();

    try {
      await moveTask(supabase, task.id, targetListId);

      const targetList = availableLists.find(
        (list) => list.id === targetListId
      );
      toast({
        title: 'Success',
        description: `Task moved to ${targetList?.name || 'selected list'}`,
      });

      onUpdate?.();
    } catch (error) {
      console.error('Failed to move task:', error);
      toast({
        title: 'Error',
        description: 'Failed to move task. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setMenuOpen(false);
    }
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
      case 'critical':
        return 'border-dynamic-red/70';
      case 'high':
        return 'border-dynamic-orange/70';
      case 'normal':
        return 'border-dynamic-yellow/70';
      case 'low':
        return 'border-dynamic-blue/70';
      default:
        return 'border-dynamic-gray/70';
    }
  };

  const getPriorityIndicator = () => {
    if (!task.priority) return null;
    const colors = {
      critical: 'bg-dynamic-red/10 border-dynamic-red/30 text-dynamic-red',
      high: 'bg-dynamic-orange/10 border-dynamic-orange/30 text-dynamic-orange',
      normal:
        'bg-dynamic-yellow/10 border-dynamic-yellow/30 text-dynamic-yellow',
      low: 'bg-dynamic-blue/10 border-dynamic-blue/30 text-dynamic-blue',
    };

    const labels = {
      critical: 'Urgent',
      high: 'High',
      normal: 'Medium',
      low: 'Low',
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
          'group-hover:text-foreground',
          'hover:scale-110 hover:text-primary',
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
        isSelected && 'bg-primary/5 shadow-md ring-2 ring-primary/50',
        // Visual feedback for invalid drop (dev only)
        process.env.NODE_ENV === 'development' &&
          isDragging &&
          !isOverlay &&
          'ring-2 ring-red-400/60'
      )}
    >
      {/* Overdue indicator */}
      {isOverdue && !task.archived && (
        <div className="absolute top-0 right-0 h-0 w-0 border-t-[20px] border-t-dynamic-red border-l-[20px] border-l-transparent">
          <AlertCircle className="-top-4 -right-[18px] absolute h-3 w-3" />
        </div>
      )}

      {/* Selection indicator */}
      {isMultiSelectMode && isSelected && (
        <div className="absolute top-2 left-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground text-xs shadow-sm">
          <Check className="h-4 w-4" />
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
                  className="font-semibold text-sm"
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
                      'w-full cursor-pointer text-left font-semibold text-xs leading-tight transition-colors',
                      task.archived
                        ? 'text-muted-foreground line-through'
                        : 'text-foreground hover:text-primary group-hover:text-foreground/90'
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
                      className="scrollbar-none group-hover:scrollbar-thin scrollbar-track-transparent scrollbar-thumb-muted-foreground/30 group-hover:scrollbar-thumb-muted-foreground/50 max-h-20 w-full cursor-pointer overflow-y-auto whitespace-pre-line border-none bg-transparent p-0 text-left text-muted-foreground text-xs hover:text-foreground focus:outline-none"
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
                      'hover:scale-105 hover:bg-dynamic-purple/10 hover:text-dynamic-purple',
                      isHovered || customDateOpen
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100',
                      customDateOpen &&
                        'bg-dynamic-purple/10 text-dynamic-purple'
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
                      <Label className="font-semibold text-sm">
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
                      <Label className="mb-2 block text-muted-foreground text-xs">
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
                      'hover:scale-105 hover:bg-muted',
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
                      <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
                      Mark as{' '}
                      {targetCompletionList?.status === 'done'
                        ? 'Done'
                        : 'Closed'}
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator />

                  {/* Priority Actions */}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Flag className="h-4 w-4" />
                      <div className="flex w-full items-center justify-between">
                        <span>Priority</span>
                        <span className="ml-auto text-muted-foreground text-xs">
                          {task.priority === 'critical' && 'Urgent'}
                          {task.priority === 'high' && 'High'}
                          {task.priority === 'normal' && 'Medium'}
                          {task.priority === 'low' && 'Low'}
                          {!task.priority && 'None'}
                        </span>
                      </div>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem
                        onClick={() => {
                          handlePriorityChange(null);
                          setMenuOpen(false);
                        }}
                        className={cn(
                          'cursor-pointer text-muted-foreground',
                          !task.priority && 'bg-muted/50'
                        )}
                      >
                        <div className="flex w-full items-center justify-between">
                          <div className="flex items-center gap-2">
                            <X className="h-4 w-4" />
                            None
                          </div>
                          {!task.priority && <Check className="h-4 w-4" />}
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          handlePriorityChange('critical');
                          setMenuOpen(false);
                        }}
                        className={cn(
                          'cursor-pointer',
                          task.priority === 'critical' &&
                            'bg-dynamic-red/10 text-dynamic-red'
                        )}
                      >
                        <div className="flex w-full items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Flag className="h-4 w-4 text-dynamic-red" />
                            Urgent
                          </div>
                          {task.priority === 'critical' && (
                            <Check className="h-4 w-4 text-dynamic-red" />
                          )}
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          handlePriorityChange('high');
                          setMenuOpen(false);
                        }}
                        className={cn(
                          'cursor-pointer',
                          task.priority === 'high' &&
                            'bg-dynamic-orange/10 text-dynamic-orange'
                        )}
                      >
                        <div className="flex w-full items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Flag className="h-4 w-4 text-dynamic-orange" />
                            High
                          </div>
                          {task.priority === 'high' && (
                            <Check className="h-4 w-4 text-dynamic-orange" />
                          )}
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          handlePriorityChange('normal');
                          setMenuOpen(false);
                        }}
                        className={cn(
                          'cursor-pointer',
                          task.priority === 'normal' &&
                            'bg-dynamic-yellow/10 text-dynamic-yellow'
                        )}
                      >
                        <div className="flex w-full items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Flag className="h-4 w-4 text-dynamic-yellow" />
                            Medium
                          </div>
                          {task.priority === 'normal' && (
                            <Check className="h-4 w-4 text-dynamic-yellow" />
                          )}
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          handlePriorityChange('low');
                          setMenuOpen(false);
                        }}
                        className={cn(
                          'cursor-pointer',
                          task.priority === 'low' &&
                            'bg-dynamic-blue/10 text-dynamic-blue'
                        )}
                      >
                        <div className="flex w-full items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Flag className="h-4 w-4 text-dynamic-blue" />
                            Low
                          </div>
                          {task.priority === 'low' && (
                            <Check className="h-4 w-4 text-dynamic-blue" />
                          )}
                        </div>
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  {/* Move to List Actions */}
                  {availableLists.length > 1 && (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Move className="h-4 w-4" />
                        <div className="flex w-full items-center justify-between">
                          <span>Move</span>
                        </div>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {availableLists
                          .filter((list) => list.id !== task.list_id)
                          .map((list) => (
                            <DropdownMenuItem
                              key={list.id}
                              onClick={() => handleMoveToList(list.id)}
                              className="cursor-pointer"
                              disabled={isLoading}
                            >
                              <div className="flex w-full items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {list.status === 'done' && (
                                    <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
                                  )}
                                  {list.status === 'closed' && (
                                    <CircleSlash className="h-4 w-4 text-dynamic-purple" />
                                  )}
                                  {list.status === 'not_started' && (
                                    <CircleDashed className="h-4 w-4 opacity-70" />
                                  )}
                                  {list.status === 'active' && (
                                    <CircleFadingArrowUpIcon className="h-4 w-4 text-dynamic-blue" />
                                  )}
                                  {list.name}
                                </div>
                              </div>
                            </DropdownMenuItem>
                          ))}
                        {availableLists.filter(
                          (list) => list.id !== task.list_id
                        ).length === 0 && (
                          <DropdownMenuItem
                            disabled
                            className="text-muted-foreground"
                          >
                            <List className="h-4 w-4" />
                            No other lists available
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  )}

                  {/* Assignee Actions - Only show if not personal workspace and has assignees */}
                  {!isPersonalWorkspace &&
                    task.assignees &&
                    task.assignees.length > 0 && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <UserStar className="h-4 w-4" />
                          Assignees
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {task.assignees.map((assignee) => (
                            <DropdownMenuItem
                              key={assignee.id}
                              onClick={() => handleRemoveAssignee(assignee.id)}
                              className="cursor-pointer text-muted-foreground"
                              disabled={isLoading}
                            >
                              <X className="h-4 w-4" />
                              Remove{' '}
                              {assignee.display_name ||
                                assignee.email?.split('@')[0] ||
                                'User'}
                            </DropdownMenuItem>
                          ))}
                          {task.assignees.length > 1 && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={handleRemoveAllAssignees}
                                className="cursor-pointer text-dynamic-red hover:bg-dynamic-red/10 hover:text-dynamic-red/90"
                                disabled={isLoading}
                              >
                                <UserMinus className="h-4 w-4" />
                                Remove all assignees
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}

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
                    className="cursor-pointer text-dynamic-red hover:bg-dynamic-red/10 hover:text-dynamic-red/90"
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
                    ? 'font-medium text-dynamic-red'
                    : ''
                )}
              >
                <Calendar className="h-2.5 w-2.5 shrink-0" />
                Due {formatSmartDate(endDate)}
                {isOverdue && !task.archived && (
                  <Badge className="ml-1 h-4 bg-dynamic-red px-1 text-[9px] text-white">
                    OVERDUE - {format(endDate, "MMM dd 'at' h:mm a")}
                  </Badge>
                )}
                {!isOverdue && !task.archived && endDate && (
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    ({format(endDate, "MMM dd 'at' h:mm a")})
                  </span>
                )}
              </span>
            )}
          </div>
        )}
        {/* Bottom Row: Three-column layout for assignee, priority/tags, and checkbox, with only one tag visible and +N tooltip for extras */}
        <div className="flex h-8 min-w-0 items-center gap-x-1 overflow-hidden whitespace-nowrap">
          {/* Assignee: left, not cut off */}
          {!isPersonalWorkspace && (
            <div className="min-w-0 max-w-[120px] flex-shrink-0 overflow-hidden truncate">
              <AssigneeSelect
                taskId={task.id}
                assignees={task.assignees}
                onUpdate={onUpdate}
              />
            </div>
          )}
          {/* Priority */}
          {!task.archived && task.priority && (
            <div className="min-w-0 max-w-[80px] overflow-hidden">
              {getPriorityIndicator()}
            </div>
          )}
          {/* Tags and +N: do NOT shrink */}
          {!task.archived && task.tags && task.tags.length > 0 && (
            <div className="min-w-0 max-w-[180px]">
              <TaskTagsDisplay
                tags={task.tags}
                maxDisplay={1}
                className="mt-0 h-6 truncate rounded-full px-1.5 py-0.5 font-medium text-[10px]"
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
