import { AssigneeSelect } from './_components/assignee-select';
import { TaskActions } from './task-actions';
import { useDeleteTask, useUpdateTask } from '@/lib/task-helper';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import {
  TaskList,
  Task as TaskType,
} from '@tuturuuu/types/primitives/TaskBoard';
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
import {
  AlertCircle,
  Calendar,
  CalendarDays,
  CalendarPlus,
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
import { cn } from '@tuturuuu/utils/format';
import {
  addDays,
  format,
  formatDistanceToNow,
  isToday,
  isTomorrow,
  isYesterday,
} from 'date-fns';
import { useRef, useState } from 'react';

export interface Task extends TaskType {}

interface Props {
  task: Task;
  boardId: string;
  taskList?: TaskList;
  isOverlay?: boolean;
  onUpdate?: () => void;
}

export function TaskCard({
  task,
  boardId,
  taskList,
  isOverlay,
  onUpdate,
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
  const datePickerRef = useRef<HTMLButtonElement>(null);
  const updateTaskMutation = useUpdateTask(boardId);
  const deleteTaskMutation = useDeleteTask(boardId);

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
          'px-2 py-0.5 text-xs',
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

  return (
    <Card
      ref={setNodeRef}
      style={style}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
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
          'hover:border-primary/30 hover:ring-1 hover:ring-primary/15'
      )}
    >
      {/* Overdue indicator */}
      {isOverdue && !task.archived && (
        <div className="absolute top-0 right-0 h-0 w-0 border-t-[20px] border-l-[20px] border-t-dynamic-red/80 border-l-transparent">
          <AlertCircle className="absolute -top-4 -right-[18px] h-3 w-3" />
        </div>
      )}

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-1">
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
          >
            <GripVertical className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            {isEditing ? (
              <div className="space-y-3">
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
                <Input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Add description..."
                  className="text-xs"
                />
                <div className="flex gap-2">
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
                <div className="flex items-start justify-between gap-1">
                  <h3
                    className={cn(
                      'mb-2 cursor-pointer text-left text-xs leading-tight font-semibold transition-colors',
                      task.archived
                        ? 'text-muted-foreground line-through'
                        : 'text-foreground group-hover:text-foreground/90 hover:text-primary'
                    )}
                    onClick={() => setIsEditing(true)}
                  >
                    {task.name}
                  </h3>

                  <div className="flex items-center justify-end gap-1">
                    {/* Custom Date Picker - Separate from Dropdown */}
                    {!isOverlay && (
                      <Popover
                        open={customDateOpen}
                        onOpenChange={setCustomDateOpen}
                      >
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
                                  task.end_date
                                    ? new Date(task.end_date)
                                    : undefined
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
                                onClick={() =>
                                  handleCustomDateChange(undefined)
                                }
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
                              setIsEditing(true);
                              setMenuOpen(false);
                            }}
                            className="cursor-pointer"
                          >
                            <Edit3 className="h-4 w-4" />
                            Edit task
                          </DropdownMenuItem>

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

                {task.description && (
                  <p
                    className="mb-2 line-clamp-2 cursor-pointer text-xs leading-relaxed text-muted-foreground transition-colors hover:text-foreground/80"
                    onClick={() => setIsEditing(true)}
                  >
                    {task.description}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Metadata */}
        <div className="space-y-2">
          {/* Priority and Status Tags */}
          {!task.archived && getPriorityIndicator() && (
            <div className="flex flex-wrap items-center gap-2">
              {getPriorityIndicator()}
            </div>
          )}

          {/* Dates */}
          {(startDate || endDate) && (
            <div className="space-y-1.5">
              {startDate && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span>Starts {formatSmartDate(startDate)}</span>
                </div>
              )}
              {!task.archived && endDate && (
                <div
                  className={cn(
                    'flex items-center gap-1.5 text-xs',
                    isOverdue && !task.archived
                      ? 'font-medium text-dynamic-red/80'
                      : 'text-muted-foreground'
                  )}
                >
                  <Calendar className="h-3 w-3 shrink-0" />
                  <span>Due {formatSmartDate(endDate)}</span>
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
                </div>
              )}
            </div>
          )}

          {/* Bottom Actions */}
          <div className="flex items-center justify-between pt-1">
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
                  'data-[state=checked]:border-dynamic-green/70 data-[state=checked]:bg-dynamic-green/70',
                  'hover:scale-110 hover:border-primary/50',
                  getListColorClasses(taskList?.color as SupportedColor),
                  isOverdue &&
                    !task.archived &&
                    'border-dynamic-red/70 bg-dynamic-red/10 ring-1 ring-dynamic-red/20'
                )}
                disabled={isLoading}
                onCheckedChange={handleArchiveToggle}
                onClick={(e) => e.stopPropagation()}
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
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{task.name}"? This action cannot
              be undone.
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

      {!isOverlay && onUpdate && (
        <TaskActions taskId={task.id} boardId={boardId} onUpdate={onUpdate} />
      )}
    </Card>
  );
}
