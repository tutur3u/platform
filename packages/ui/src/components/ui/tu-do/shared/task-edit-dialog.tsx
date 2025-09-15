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
import { Clock, Flag, Loader2, Tag, Timer, Users, X } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { cn } from '@tuturuuu/utils/format';
import {
  invalidateTaskCaches,
  useUpdateTask,
} from '@tuturuuu/utils/task-helper';
import { addDays } from 'date-fns';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  buildEstimationIndices,
  mapEstimationPoints,
} from './estimation-mapping';

interface TaskEditDialogProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
  availableLists?: TaskList[];
}

// Helper types
interface WorkspaceTaskLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

interface BoardEstimationConfig {
  estimation_type?: string | null;
  extended_estimation?: boolean;
  allow_zero_estimates?: boolean;
  count_unestimated_issues?: boolean;
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
  const [selectedListId, setSelectedListId] = useState<string>(task.list_id);
  const [estimationPoints, setEstimationPoints] = useState<
    number | null | undefined
  >(task.estimation_points ?? null);
  const [availableLabels, setAvailableLabels] = useState<WorkspaceTaskLabel[]>(
    []
  );
  const [selectedLabels, setSelectedLabels] = useState<WorkspaceTaskLabel[]>(
    task.labels || []
  );
  const [boardConfig, setBoardConfig] = useState<BoardEstimationConfig | null>(
    null
  );
  const [labelsLoading, setLabelsLoading] = useState(false);
  const [estimationSaving, setEstimationSaving] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('gray');
  const [creatingLabel, setCreatingLabel] = useState(false);

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
    setName(task.name);
    setDescription(parseDescription(task.description));
    setPriority(task.priority || null);
    setStartDate(task.start_date ? new Date(task.start_date) : undefined);
    setEndDate(task.end_date ? new Date(task.end_date) : undefined);
    setSelectedListId(task.list_id);
    setEstimationPoints(task.estimation_points ?? null);
    setSelectedLabels(task.labels || []);
  }, [task, parseDescription]);

  const fetchLabels = useCallback(async (wsId: string) => {
    try {
      setLabelsLoading(true);
      const supabase = createClient();
      const { data: labels, error: labelsErr } = await supabase
        .from('workspace_task_labels')
        .select('id,name,color,created_at')
        .eq('ws_id', wsId)
        .order('created_at');
      if (!labelsErr && labels)
        setAvailableLabels(
          (labels as any).sort((a: any, b: any) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
          )
        );
    } catch (e) {
      console.error('Failed fetching labels', e);
    } finally {
      setLabelsLoading(false);
    }
  }, []);

  // Fetch board estimation config & labels on open
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        const supabase = createClient();
        const { data: board, error: boardErr } = await supabase
          .from('workspace_boards')
          .select(
            'estimation_type, extended_estimation, allow_zero_estimates, count_unestimated_issues, ws_id'
          )
          .eq('id', boardId)
          .single();
        if (boardErr) throw boardErr;
        setBoardConfig(board as any);
        if ((board as any)?.ws_id) await fetchLabels((board as any).ws_id);
      } catch (e) {
        console.error('Failed loading board config or labels', e);
      }
    })();
  }, [isOpen, boardId, fetchLabels]);

  const handleCreateLabel = async () => {
    if (!newLabelName.trim() || !boardConfig) return;
    // Need workspace id from boardConfig; we re-fetch board already, store ws_id inside boardConfig? not persisted previously; fallback fetch if absent
    setCreatingLabel(true);
    try {
      const supabase = createClient();
      // Ensure we have ws_id
      let wsId: string | undefined = (boardConfig as any)?.ws_id;
      if (!wsId) {
        const { data: board } = await supabase
          .from('workspace_boards')
          .select('ws_id')
          .eq('id', boardId)
          .single();
        wsId = (board as any)?.ws_id;
      }
      if (!wsId) throw new Error('Workspace id not found');
      const { data, error } = await supabase
        .from('workspace_task_labels')
        .insert({
          ws_id: wsId,
          name: newLabelName.trim(),
          color: newLabelColor,
        })
        .select('id,name,color,created_at')
        .single();
      if (error) throw error;
      if (data) {
        setAvailableLabels((prev) =>
          [data as any, ...prev].sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
          )
        );
        // auto-select new label (maintain alphabetical order in selection list too)
        setSelectedLabels((prev) =>
          [data as any, ...prev].sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
          )
        );

        // Attempt to link label to this task in DB
        const { error: linkErr } = await supabase
          .from('task_labels')
          .insert({ task_id: task.id, label_id: (data as any).id });
        if (linkErr) {
          // Rollback local selection if link fails
          setSelectedLabels((prev) =>
            prev.filter((l) => l.id !== (data as any).id)
          );
          toast({
            title: 'Label created (not linked)',
            description: 'Label saved but could not be attached to task.',
            variant: 'destructive',
          });
        } else {
          // Invalidate caches so parent task list reflects new label
          invalidateTaskCaches(queryClient, boardId);
          onUpdate();
          // Dispatch global event so other open components can refresh
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('workspace-label-created', {
                detail: { wsId, label: data },
              })
            );
          }
          toast({
            title: 'Label created & linked',
            description: 'New label added and attached to this task.',
          });
        }
        setNewLabelName('');
      }
    } catch (e: any) {
      toast({
        title: 'Label creation failed',
        description: e.message || 'Unable to create label',
        variant: 'destructive',
      });
    } finally {
      setCreatingLabel(false);
    }
  };

  // End date change helper (preserve 23:59 default if only date picked)
  const handleEndDateChange = (date: Date | undefined) => {
    if (date) {
      const selectedDate = new Date(date);
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

  // Quick due date setter (today, tomorrow, etc.)
  const handleQuickDueDate = (days: number | null) => {
    let newDate: Date | undefined;
    if (days !== null) {
      const target = addDays(new Date(), days);
      target.setHours(23, 59, 59, 999);
      newDate = target;
    }
    setEndDate(newDate);
    setIsLoading(true);
    const taskUpdates: Partial<Task> = { end_date: newDate?.toISOString() };
    updateTaskMutation.mutate(
      { taskId: task.id, updates: taskUpdates },
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
        onError: (error: any) => {
          console.error('Error updating due date:', error);
          toast({
            title: 'Error updating due date',
            description: error.message || 'Please try again later',
            variant: 'destructive',
          });
        },
        onSettled: () => setIsLoading(false),
      }
    );
  };

  // Handle estimation save (optimistic local update + API call)
  const updateEstimation = async (points: number | null) => {
    if (points === estimationPoints) return;
    setEstimationPoints(points);
    setEstimationSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('tasks')
        .update({ estimation_points: points })
        .eq('id', task.id);
      if (error) throw error;
      invalidateTaskCaches(queryClient, boardId);
    } catch (e: any) {
      console.error('Failed updating estimation', e);
      toast({
        title: 'Failed to update estimation',
        description: e.message || 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setEstimationSaving(false);
    }
  };

  // Label selection handlers
  const toggleLabel = async (label: WorkspaceTaskLabel) => {
    const exists = selectedLabels.some((l) => l.id === label.id);
    const supabase = createClient();
    try {
      if (exists) {
        // remove
        const { error } = await supabase
          .from('task_labels')
          .delete()
          .eq('task_id', task.id)
          .eq('label_id', label.id);
        if (error) throw error;
        setSelectedLabels((prev) => prev.filter((l) => l.id !== label.id));
      } else {
        const { error } = await supabase
          .from('task_labels')
          .insert({ task_id: task.id, label_id: label.id });
        if (error) throw error;
        setSelectedLabels((prev) =>
          [label, ...prev].sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
          )
        );
      }
      invalidateTaskCaches(queryClient, boardId);
    } catch (e: any) {
      toast({
        title: 'Label update failed',
        description: e.message || 'Unable to update labels',
        variant: 'destructive',
      });
    }
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

  const getLabelColorClasses = (color: string) => {
    const map: Record<string, string> = {
      red: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
      orange:
        'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
      yellow:
        'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800',
      green:
        'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
      blue: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
      indigo:
        'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800',
      purple:
        'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
      pink: 'bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-800',
      gray: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-900/30 dark:text-gray-300 dark:border-gray-800',
    };
    return map[color] || map.gray;
  };

  // Build estimation indices via shared util
  const estimationIndices: number[] = boardConfig?.estimation_type
    ? buildEstimationIndices({
        extended: boardConfig?.extended_estimation,
        allowZero: boardConfig?.allow_zero_estimates,
      })
    : [];

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-[720px]">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Edit Task</DialogTitle>
          <DialogDescription>
            Update task details, estimation and labels.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <div className="space-y-6">
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

            {/* Estimation Section */}
            {boardConfig?.estimation_type && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Timer className="h-4 w-4" /> Estimation
                </Label>
                <div className="flex flex-wrap gap-2">
                  {estimationIndices.map((idx) => {
                    const label = mapEstimationPoints(
                      idx,
                      boardConfig.estimation_type
                    );
                    return (
                      <Button
                        key={idx}
                        type="button"
                        variant={
                          idx === estimationPoints ? 'default' : 'outline'
                        }
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => updateEstimation(idx)}
                        disabled={estimationSaving}
                      >
                        {label}
                      </Button>
                    );
                  })}
                  <Button
                    type="button"
                    variant={estimationPoints == null ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => updateEstimation(null)}
                    disabled={estimationSaving}
                  >
                    None
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  {boardConfig?.estimation_type} estimation. Max points{' '}
                  {boardConfig?.extended_estimation ? 8 : 5}.{' '}
                  {!boardConfig?.allow_zero_estimates && 'Zero disabled.'}
                </p>
              </div>
            )}

            {/* Labels Section */}
            <div className="space-y-2">
              <Label className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Tag className="h-4 w-4" /> Labels
                </span>
                {boardConfig && (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="h-6 px-2 text-[10px]"
                    onClick={() =>
                      (boardConfig as any)?.ws_id &&
                      fetchLabels((boardConfig as any).ws_id)
                    }
                    disabled={labelsLoading}
                  >
                    {labelsLoading ? 'Refreshing…' : 'Refresh'}
                  </Button>
                )}
              </Label>
              {boardConfig && (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="New label name"
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    className="h-8"
                  />
                  <select
                    className="h-8 rounded border bg-background px-2 text-xs"
                    value={newLabelColor}
                    onChange={(e) => setNewLabelColor(e.target.value)}
                  >
                    {[
                      'red',
                      'orange',
                      'yellow',
                      'green',
                      'blue',
                      'indigo',
                      'purple',
                      'pink',
                      'gray',
                    ].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={handleCreateLabel}
                    disabled={creatingLabel || !newLabelName.trim()}
                  >
                    {creatingLabel ? 'Creating…' : 'Add'}
                  </Button>
                </div>
              )}
              {labelsLoading ? (
                <div className="text-muted-foreground text-xs">
                  Loading labels...
                </div>
              ) : availableLabels.length === 0 ? (
                <div className="text-muted-foreground text-xs">
                  No labels yet.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableLabels.map((label) => {
                    const active = selectedLabels.some(
                      (l) => l.id === label.id
                    );
                    return (
                      <Button
                        key={label.id}
                        type="button"
                        variant={active ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleLabel(label)}
                        className={cn(
                          'h-7 border px-2 text-xs',
                          !active && 'bg-background',
                          active && getLabelColorClasses(label.color)
                        )}
                      >
                        {label.name}
                        {active && <X className="ml-1 h-3 w-3" />}
                      </Button>
                    );
                  })}
                </div>
              )}
              {selectedLabels.length > 0 && (
                <p className="text-muted-foreground text-xs">
                  {selectedLabels.length} label
                  {selectedLabels.length !== 1 && 's'} selected
                </p>
              )}
            </div>

            <Separator />

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
