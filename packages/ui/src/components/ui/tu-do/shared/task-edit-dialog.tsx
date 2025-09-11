'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/react';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Button } from '@tuturuuu/ui/button';
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
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { Clock, Flag, Loader2, Users } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { cn } from '@tuturuuu/utils/format';
import {
  invalidateTaskCaches,
  useUpdateTask,
} from '@tuturuuu/utils/task-helper';
import { addDays } from 'date-fns';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { TaskTagInput } from './task-tag-input';

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
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState(task.name);
  const [description, setDescription] = useState<JSONContent | null>(() => {
    // Try to parse existing description as JSON, fallback to creating simple text content
    if (task.description) {
      try {
        return JSON.parse(task.description);
      } catch {
        // If it's not valid JSON, treat it as plain text and convert to JSONContent
        return {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: task.description }],
            },
          ],
        };
      }
    }
    return null;
  });
  const [priority, setPriority] = useState<TaskPriority | null>(
    task.priority || null
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
  const queryClient = useQueryClient();

  // Use the React Query mutation hook for updating tasks
  const updateTaskMutation = useUpdateTask(boardId);

  // Fetch available task lists for the board (only if not provided as prop)
  const { data: availableLists = [] } = useQuery({
    queryKey: ['task_lists', boardId],
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

  // Helper function to convert description to JSONContent
  const parseDescription = useCallback((desc?: string): JSONContent | null => {
    if (!desc) return null;

    try {
      return JSON.parse(desc);
    } catch {
      // If it's not valid JSON, treat it as plain text and convert to JSONContent
      return {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: desc }],
          },
        ],
      };
    }
  }, []);

  // Reset form when task changes
  useEffect(() => {
    if (task) {
      setName(task.name);
      setDescription(parseDescription(task.description));
      setPriority(task.priority || null);
      setStartDate(task.start_date ? new Date(task.start_date) : undefined);
      setEndDate(task.end_date ? new Date(task.end_date) : undefined);
      setTags(task.tags || []);
      setSelectedListId(task.list_id);
    }
  }, [task, parseDescription]);

  // Helper function to handle end date with default time
  const handleEndDateChange = (date: Date | undefined) => {
    if (date) {
      const selectedDate = new Date(date);

      // If the selected time is 00:00:00 (midnight), it likely means the user
      // only selected a date without specifying a time, so default to 11:59 PM
      if (
        selectedDate.getHours() === 0 &&
        selectedDate.getMinutes() === 0 &&
        selectedDate.getSeconds() === 0 &&
        selectedDate.getMilliseconds() === 0
      ) {
        selectedDate.setHours(23, 59, 59, 999);
      }

      setEndDate(selectedDate);
    } else {
      setEndDate(undefined);
    }
  };

  // Handle quick due date assignment with auto-close
  const handleQuickDueDate = async (days: number | null) => {
    let newDate: Date | undefined;

    if (days !== null) {
      const targetDate = addDays(new Date(), days);
      // Set time to 11:59 PM for quick date selections
      targetDate.setHours(23, 59, 59, 999);
      newDate = targetDate;
    }

    setEndDate(newDate);

    // Auto-save and close dialog
    setIsLoading(true);

    const taskUpdates: Partial<Task> = {
      end_date: newDate?.toISOString(),
    };

    updateTaskMutation.mutate(
      {
        taskId: task.id,
        updates: taskUpdates,
      },
      {
        onSuccess: () => {
          invalidateTaskCaches(queryClient, boardId);
          toast({
            title: 'Due date updated',
            description: newDate
              ? `Due date set to ${newDate.toLocaleDateString()}`
              : 'Due date removed',
          });
          onUpdate();
          onClose();
        },
        onError: (error) => {
          console.error('Error updating due date:', error);
          toast({
            title: 'Error updating due date',
            description: error.message || 'Please try again later',
            variant: 'destructive',
          });
        },
        onSettled: () => {
          setIsLoading(false);
        },
      }
    );
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    setIsLoading(true);

    // Convert JSONContent to string for storage
    const descriptionString = description
      ? JSON.stringify(description)
      : undefined;

    // Prepare task updates
    const taskUpdates: Partial<Task> = {
      name: name.trim(),
      description: descriptionString,
      priority: priority,
      start_date: startDate?.toISOString(),
      end_date: endDate?.toISOString(),
      list_id: selectedListId,
    };

    // Always include tags to allow clearing
    taskUpdates.tags = tags.filter((tag) => tag && tag.trim() !== '');
    // Ensure tags is always an array, never undefined
    if (taskUpdates.tags.length === 0) {
      taskUpdates.tags = [];
    }

    updateTaskMutation.mutate(
      {
        taskId: task.id,
        updates: taskUpdates,
      },
      {
        onSuccess: () => {
          // Force cache invalidation
          invalidateTaskCaches(queryClient, boardId);

          toast({
            title: 'Task updated',
            description: 'The task has been successfully updated.',
          });
          onUpdate();
          onClose();
        },
        onError: (error) => {
          console.error('Error updating task:', error);
          toast({
            title: 'Error updating task',
            description: error.message || 'Please try again later',
            variant: 'destructive',
          });
        },
        onSettled: () => {
          setIsLoading(false);
        },
      }
    );
  };

  const handleClose = () => {
    if (!isLoading) {
      onClose();
    }
  };

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'critical':
        return 'border-red-500 bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950 dark:text-red-300';
      case 'high':
        return 'border-yellow-500 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-950 dark:text-yellow-300';
      case 'normal':
        return 'border-green-500 bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-950 dark:text-green-300';
      case 'low':
        return 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300';
      default:
        return 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-[650px]">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Edit Task</DialogTitle>
          <DialogDescription>
            Update task details, tags, and assignments.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <div className="space-y-4">
            {/* Task Name */}
            <div className="space-y-2">
              <Label htmlFor="task-name">Task Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter task name"
              />
            </div>

            {/* Task Description */}
            <div className="space-y-2">
              <Label htmlFor="task-description">Description</Label>
              <div className="min-h-[120px]">
                <RichTextEditor
                  content={description}
                  onChange={setDescription}
                  writePlaceholder="Add task description..."
                  titlePlaceholder="Task details..."
                  className="min-h-[100px]"
                />
              </div>
            </div>

            {/* Priority Selection */}
            <div className="space-y-2">
              <Label>Priority</Label>
              <div
                className="flex flex-wrap gap-2"
                role="radiogroup"
                aria-label="Task priority selection"
              >
                {[
                  { value: 'critical', label: 'Urgent', icon: Flag },
                  { value: 'high', label: 'High', icon: Flag },
                  { value: 'normal', label: 'Medium', icon: Flag },
                  { value: 'low', label: 'Low', icon: Flag },
                ].map(({ value, label, icon: Icon }) => (
                  <Button
                    key={value}
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      'h-7 px-2 text-xs transition-all duration-200',
                      priority === value && getPriorityColor(value)
                    )}
                    onClick={() => setPriority(value as TaskPriority)}
                    role="radio"
                    aria-checked={priority === value}
                    aria-label={`Priority: ${label}`}
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

            {/* Quick Due Date Assignment */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Quick Due Date Assignment
              </Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickDueDate(0)}
                  disabled={isLoading}
                  className="h-7 px-2 text-xs"
                >
                  Today
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickDueDate(1)}
                  disabled={isLoading}
                  className="h-7 px-2 text-xs"
                >
                  Tomorrow
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickDueDate(3)}
                  disabled={isLoading}
                  className="h-7 px-2 text-xs"
                >
                  3 days
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickDueDate(7)}
                  disabled={isLoading}
                  className="h-7 px-2 text-xs"
                >
                  Next week
                </Button>
                {task.end_date && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickDueDate(null)}
                    disabled={isLoading}
                    className="h-7 px-2 text-muted-foreground text-xs"
                  >
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                Click to quickly set due date and close dialog
              </p>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Start Date */}
              <div className="space-y-2">
                <Label>Start Date</Label>
                <DateTimePicker
                  date={startDate}
                  setDate={setStartDate}
                  showTimeSelect={true}
                />
              </div>

              {/* End Date */}
              <div className="space-y-2">
                <Label>Due Date</Label>
                <DateTimePicker
                  date={endDate}
                  setDate={handleEndDateChange}
                  showTimeSelect={true}
                />
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
        </div>

        <DialogFooter className="border-t px-6 py-4">
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
