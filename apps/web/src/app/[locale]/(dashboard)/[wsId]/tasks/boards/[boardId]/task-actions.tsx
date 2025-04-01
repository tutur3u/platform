import { AssigneeSelect } from './_components/assignee-select';
import { deleteTask, updateTask } from '@/lib/task-helper';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { Calendar } from '@tuturuuu/ui/calendar';
import { Checkbox } from '@tuturuuu/ui/checkbox';
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

interface Props {
  taskId: string;
  taskName: string;
  taskDescription: string | null;
  startDate: string | null;
  endDate: string | null;
  priority: number | null;
  archived: boolean;
  assignees?: {
    id: string;
    display_name?: string;
    email?: string;
    avatar_url?: string;
    handle?: string;
  }[];
  onUpdate: () => void;
  open?: boolean;
  // eslint-disable-next-line no-unused-vars
  onOpenChange?: (open: boolean) => void;
}

export function TaskActions({
  taskId,
  taskName,
  taskDescription,
  startDate,
  endDate,
  priority,
  archived,
  assignees,
  onUpdate,
  open,
  onOpenChange,
}: Props) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [newName, setNewName] = useState(taskName);
  const [newDescription, setNewDescription] = useState(taskDescription || '');
  const [newStartDate, setNewStartDate] = useState<Date | undefined>(
    startDate ? new Date(startDate) : undefined
  );
  const [newEndDate, setNewEndDate] = useState<Date | undefined>(
    endDate ? new Date(endDate) : undefined
  );
  const [newPriority, setNewPriority] = useState<string>(
    priority?.toString() || '0'
  );
  const [newAssignees, setNewAssignees] = useState<typeof assignees>(
    assignees || []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const hasNameChange = newName !== taskName;
    const hasDescriptionChange = newDescription !== (taskDescription || '');
    const hasStartDateChange =
      (newStartDate?.toISOString() || null) !== startDate;
    const hasEndDateChange = (newEndDate?.toISOString() || null) !== endDate;
    const hasPriorityChange = newPriority !== (priority?.toString() || '0');
    const hasAssigneesChange =
      JSON.stringify(newAssignees) !== JSON.stringify(assignees);

    setHasChanges(
      hasNameChange ||
        hasDescriptionChange ||
        hasStartDateChange ||
        hasEndDateChange ||
        hasPriorityChange ||
        hasAssigneesChange
    );
  }, [
    newName,
    newDescription,
    newStartDate,
    newEndDate,
    newPriority,
    newAssignees,
    taskName,
    taskDescription,
    startDate,
    endDate,
    priority,
    assignees,
  ]);

  async function handleDelete() {
    try {
      setIsLoading(true);
      const supabase = createClient();
      await deleteTask(supabase, taskId);
      setIsDeleteDialogOpen(false);
      onUpdate();
    } catch (error) {
      console.error('Failed to delete task:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUpdate() {
    if (!hasChanges) return;

    try {
      setIsLoading(true);
      const supabase = createClient();

      await updateTask(supabase, taskId, {
        name: newName,
        description: newDescription === '' ? undefined : newDescription,
        start_date: newStartDate?.toISOString() ?? undefined,
        end_date: newEndDate?.toISOString() ?? undefined,
        priority: newPriority === '0' ? undefined : parseInt(newPriority),
      });

      onUpdate();
      onOpenChange?.(false);
    } catch (error) {
      console.error('Failed to update task:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleToggleArchive() {
    try {
      setIsLoading(true);
      const supabase = createClient();
      await updateTask(supabase, taskId, {
        archived: !archived,
      });
      onUpdate();
    } catch (error) {
      console.error('Failed to update task archive status:', error);
    } finally {
      setIsLoading(false);
    }
  }

  function handleResetChanges() {
    setNewName(taskName);
    setNewDescription(taskDescription || '');
    setNewStartDate(startDate ? new Date(startDate) : undefined);
    setNewEndDate(endDate ? new Date(endDate) : undefined);
    setNewPriority(priority ? priority.toString() : '0');
    setNewAssignees(assignees || []);
  }

  const today = startOfToday();
  const isOverdue = newEndDate && isBefore(newEndDate, today);
  const isStartDateAfterEndDate =
    newStartDate && newEndDate && isBefore(newEndDate, newStartDate);

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-6 w-6 p-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted/50"
          >
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open task menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[180px]">
          <DropdownMenuItem
            onClick={() => onOpenChange?.(true)}
            className="gap-2 text-sm"
          >
            <Pencil className="h-4 w-4" />
            Edit task
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setIsDeleteDialogOpen(true)}
            className="gap-2 text-sm text-red-600 focus:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
            Delete task
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{taskName}"? This action cannot
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

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Edit Task
            </DialogTitle>
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
              <Label>Assignees</Label>
              <AssigneeSelect
                taskId={taskId}
                assignees={newAssignees}
                onUpdate={onUpdate}
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="ml-auto h-4 w-4 p-0 opacity-50 hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNewStartDate(undefined);
                        }}
                      >
                        <Undo2 className="h-3 w-3" />
                      </Button>
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="ml-auto h-4 w-4 p-0 opacity-50 hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNewEndDate(undefined);
                        }}
                      >
                        <Undo2 className="h-3 w-3" />
                      </Button>
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
            <div className="flex items-center gap-2">
              <Checkbox
                checked={archived}
                onCheckedChange={handleToggleArchive}
                disabled={isLoading}
              />
              <Label>Mark as done</Label>
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
                onClick={() => onOpenChange?.(false)}
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
