import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { User } from '@tuturuuu/types/db';
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
import {
  AlertCircle,
  CalendarIcon,
  Clock,
  Flag,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Undo2,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { Textarea } from '@tuturuuu/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { addDays, format, isBefore, isToday, startOfToday } from 'date-fns';
import { useEffect, useState } from 'react';
import { useDeleteTask, useUpdateTask } from '@/lib/task-helper';

interface Props {
  taskId: string;
  boardId: string;
  onUpdate: () => void;
}

type TaskUser = Pick<User, 'id' | 'display_name' | 'avatar_url' | 'handle'>;

export function TaskActions({ taskId, boardId, onUpdate }: Props) {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Fetch the latest task data using React Query
  const { data: task, isLoading: isTaskLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: async () => {
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

      // Transform the nested assignees data
      const transformedTask = {
        ...data,
        assignees: data.assignees
          ?.map((a: { user: TaskUser }) => a.user)
          .filter(
            (user: TaskUser, index: number, self: TaskUser[]) =>
              user?.id &&
              self.findIndex((u: TaskUser) => u.id === user.id) === index
          ),
      };

      return transformedTask;
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
  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [_isEndDateChanged, setEndDateChanged] = useState(false);

  const updateTaskMutation = useUpdateTask(boardId);
  const deleteTaskMutation = useDeleteTask(boardId);

  // Update local state when task data changes
  useEffect(() => {
    if (task) {
      setNewName(task.name || '');
      setNewDescription(task.description || '');
      setNewStartDate(task.start_date ? new Date(task.start_date) : undefined);
      setNewEndDate(task.end_date ? new Date(task.end_date) : undefined);
      setNewPriority(task.priority?.toString() || '0');
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

    setHasChanges(
      hasNameChange ||
        hasDescriptionChange ||
        hasStartDateChange ||
        hasEndDateChange ||
        hasPriorityChange
    );
  }, [newName, newDescription, newStartDate, newEndDate, newPriority, task]);

  async function handleDelete() {
    setIsLoading(true);
    deleteTaskMutation.mutate(taskId, {
      onSuccess: () => {
        setIsDeleteDialogOpen(false);
        onUpdate();
        setIsEditDialogOpen(false);
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
        },
      },
      {
        onSuccess: () => {
          onUpdate();
          setIsEditDialogOpen(false);
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
    <button
      type="button"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
        }
      }}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        margin: 0,
        width: '100%',
      }}
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
              Are you sure you want to delete "{task.name}"? This action cannot
              be undone.
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
              Make changes to your task here. Click save when you're done.
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
                placeholder="Add a more detailed description"
                className="min-h-[100px] resize-y"
              />
            </div>
            <div className="grid gap-2">
              <Label>Priority</Label>
              <Select value={newPriority} onValueChange={setNewPriority}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select priority">
                    {newPriority === '0' ? (
                      'No priority'
                    ) : (
                      <div className="flex items-center gap-2">
                        <Flag
                          className={cn('h-3 w-3', {
                            'fill-destructive stroke-destructive':
                              newPriority === '1',
                            'fill-yellow-500 stroke-yellow-500':
                              newPriority === '2',
                            'fill-green-500 stroke-green-500':
                              newPriority === '3',
                          })}
                        />
                        {newPriority === '1'
                          ? 'P1 - High'
                          : newPriority === '2'
                            ? 'P2 - Medium'
                            : 'P3 - Low'}
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">No priority</SelectItem>
                  <SelectItem value="1">
                    <div className="flex items-center gap-2">
                      <Flag className="h-3 w-3 fill-destructive stroke-destructive" />
                      P1 - High
                    </div>
                  </SelectItem>
                  <SelectItem value="2">
                    <div className="flex items-center gap-2">
                      <Flag className="h-3 w-3 fill-yellow-500 stroke-yellow-500" />
                      P2 - Medium
                    </div>
                  </SelectItem>
                  <SelectItem value="3">
                    <div className="flex items-center gap-2">
                      <Flag className="h-3 w-3 fill-green-500 stroke-green-500" />
                      P3 - Low
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
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
                      <button
                        type="button"
                        className="ml-auto flex h-4 w-4 cursor-pointer items-center justify-center rounded-sm p-0 opacity-50 hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNewStartDate(undefined);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation();
                            setNewStartDate(undefined);
                          }
                        }}
                      >
                        <Undo2 className="h-3 w-3" />
                      </button>
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
                      <button
                        type="button"
                        className="ml-auto flex h-4 w-4 cursor-pointer items-center justify-center rounded-sm p-0 opacity-50 hover:opacity-100"
                        onClick={() => {
                          setNewEndDate(undefined);
                          setEndDateChanged(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setNewEndDate(undefined);
                            setEndDateChanged(true);
                          }
                        }}
                        aria-label="Undo end date"
                      >
                        <Undo2 className="h-3 w-3" />
                      </button>
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
    </button>
  );
}
