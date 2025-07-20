'use client';

import { TaskTagInput } from './task-tag-input';
import { updateTask } from '@/lib/task-helper';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task, TaskList } from '@tuturuuu/types/primitives/TaskBoard';
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
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  Calendar as CalendarIcon,
  Clock,
  Flag,
  Loader2,
  Users,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface TaskEditDialogProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
  availableLists?: TaskList[];
}

export function TaskEditDialog({
  task,
  isOpen,
  onClose,
  onUpdate,
  availableLists: propAvailableLists,
}: TaskEditDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState(task.name);
  const [description, setDescription] = useState(task.description || '');
  const [priority, setPriority] = useState<string>(
    task.priority?.toString() || '0'
  );
  const [startDate, setStartDate] = useState<Date | undefined>(
    task.start_date ? new Date(task.start_date) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    task.end_date ? new Date(task.end_date) : undefined
  );
  const [tags, setTags] = useState<string[]>(task.tags || []);
  const [selectedListId, setSelectedListId] = useState<string>(task.list_id);

  const params = useParams();
  const boardId = params.boardId as string;

  // Fetch available task lists for the board (only if not provided as prop)
  const { data: availableLists = [] } = useQuery({
    queryKey: ['task-lists', boardId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('task_lists')
        .select('*')
        .eq('board_id', boardId)
        .eq('deleted', false)
        .order('position')
        .order('created_at');

      if (error) throw error;
      return data as TaskList[];
    },
    enabled: !!boardId && isOpen && !propAvailableLists,
    initialData: propAvailableLists,
  });

  // Reset form when task changes
  useEffect(() => {
    if (task) {
      setName(task.name);
      setDescription(task.description || '');
      setPriority(task.priority?.toString() || '0');
      setStartDate(task.start_date ? new Date(task.start_date) : undefined);
      setEndDate(task.end_date ? new Date(task.end_date) : undefined);
      setTags(task.tags || []);
      setSelectedListId(task.list_id);
    }
  }, [task]);

  const handleSave = async () => {
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      const supabase = createClient();

      // Prepare task updates
      const taskUpdates: Partial<Task> = {
        name: name.trim(),
        description: description.trim() || undefined,
        priority: priority === '0' ? undefined : parseInt(priority),
        start_date: startDate?.toISOString(),
        end_date: endDate?.toISOString(),
        list_id: selectedListId,
      };

      // Only add tags if we have them
      if (tags.length > 0) {
        taskUpdates.tags = tags;
      }

      await updateTask(supabase, task.id, taskUpdates);

      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error updating task:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      onClose();
    }
  };

  const getPriorityColor = (p: string) => {
    switch (p) {
      case '1':
        return 'border-red-500 bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950 dark:text-red-300';
      case '2':
        return 'border-yellow-500 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-950 dark:text-yellow-300';
      case '3':
        return 'border-green-500 bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-950 dark:text-green-300';
      default:
        return 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
          <DialogDescription>
            Update task details, tags, and assignments.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Task Name */}
          <div className="space-y-2">
            <Label htmlFor="task-name">Task Name</Label>
            <Input
              id="task-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter task name"
            />
          </div>

          {/* Priority Selection */}
          <div className="space-y-2">
            <Label>Priority</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: '0', label: 'None', icon: null },
                { value: '1', label: 'Urgent', icon: Flag },
                { value: '2', label: 'High', icon: Flag },
                { value: '3', label: 'Medium', icon: Flag },
                { value: '4', label: 'Low', icon: Flag },
              ].map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-8 px-3 text-xs transition-all duration-200',
                    priority === value && getPriorityColor(value)
                  )}
                  onClick={() => setPriority(value)}
                >
                  {Icon && <Icon className="mr-1 h-3 w-3" />}
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags</Label>
            <TaskTagInput
              value={tags}
              onChange={setTags}
              boardId={boardId}
              placeholder="Add tags..."
              maxTags={10}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description..."
              className="min-h-[80px]"
            />
          </div>

          {/* List Selection */}
          <div className="space-y-2">
            <Label>Move to List</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  {availableLists.find((list) => list.id === selectedListId)
                    ?.name || 'Select list'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-full">
                {availableLists.map((list) => (
                  <DropdownMenuItem
                    key={list.id}
                    onClick={() => setSelectedListId(list.id)}
                    className={cn(
                      'cursor-pointer',
                      selectedListId === list.id && 'bg-accent'
                    )}
                  >
                    {list.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            {/* Start Date */}
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !startDate && 'text-muted-foreground'
                    )}
                  >
                    <Clock className="mr-2 h-4 w-4" />
                    {startDate
                      ? format(startDate, 'MMM dd, yyyy')
                      : 'Start date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* End Date */}
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !endDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, 'MMM dd, yyyy') : 'Due date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Current Assignees Display */}
          {task.assignees && task.assignees.length > 0 && (
            <div className="space-y-2">
              <Label>Current Assignees</Label>
              <div className="flex flex-wrap gap-2">
                {task.assignees.map((assignee) => (
                  <div
                    key={assignee.id}
                    className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm"
                  >
                    <Users className="h-3 w-3" />
                    {assignee.display_name ||
                      assignee.email?.split('@')[0] ||
                      'User'}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
