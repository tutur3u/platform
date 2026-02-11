'use client';
import { FileEdit, Flag, Plus, Sparkles, Users, X } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import { useCalendarPreferences } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { useWorkspaceMembers } from '@tuturuuu/ui/hooks/use-workspace-members';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { createTask } from '@tuturuuu/utils/task-helper';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useBoardBroadcast } from '../../shared/board-broadcast-context';
import { TaskEstimationPicker } from '../../shared/task-estimation-picker';
import { TaskLabelSelector } from '../../shared/task-label-selector';

interface UserTaskSettings {
  task_auto_assign_to_self: boolean;
}

export interface DraftData {
  name: string;
  description?: string;
  priority?: TaskPriority | null;
  start_date?: string;
  end_date?: string;
  estimation_points?: number | null;
  label_ids?: string[];
  assignee_ids?: string[];
}

interface Props {
  listId: string;
  onTaskCreated: () => void;
  userTaskSettings?: UserTaskSettings;
  currentUserId?: string;
  draftModeEnabled?: boolean;
  onSaveAsDraft?: (data: DraftData) => Promise<void>;
}

export function TaskForm({
  listId,
  onTaskCreated,
  userTaskSettings,
  currentUserId,
  draftModeEnabled,
  onSaveAsDraft,
}: Props) {
  const broadcast = useBoardBroadcast();
  const [isAdding, setIsAdding] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority | null>(null);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [isPersonal, setIsPersonal] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState<any[]>([]);
  const [estimationPoints, setEstimationPoints] = useState<number | null>(null);

  const params = useParams();
  const wsId = params.wsId as string;
  const { weekStartsOn, timezone, timeFormat } = useCalendarPreferences();

  // Fetch workspace members for quick assign
  const { data: allMembers = [] } = useWorkspaceMembers(wsId, {
    enabled: !!wsId && isAdding,
  });
  const members = allMembers.slice(0, 5); // Show first 5 members for quick assign

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
    setSelectedLabels([]);
    setEstimationPoints(null);
    setIsExpanded(false);
    setIsAdding(false);
  };

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    // Draft mode: save as draft instead of creating a task
    if (draftModeEnabled && onSaveAsDraft) {
      setIsSubmitting(true);
      try {
        await onSaveAsDraft({
          name: name.trim(),
          description: description.trim() || undefined,
          priority: priority,
          start_date: startDate?.toISOString(),
          end_date: endDate?.toISOString(),
          estimation_points: estimationPoints,
          label_ids: selectedLabels.map((l: { id: string }) => l.id),
          assignee_ids: selectedAssignees,
        });
        handleReset();
        onTaskCreated();
      } catch (error) {
        console.error('Error saving draft:', error);
        toast.error('Failed to save draft');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

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
        estimation_points?: number | null;
      } = {
        name: name.trim(),
        description: description.trim(),
        priority: priority ?? undefined,
        start_date: startDate?.toISOString(),
        end_date: endDate?.toISOString(),
        estimation_points: estimationPoints,
      };

      const newTask = await createTask(supabase, listId, taskData);

      // Determine final assignees
      let finalAssignees = [...selectedAssignees];

      // Add assignees if any selected
      if (isPersonal && members[0]?.id) {
        await supabase.from('task_assignees').insert({
          task_id: newTask.id,
          user_id: members[0].id,
        });
      } else if (finalAssignees.length === 0) {
        // Auto-assign to self if enabled and no assignees selected
        if (
          userTaskSettings?.task_auto_assign_to_self &&
          currentUserId &&
          !isPersonal
        ) {
          finalAssignees = [currentUserId];
        }
      }

      // Add assignees one by one to ensure triggers fire for each
      if (finalAssignees.length > 0) {
        for (const userId of finalAssignees) {
          const { error } = await supabase.from('task_assignees').insert({
            task_id: newTask.id,
            user_id: userId,
          });
          if (error) {
            console.error(`Failed to add assignee ${userId}:`, error);
          }
        }
      }

      // Add label assignments one by one to ensure triggers fire for each
      if (selectedLabels.length > 0) {
        for (const label of selectedLabels) {
          const { error } = await supabase.from('task_labels').insert({
            task_id: newTask.id,
            label_id: label.id,
          });
          if (error) {
            console.error(`Failed to add label ${label.id}:`, error);
          }
        }
      }

      // Broadcast new task to other clients
      broadcast?.('task:upsert', { task: newTask });
      if (finalAssignees.length > 0 || selectedLabels.length > 0) {
        broadcast?.('task:relations-changed', { taskId: newTask.id });
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
      toast.error(errorMessage || 'Error creating task');
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
        return 'border-dynamic-red/70 bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/15';
      case 'high':
        return 'border-dynamic-orange/70 bg-dynamic-orange/10 text-dynamic-orange hover:bg-dynamic-orange/15';
      case 'normal':
        return 'border-dynamic-yellow/70 bg-dynamic-yellow/10 text-dynamic-yellow hover:bg-dynamic-yellow/15';
      case 'low':
        return 'border-dynamic-blue/70 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/15';
      default:
        return 'border-dynamic-gray/60 bg-dynamic-surface/5 text-foreground hover:bg-dynamic-surface/10';
    }
  };

  if (!isAdding) {
    return (
      <Button
        variant="ghost"
        className={cn(
          'flex h-auto w-full items-center justify-start gap-2 p-3',
          'text-muted-foreground hover:text-foreground',
          'hover:bg-muted/40',
          'rounded-lg border border-dynamic-gray/40 border-dashed',
          'hover:border-dynamic-gray/60',
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
                          'border-dynamic-blue/40 bg-dynamic-blue/10 text-dynamic-blue'
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
            className="h-8 px-3 text-muted-foreground text-xs"
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
                  className="min-h-15 text-xs"
                />
              </div>

              {/* Labels */}
              <div className="space-y-2">
                <Label className="font-medium text-xs">Labels</Label>
                <TaskLabelSelector
                  wsId={wsId}
                  selectedLabels={selectedLabels}
                  onLabelsChange={setSelectedLabels}
                />
              </div>

              {/* Estimation */}
              <div className="space-y-2">
                <TaskEstimationPicker
                  wsId={wsId}
                  boardId={params.boardId as string}
                  selectedPoints={estimationPoints}
                  onPointsChange={setEstimationPoints}
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                {/* Start Date */}
                <div className="space-y-2">
                  <Label className="font-medium text-xs">Start Date</Label>
                  <DateTimePicker
                    date={startDate}
                    setDate={setStartDate}
                    showTimeSelect={true}
                    preferences={{ weekStartsOn, timezone, timeFormat }}
                  />
                </div>

                {/* End Date */}
                <div className="space-y-2">
                  <Label className="font-medium text-xs">Due Date</Label>
                  <DateTimePicker
                    date={endDate}
                    setDate={handleEndDateChange}
                    showTimeSelect={true}
                    preferences={{ weekStartsOn, timezone, timeFormat }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Draft mode indicator */}
          {draftModeEnabled && (
            <Badge
              variant="outline"
              className="border-dynamic-orange/40 bg-dynamic-orange/10 text-dynamic-orange text-xs"
            >
              <FileEdit className="mr-1 h-3 w-3" />
              Draft mode
            </Badge>
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
                  {draftModeEnabled ? 'Saving...' : 'Creating...'}
                </>
              ) : draftModeEnabled ? (
                <>
                  <FileEdit className="mr-2 h-3 w-3" />
                  Save as Draft
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
