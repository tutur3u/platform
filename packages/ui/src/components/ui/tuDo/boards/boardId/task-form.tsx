import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { Button } from '@tuturuuu/ui/button';
import { Calendar } from '@tuturuuu/ui/calendar';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import {
  Calendar as CalendarIcon,
  Clock,
  Flag,
  Plus,
  Sparkles,
  Users,
  X,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Textarea } from '@tuturuuu/ui/textarea';
import { TaskTagInput } from '@tuturuuu/ui/tuDo/shared/task-tag-input';
import { cn } from '@tuturuuu/utils/format';
import { createTask } from '@tuturuuu/utils/task-helper';
import { format } from 'date-fns';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Props {
  listId: string;
  onTaskCreated: () => void;
}

export function TaskForm({ listId, onTaskCreated }: Props) {
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority | null>(null);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [isPersonal, setIsPersonal] = useState(false);

  const params = useParams();
  const wsId = params.wsId as string;

  // Fetch workspace members for quick assign
  const { data: members = [] } = useQuery({
    queryKey: ['workspace-members-quick-assign', wsId],
    queryFn: async () => {
      const response = await fetch(`/api/workspaces/${wsId}/members`);
      if (!response.ok) throw new Error('Failed to fetch members');
      const { members: fetchedMembers } = await response.json();
      return fetchedMembers.slice(0, 5); // Show first 5 members for quick assign
    },
    enabled: !!wsId && isAdding,
  });

  useEffect(() => {
    const checkIsPersonal = async () => {
      if (wsId === 'personal') {
        setIsPersonal(true);
      } else {
        setIsPersonal(false);
      }
    };
    checkIsPersonal();
  }, [wsId]);

  const handleReset = () => {
    setName('');
    setDescription('');
    setPriority(null);
    setStartDate(undefined);
    setEndDate(undefined);
    setSelectedAssignees([]);
    setTags([]);
    setIsExpanded(false);
    setIsAdding(false);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      const supabase = createClient();

      // Create the task data
      const taskData: {
        name: string;
        description?: string;
        priority?: TaskPriority;
        start_date?: string;
        end_date?: string;
        tags?: string[];
      } = {
        name: name.trim(),
        description: description.trim() || undefined,
        priority: priority ?? undefined,
        start_date: startDate?.toISOString(),
        end_date: endDate?.toISOString(),
      };

      if (tags?.filter((tag) => tag && tag.trim() !== '').length > 0) {
        taskData.tags = tags.filter((tag) => tag && tag.trim() !== '');
      }

      const newTask = await createTask(supabase, listId, taskData);

      // Add assignees if any selected
      if (isPersonal) {
        await supabase.from('task_assignees').insert({
          task_id: newTask.id,
          user_id: members[0].id,
        });
      }

      if (selectedAssignees.length > 0) {
        await Promise.all(
          selectedAssignees.map(async (userId) => {
            await supabase.from('task_assignees').insert({
              task_id: newTask.id,
              user_id: userId,
            });
          })
        );
      }

      handleReset();
      onTaskCreated();
    } catch (error) {
      console.error('Error creating task:', error);

      // Enhanced error handling with better error messages
      let errorMessage = 'Failed to create task';

      if (error instanceof Error) {
        errorMessage = error.message;
        console.error('Error details:', error.message);
      } else if (typeof error === 'object' && error !== null) {
        // Handle Supabase errors
        const supabaseError = error as {
          message?: string;
          details?: string;
          hint?: string;
          code?: string;
        };
        if (supabaseError.message) {
          errorMessage = supabaseError.message;
        } else if (supabaseError.details) {
          errorMessage = supabaseError.details;
        } else if (supabaseError.hint) {
          errorMessage = supabaseError.hint;
        } else if (supabaseError.code) {
          errorMessage = `Database error (${supabaseError.code}): ${supabaseError.message || 'Unknown database error'}`;
        }
      }

      // Show user-friendly error message
      toast({
        title: 'Error creating task',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleQuickAssign = (memberId: string) => {
    setSelectedAssignees((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
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

  if (!isAdding) {
    return (
      <Button
        variant="ghost"
        className={cn(
          'flex h-auto w-full items-center justify-start gap-2 p-3',
          'text-gray-600 dark:text-gray-400',
          'hover:text-gray-800 dark:hover:text-gray-200',
          'hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100',
          'dark:hover:from-gray-900 dark:hover:to-gray-800',
          'rounded-lg border border-gray-300 border-dashed dark:border-gray-700',
          'hover:border-gray-400 dark:hover:border-gray-600',
          'transition-all duration-200'
        )}
        onClick={() => setIsAdding(true)}
      >
        <Plus className="h-4 w-4" />
        Add new task
      </Button>
    );
  }

  return (
    <Card className="border-2 border-dashed">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Create New Task</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleReset}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
        <CardDescription className="text-xs">
          Add a new task with optional details and assignments
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Task Name */}
          <div className="space-y-2">
            <Input
              placeholder="Task name (required)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Quick Priority Selection */}
          <div className="space-y-2">
            <Label className="font-medium text-xs">Priority</Label>
            <div className="flex flex-wrap gap-2">
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
                    'h-8 px-3 text-xs transition-all duration-200',
                    priority === value && getPriorityColor(value)
                  )}
                  onClick={() => setPriority(value as TaskPriority)}
                >
                  {Icon && <Icon className="mr-1 h-3 w-3" />}
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Quick Assignee Selection */}
          {members.length > 0 && !isPersonal && (
            <div className="space-y-2">
              <Label className="font-medium text-xs">Quick Assign</Label>
              <div className="flex flex-wrap gap-2">
                {members.map(
                  (member: {
                    id: string;
                    display_name?: string;
                    email?: string;
                  }) => (
                    <Button
                      key={member.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        'h-8 px-3 text-xs transition-all duration-200',
                        selectedAssignees.includes(member.id) &&
                          'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300'
                      )}
                      onClick={() => handleQuickAssign(member.id)}
                    >
                      <Users className="mr-1 h-3 w-3" />
                      {member.display_name ||
                        member.email?.split('@')[0] ||
                        'User'}
                    </Button>
                  )
                )}
              </div>
            </div>
          )}

          {/* Advanced Options Toggle */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-gray-600 text-xs dark:text-gray-400"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Hide' : 'Show'} advanced options
          </Button>

          {/* Advanced Options */}
          {isExpanded && (
            <div className="space-y-4 border-t">
              {/* Description */}
              <div className="space-y-2">
                <Label className="font-medium text-xs">Description</Label>
                <Textarea
                  placeholder="Add a description..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[60px] text-xs"
                />
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <Label className="font-medium text-xs">Tags</Label>
                <TaskTagInput
                  value={tags}
                  onChange={setTags}
                  boardId={params.boardId as string}
                  placeholder="Add tags..."
                  maxTags={10}
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                {/* Start Date */}
                <div className="space-y-2">
                  <Label className="font-medium text-xs">Start Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'h-8 justify-start text-left font-normal text-xs',
                          !startDate && 'text-muted-foreground'
                        )}
                      >
                        <Clock className="mr-2 h-3 w-3" />
                        {startDate ? format(startDate, 'MMM dd') : 'Start date'}
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
                  <Label className="font-medium text-xs">Due Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'h-8 justify-start text-left font-normal text-xs',
                          !endDate && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-3 w-3" />
                        {endDate ? format(endDate, 'MMM dd') : 'Due date'}
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
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2">
            <Button
              type="submit"
              size="sm"
              disabled={!name.trim() || isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? (
                <>
                  <div className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-3 w-3" />
                  Create Task
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
