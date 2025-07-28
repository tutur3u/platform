import { TaskTagInput } from './_components/task-tag-input';
import { useDeleteTask, useUpdateTask } from '@/lib/task-helper';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/TaskBoard';
import { Button } from '@tuturuuu/ui/button';
import { Calendar } from '@tuturuuu/ui/calendar';
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
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import {
  AlertCircle,
  CalendarIcon,
  Clock,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Undo2,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Separator } from '@tuturuuu/ui/separator';
import { Textarea } from '@tuturuuu/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { addDays, format, isBefore, isToday, startOfToday } from 'date-fns';
import { useCallback, useEffect, useState } from 'react';

interface Props {
  taskId: string;
  boardId: string;
  onUpdate: () => void;
}

export function TaskActions({ taskId, boardId, onUpdate }: Props) {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const { toast } = useToast();

  // Fetch the latest task data using React Query
  const { data: task, isLoading: isTaskLoading } = useQuery<Task>({
    queryKey: ['task', taskId],
    queryFn: async (): Promise<Task> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('tasks')
        .select(
          `
          *,
          assignees:task_assignees(
            user:users(
              id,
              display_name,
              avatar_url,
              handle
            )
          )
        `
        )
        .eq('id', taskId)
        .single();

      if (error) throw error;

      // Transform the nested assignees data and convert null to undefined for optional fields
      const transformedTask = {
        ...data,
        description: data.description || undefined,
        priority: data.priority || undefined,
        start_date: data.start_date || undefined,
        end_date: data.end_date || undefined,
        tags: data.tags || undefined,
        assignees:
          data.assignees
            ?.map(
              (a: {
                user: {
                  id: string;
                  display_name: string | null;
                  avatar_url: string | null;
                  handle: string | null;
                };
              }) => ({
                id: a.user.id,
                display_name: a.user.display_name || undefined,
                avatar_url: a.user.avatar_url || undefined,
                handle: a.user.handle || undefined,
              })
            )
            .filter(
              (
                user: {
                  id: string;
                  display_name?: string | undefined;
                  avatar_url?: string | undefined;
                  handle?: string | undefined;
                } | null,
                index: number,
                self: ({
                  id: string;
                  display_name?: string | undefined;
                  avatar_url?: string | undefined;
                  handle?: string | undefined;
                } | null)[]
              ) =>
                user?.id && self.findIndex((u) => u?.id === user.id) === index
            ) || [],
      };

      return transformedTask as Task;
    },
    enabled: !!taskId && isEditDialogOpen, // Only fetch when modal is open
    staleTime: 0, // Always fetch fresh data
    refetchOnWindowFocus: false,
  });

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newStartDate, setNewStartDate] = useState<Date | undefined>(undefined);
  const [newEndDate, setNewEndDate] = useState<Date | undefined>(undefined);
  const [newPriority, setNewPriority] = useState<string>('0');
  const [newTags, setNewTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const updateTaskMutation = useUpdateTask(boardId);
  const deleteTaskMutation = useDeleteTask(boardId);

  // Memoize the onChange handler to prevent stale closures
  const handleTagsChange = useCallback((tags: string[]) => {
    setNewTags(tags);
  }, []); // Remove newTags from dependencies to prevent recreation

  // Update local state when task data changes
  useEffect(() => {
    if (task) {
      setNewName(task.name || '');
      setNewDescription(task.description || '');
      setNewStartDate(task.start_date ? new Date(task.start_date) : undefined);
      setNewEndDate(task.end_date ? new Date(task.end_date) : undefined);
      setNewPriority(task.priority?.toString() || '0');
      setNewTags(task.tags || []);
    }
  }, [task]);

  useEffect(() => {
    if (!task) return;

    const hasNameChange = newName !== (task.name || '');
    const hasDescriptionChange = newDescription !== (task.description || '');
    const hasStartDateChange =
      (newStartDate?.toISOString() || null) !== task.start_date;
    const hasEndDateChange =
      (newEndDate?.toISOString() || null) !== task.end_date;
    const hasPriorityChange =
      newPriority !== (task.priority?.toString() || '0');
    const hasTagsChange =
      JSON.stringify(newTags) !== JSON.stringify(task.tags || []);

    setHasChanges(
      hasNameChange ||
        hasDescriptionChange ||
        hasStartDateChange ||
        hasEndDateChange ||
        hasPriorityChange ||
        hasTagsChange
    );
  }, [
    newName,
    newDescription,
    newStartDate,
    newEndDate,
    newPriority,
    newTags,
    task,
  ]);

  async function handleDelete() {
    setIsLoading(true);
    deleteTaskMutation.mutate(taskId, {
      onSuccess: () => {
        toast({
          title: 'Task deleted',
          description: 'The task has been successfully deleted.',
        });
        setIsDeleteDialogOpen(false);
        onUpdate();
        setIsEditDialogOpen(false);
      },
      onError: (error) => {
        toast({
          title: 'Error deleting task',
          description:
            error.message || 'Failed to delete the task. Please try again.',
          variant: 'destructive',
        });
      },
      onSettled: () => {
        setIsLoading(false);
      },
    });
  }

  async function handleUpdate() {
    if (!hasChanges || !task) return;

    setIsLoading(true);
    updateTaskMutation.mutate(
      {
        taskId,
        updates: {
          name: newName,
          description: newDescription === '' ? undefined : newDescription,
          start_date: newStartDate?.toISOString() ?? undefined,
          end_date: newEndDate?.toISOString() ?? undefined,
          priority: newPriority === '0' ? undefined : parseInt(newPriority),
          tags: (() => {
            const filteredTags = newTags.filter((tag) => tag && tag.trim() !== '');
            return filteredTags.length === 0 ? [] : filteredTags;
          })(),
        },
      },
      {
        onSuccess: () => {
          toast({
            title: 'Task updated',
            description: 'The task has been successfully updated.',
          });
          onUpdate();
          setIsEditDialogOpen(false);
        },
        onError: (error) => {
          toast({
            title: 'Error updating task',
            description:
              error.message || 'Failed to update the task. Please try again.',
            variant: 'destructive',
          });
        },
        onSettled: () => {
          setIsLoading(false);
        },
      }
    );
  }

  function handleResetChanges() {
    if (!task) return;

    setNewName(task.name || '');
    setNewDescription(task.description || '');
    setNewStartDate(task.start_date ? new Date(task.start_date) : undefined);
    setNewEndDate(task.end_date ? new Date(task.end_date) : undefined);
    setNewPriority(task.priority?.toString() || '0');
    setNewTags(task.tags || []);
  }

  const today = startOfToday();
  const isOverdue = newEndDate && isBefore(newEndDate, today);
  const isStartDateAfterEndDate =
    newStartDate && newEndDate && isBefore(newEndDate, newStartDate);

  // Show loading state if task is being fetched
  if (isTaskLoading || !task) {
    return (
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Loading Task</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-6">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading task...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="w-full"
      role="presentation"
    >
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="absolute top-2 right-2 z-10 h-7 border-border/50 px-2 text-muted-foreground opacity-0 transition-all duration-200 group-hover:opacity-100 hover:border-border hover:bg-muted/80 hover:text-foreground hover:shadow-sm"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
            <span className="sr-only">Open task options</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[200px] p-1">
          <DropdownMenuItem
            onClick={() => setIsEditDialogOpen(true)}
            className="cursor-pointer gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Pencil className="h-4 w-4" />
            <span>Edit task</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator className="my-1" />
          <DropdownMenuItem
            onClick={() => setIsDeleteDialogOpen(true)}
            className="cursor-pointer gap-3 rounded-md px-3 py-2 text-sm font-medium"
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete task</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
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
              onClick={() => setIsDeleteDialogOpen(false)}
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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete task'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
            <DialogDescription>
              Make changes to your task here. Click save when you&apos;re done.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name" className="flex items-center gap-1">
                Task name
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Enter task name"
                className={cn({
                  'border-destructive': !newName.trim(),
                })}
              />
              {!newName.trim() && (
                <p className="text-xs text-destructive">
                  Task name is required
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Enter task description"
                className="resize-none"
              />
            </div>
            <div className="grid gap-2">
              <Label>Tags</Label>
              <TaskTagInput
                value={newTags}
                onChange={handleTagsChange}
                boardId={boardId}
                placeholder="Add tags..."
                maxTags={10}
              />
            </div>
            <div className="grid gap-2">
              <Label>Priority</Label>
              <div 
                className="flex flex-wrap gap-2" 
                role="radiogroup" 
                aria-label="Task priority selection"
              >
                {[
                  {
                    value: '0',
                    label: 'None',
                    color: 'bg-gray-100 text-gray-700',
                  },
                  {
                    value: '1',
                    label: 'Low',
                    color: 'bg-green-100 text-green-700',
                  },
                  {
                    value: '2',
                    label: 'Medium',
                    color: 'bg-yellow-100 text-yellow-700',
                  },
                  {
                    value: '3',
                    label: 'High',
                    color: 'bg-orange-100 text-orange-700',
                  },
                  {
                    value: '4',
                    label: 'Urgent',
                    color: 'bg-red-100 text-red-700',
                  },
                ].map(({ value, label, color }) => (
                  <Button
                    key={value}
                    type="button"
                    variant={newPriority === value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setNewPriority(value)}
                    className={cn(
                      'h-8 px-3 text-xs',
                      newPriority === value && color
                    )}
                    role="radio"
                    aria-checked={newPriority === value}
                    aria-label={`Priority: ${label}`}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Start date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      { 'text-muted-foreground': !newStartDate }
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newStartDate ? format(newStartDate, 'PPP') : 'Pick a date'}
                    {newStartDate && (
                      <span
                        className="ml-auto flex h-4 w-4 cursor-pointer items-center justify-center rounded-sm p-0 opacity-50 hover:opacity-100"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setNewStartDate(undefined);
                        }}
                      >
                        <Undo2 className="h-3 w-3" />
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={newStartDate}
                    onSelect={setNewStartDate}
                    initialFocus
                  />
                  <Separator />
                  <div className="grid grid-cols-2 gap-2 p-2">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setNewStartDate(today)}
                    >
                      Today
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setNewStartDate(addDays(today, 1))}
                    >
                      Tomorrow
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              {isStartDateAfterEndDate && (
                <p className="text-xs text-destructive">
                  Start date cannot be after end date
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Due date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      { 'text-muted-foreground': !newEndDate },
                      { 'border-destructive': isOverdue }
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newEndDate ? format(newEndDate, 'PPP') : 'Pick a date'}
                    {newEndDate && (
                      <span
                        className="ml-auto flex h-4 w-4 cursor-pointer items-center justify-center rounded-sm p-0 opacity-50 hover:opacity-100"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setNewEndDate(undefined);
                        }}
                      >
                        <Undo2 className="h-3 w-3" />
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={newEndDate}
                    onSelect={setNewEndDate}
                    initialFocus
                  />
                  <Separator />
                  <div className="grid grid-cols-2 gap-2 p-2">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setNewEndDate(today)}
                    >
                      Today
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setNewEndDate(addDays(today, 1))}
                    >
                      Tomorrow
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              {isOverdue && (
                <div className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  Due date is in the past
                </div>
              )}
              {isStartDateAfterEndDate && (
                <p className="text-xs text-destructive">
                  Due date cannot be before start date
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <div className="flex flex-1 items-center gap-2">
              {hasChanges && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={handleResetChanges}
                      disabled={isLoading}
                    >
                      <Undo2 className="h-4 w-4" />
                      <span className="sr-only">Reset changes</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Reset changes</TooltipContent>
                </Tooltip>
              )}
              {newStartDate && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {isToday(newStartDate)
                    ? 'Starts today'
                    : `Starts ${format(newStartDate, 'PPP')}`}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleUpdate}
                disabled={
                  isLoading ||
                  !newName.trim() ||
                  !hasChanges ||
                  isStartDateAfterEndDate
                }
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save changes'
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
