import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { ColorPicker } from '@tuturuuu/ui/color-picker';
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
  Check,
  CheckCircle2,
  CircleDashed,
  CircleFadingArrowUpIcon,
  CircleSlash,
  Clock,
  Flag,
  horseHead,
  Icon,
  List,
  Loader2,
  MoreHorizontal,
  Move,
  Plus,
  Rabbit,
  Tag,
  Timer,
  Trash2,
  Turtle,
  UserMinus,
  UserStar,
  unicornHead,
  X,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';

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
import { memo, useCallback, useEffect, useState } from 'react';
import { getDescriptionText } from '../../../../../utils/text-helper';
import { AssigneeSelect } from '../../shared/assignee-select';
import {
  buildEstimationIndices,
  mapEstimationPoints,
} from '../../shared/estimation-mapping';
import { TaskEditDialog } from '../../shared/task-edit-dialog';
import { TaskEstimationDisplay } from '../../shared/task-estimation-display';
import { TaskLabelsDisplay } from '../../shared/task-labels-display';
import { TaskActions } from './task-actions';

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

  const descriptionText = getDescriptionText(task.description);
  // Ensure deterministic ordering of labels (case-insensitive alphabetical)
  const sortedLabels = task.labels
    ? [...task.labels].sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      )
    : [];

  return (
    <Card className="pointer-events-none w-full max-w-[350px] scale-105 select-none border-2 border-primary/20 bg-background opacity-95 shadow-xl ring-2 ring-primary/20">
      <div className="flex flex-col gap-2 p-4">
        <div className="truncate font-semibold text-base">{task.name}</div>
        {descriptionText && (
          <div className="line-clamp-1 whitespace-pre-line text-muted-foreground text-sm">
            {descriptionText.replace(/\n/g, ' • ')}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {task.priority && (
            <Badge variant="secondary" className="text-xs">
              {labels[task.priority as keyof typeof labels]}
            </Badge>
          )}
          {/* Labels */}
          {sortedLabels.length > 0 && (
            <TaskLabelsDisplay labels={sortedLabels} size="sm" />
          )}
          {/* Estimation */}
          <TaskEstimationDisplay
            points={task.estimation_points}
            size="sm"
            showIcon={false}
          />
        </div>
      </div>
    </Card>
  );
}

// Memoized full TaskCard
function TaskCardInner({
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
  // Removed isHovered state to reduce re-renders; rely on CSS :hover
  const [menuOpen, setMenuOpen] = useState(false);
  const [customDateDialogOpen, setCustomDateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  // Estimation & labels state
  const [boardConfig, setBoardConfig] = useState<any>(null);
  const [workspaceLabels, setWorkspaceLabels] = useState<any[]>([]);
  const [labelsLoading, setLabelsLoading] = useState(false);
  const [estimationSaving, setEstimationSaving] = useState(false);
  const [labelsSaving, setLabelsSaving] = useState<string | null>(null);
  // New label creation state
  const [newLabelDialogOpen, setNewLabelDialogOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#3b82f6');
  const [creatingLabel, setCreatingLabel] = useState(false);
  // Track initial mount to avoid duplicate fetch storms
  const updateTaskMutation = useUpdateTask(boardId);
  const deleteTaskMutation = useDeleteTask(boardId);

  // Fetch available task lists using React Query (same key as other components)
  const { data: queryAvailableLists = [] } = useQuery({
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
    enabled: !propAvailableLists, // Only fetch if not provided as prop
  });

  // Use prop if provided, otherwise use React Query data
  const availableLists = propAvailableLists || queryAvailableLists;

  // Find the first list with 'done' or 'closed' status
  const getTargetCompletionList = () => {
    const doneList = availableLists.find((list) => list.status === 'done');
    const closedList = availableLists.find((list) => list.status === 'closed');
    return doneList || closedList || null;
  };

  // Find specifically the closed list
  const getTargetClosedList = () => {
    return availableLists.find((list) => list.status === 'closed') || null;
  };

  const targetCompletionList = getTargetCompletionList();
  const targetClosedList = getTargetClosedList();
  const canMoveToCompletion =
    targetCompletionList && targetCompletionList.id !== task.list_id;
  const canMoveToClose =
    targetClosedList && targetClosedList.id !== task.list_id;

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
    // Reduce expensive layout animations for smoother dragging
    animateLayoutChanges: (args) => {
      const { isSorting, wasDragging } = args;
      // Only animate if not actively dragging to keep drag performance snappy
      return isSorting && !wasDragging;
    },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    // Disable transition while actively dragging for perf
    transition: isDragging ? undefined : transition,
    height: 'var(--task-height)',
    willChange: 'transform',
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

  // Shared label fetcher
  const fetchWorkspaceLabels = useCallback(async (wsId: string) => {
    setLabelsLoading(true);
    try {
      const supabase = createClient();
      const { data: labels, error } = await supabase
        .from('workspace_task_labels')
        .select('id, name, color, created_at')
        .eq('ws_id', wsId)
        .order('created_at', { ascending: false });
      if (!error) {
        setWorkspaceLabels(
          (labels || []).sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
          )
        );
      }
    } catch (e) {
      console.error('Failed fetching labels', e);
    } finally {
      setLabelsLoading(false);
    }
  }, []);

  // Initial load + board config
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data: board } = await supabase
          .from('workspace_boards')
          .select(
            'id, estimation_type, extended_estimation, allow_zero_estimates, ws_id'
          )
          .eq('id', boardId)
          .single();
        if (!mounted) return;
        setBoardConfig(board);
        if (board?.ws_id) await fetchWorkspaceLabels(board.ws_id);
      } catch (e) {
        console.error('Failed loading board config or labels', e);
      } finally {
        // no-op
      }
    })();
    return () => {
      mounted = false;
    };
  }, [boardId, fetchWorkspaceLabels]);

  // Listen for global label created events to refresh labels list
  useEffect(() => {
    function handleGlobalLabelCreated(e: any) {
      const wsId = e?.detail?.wsId;
      if (wsId && boardConfig?.ws_id === wsId) {
        // Avoid race: small delay to ensure backend commit
        setTimeout(() => fetchWorkspaceLabels(wsId), 120);
      }
    }
    window.addEventListener(
      'workspace-label-created',
      handleGlobalLabelCreated as EventListener
    );
    return () => {
      window.removeEventListener(
        'workspace-label-created',
        handleGlobalLabelCreated as EventListener
      );
    };
  }, [boardConfig?.ws_id, fetchWorkspaceLabels]);

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

  async function handleCustomDateChange(date: Date | undefined) {
    let newDate: string | null = null;

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

      newDate = selectedDate.toISOString();
    }

    setIsLoading(true);
    setCustomDateDialogOpen(false); // Close immediately when date is selected

    updateTaskMutation.mutate(
      { taskId: task.id, updates: { end_date: newDate } },
      {
        onSuccess: () => {
          toast({
            title: 'Due date updated',
            description: newDate
              ? 'Custom due date set successfully'
              : 'Due date removed',
          });
          onUpdate?.();
        },
        onSettled: () => {
          setIsLoading(false);
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

  async function handleMoveToClose() {
    if (!targetClosedList || !onUpdate) return;

    setIsLoading(true);

    // Use the standard moveTask function to ensure consistent logic
    const supabase = createClient();
    try {
      await moveTask(supabase, task.id, targetClosedList.id);
      toast({
        title: 'Success',
        description: 'Task marked as closed',
      });
      // Manually invalidate queries since we're not using the mutation hook
      onUpdate();
    } catch (error) {
      console.error('Failed to move task to closed:', error);
      toast({
        title: 'Error',
        description: 'Failed to close task. Please try again.',
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

  // Reintroduced: handle quick relative due date changes (was removed during earlier patch)
  async function handleDueDateChange(days: number | null) {
    let newDate: string | null = null;
    if (days !== null) {
      const target = addDays(new Date(), days);
      // Set to end of day for consistent due date semantics
      target.setHours(23, 59, 59, 999);
      newDate = target.toISOString();
    }
    setIsLoading(true);
    updateTaskMutation.mutate(
      { taskId: task.id, updates: { end_date: newDate } },
      {
        onSuccess: () => {
          toast({
            title: 'Due date updated',
            description: newDate
              ? 'Due date set successfully'
              : 'Due date removed',
          });
          onUpdate?.();
        },
        onSettled: () => {
          setIsLoading(false);
        },
      }
    );
  }

  // Reintroduced: priority change handler (lost in earlier patch)
  function handlePriorityChange(newPriority: TaskPriority | null) {
    if (newPriority === task.priority) return; // no-op
    setIsLoading(true);
    updateTaskMutation.mutate(
      { taskId: task.id, updates: { priority: newPriority } },
      {
        onSuccess: () => {
          toast({
            title: 'Priority updated',
            description: newPriority ? 'Priority changed' : 'Priority cleared',
          });
          onUpdate?.();
        },
        onSettled: () => setIsLoading(false),
      }
    );
  }

  // Update estimation points (quick action menu) re-added
  async function updateEstimationPoints(points: number | null) {
    if (points === task.estimation_points) return;
    setEstimationSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('tasks')
        .update({ estimation_points: points })
        .eq('id', task.id);
      if (error) throw error;
      toast({
        title: 'Estimation updated',
        description:
          points == null ? 'Cleared estimation' : `Set to ${points} pts`,
      });
      onUpdate?.();
    } catch (e: any) {
      console.error('Failed to update estimation', e);
      toast({
        title: 'Failed to update estimation',
        description: e.message || 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setEstimationSaving(false);
    }
  }

  // Toggle a label for the task (quick labels submenu)
  async function toggleTaskLabel(labelId: string) {
    setLabelsSaving(labelId);
    const supabase = createClient();
    const active = task.labels?.some((l) => l.id === labelId);
    try {
      if (active) {
        const { error } = await supabase
          .from('task_labels')
          .delete()
          .eq('task_id', task.id)
          .eq('label_id', labelId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('task_labels')
          .insert({ task_id: task.id, label_id: labelId });
        if (error) throw error;
      }
      // Fire refetch
      onUpdate?.();
    } catch (e: any) {
      toast({
        title: 'Label update failed',
        description: e.message || 'Unable to toggle label',
        variant: 'destructive',
      });
    } finally {
      setLabelsSaving(null);
    }
  }

  // Create a new label
  async function createNewLabel() {
    if (!newLabelName.trim() || !boardConfig?.ws_id) return;

    setCreatingLabel(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${boardConfig.ws_id}/labels`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: newLabelName.trim(),
            color: newLabelColor,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to create label');
      }

      const newLabel = await response.json();

      // Add the new label to the workspace labels list (sorted)
      setWorkspaceLabels((prev) =>
        [newLabel, ...prev].sort((a, b) =>
          a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        )
      );

      // Auto-apply the newly created label to this task
      try {
        const supabase = createClient();
        const { error: linkErr } = await supabase
          .from('task_labels')
          .insert({ task_id: task.id, label_id: newLabel.id });
        if (linkErr) {
          toast({
            title: 'Label created (not applied)',
            description:
              'The label was created but could not be attached to the task. Refresh and try manually.',
            variant: 'destructive',
          });
        } else {
          // Trigger parent refetch so task prop includes new label
          onUpdate?.();
        }
      } catch (applyErr: any) {
        console.error('Failed to auto-apply new label', applyErr);
      }

      // Reset form and close dialog
      setNewLabelName('');
      setNewLabelColor('#3b82f6');
      setNewLabelDialogOpen(false);

      toast({
        title: 'Label created & applied',
        description: `"${newLabel.name}" label created and applied to this task`,
      });

      // Dispatch global event so other task cards can refresh
      window.dispatchEvent(
        new CustomEvent('workspace-label-created', {
          detail: { wsId: boardConfig.ws_id, label: newLabel },
        })
      );
    } catch (e: any) {
      toast({
        title: 'Failed to create label',
        description: e.message || 'Unable to create new label',
        variant: 'destructive',
      });
    } finally {
      setCreatingLabel(false);
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
      critical: <Icon iconNode={unicornHead} className="h-3 w-3" />,
      high: <Icon iconNode={horseHead} className="h-3 w-3" />,
      normal: <Rabbit className="h-3 w-3" />,
      low: <Turtle className="h-3 w-3" />,
    };

    return (
      <Badge
        variant="secondary"
        className={cn(
          'p-1 text-xs',
          colors[task.priority as keyof typeof colors]
        )}
      >
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
  // Removed explicit drag handle – entire card is now draggable for better UX.
  // Keep attributes/listeners to spread onto root interactive area.

  // Hide the source card during drag (unless in overlay)
  // Show a lightweight placeholder in original position during drag (improves spatial feedback)
  if (isDragging && !isOverlay) {
    return (
      <div
        className={cn(
          'h-[var(--task-height)] w-full rounded-lg border-2 border-dynamic-blue/40 border-dashed bg-dynamic-blue/5 opacity-60'
        )}
        style={{ height: 'var(--task-height)' }}
        aria-hidden="true"
      />
    );
  }

  return (
    <Card
      data-id={task.id}
      ref={setNodeRef}
      style={style}
      onClick={(e) => onSelect?.(task.id, e)}
      // Spread sortable listeners on full card for whole-card dragging
      {...attributes}
      {...listeners}
      className={cn(
        'group relative touch-none select-none overflow-hidden rounded-lg border-l-4 transition-all',
        'cursor-grab active:cursor-grabbing',
        'cursor-default hover:shadow-md',
        // Task list or priority-based styling
        getCardColorClasses(),
        // Dragging state
        isDragging && 'z-50 scale-[1.02] shadow-xl ring-2 ring-primary/40',
        isOverlay &&
          'scale-105 shadow-2xl ring-2 ring-primary/50 backdrop-blur-sm',
        // Archive state (completed tasks)
        task.archived && 'opacity-70 saturate-75',
        // Overdue state
        isOverdue &&
          !task.archived &&
          'border-dynamic-red/70 bg-dynamic-red/10 ring-1 ring-dynamic-red/20',
        // Hover state
        !isDragging && 'hover:ring-1 hover:ring-primary/15',
        // Selection state
        isSelected && 'bg-primary/5 shadow-md ring-2 ring-primary/50',
        // Visual feedback for invalid drop (dev only)
        process.env.NODE_ENV === 'development' &&
          isDragging &&
          !isOverlay &&
          'ring-2 ring-dynamic-red'
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
          {/* Drag handle removed – entire card draggable */}

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <button
                type="button"
                className={cn(
                  'w-full cursor-pointer text-left font-semibold text-xs leading-tight transition-colors duration-200',
                  'line-clamp-2',
                  task.archived
                    ? 'text-muted-foreground line-through'
                    : '-mx-1 -my-0.5 rounded-sm px-1 py-0.5 text-foreground active:bg-muted/50'
                )}
                onClick={(e) => {
                  // Don't allow editing when Shift is held (multi-select mode)
                  if (!e.shiftKey) {
                    setEditDialogOpen(true);
                  }
                }}
                aria-label={`Edit task: ${task.name}`}
                title="Click to edit task"
              >
                {task.name}
              </button>
            </div>
          </div>
          {/* Actions menu only */}
          <div className="flex items-center justify-end gap-1">
            {/* Main Actions Menu - With integrated date picker */}
            {!isOverlay && (
              <DropdownMenu
                open={menuOpen}
                onOpenChange={async (open) => {
                  setMenuOpen(open);
                  // On open, ensure labels are current (fetch only if we have ws and already initialized)
                  if (open && boardConfig?.ws_id) {
                    await fetchWorkspaceLabels(boardConfig.ws_id);
                  }
                }}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="xs"
                    className={cn(
                      'h-7 w-7 shrink-0 p-0 transition-all duration-200',
                      'hover:scale-105 hover:bg-muted',
                      menuOpen
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
                  className="w-56"
                  sideOffset={5}
                >
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

                  {/* Mark as Closed Action - Only show if closed list exists and is different from the generic completion */}
                  {canMoveToClose &&
                    targetClosedList?.id !== targetCompletionList?.id && (
                      <DropdownMenuItem
                        onClick={handleMoveToClose}
                        className="cursor-pointer"
                        disabled={isLoading}
                      >
                        <CircleSlash className="h-4 w-4 text-dynamic-purple" />
                        Mark as Closed
                      </DropdownMenuItem>
                    )}

                  {(canMoveToCompletion || canMoveToClose) && (
                    <DropdownMenuSeparator />
                  )}

                  {/* Priority Actions */}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <div className="h-4 w-4">
                        <Flag className="h-4 w-4 text-dynamic-orange" />
                      </div>
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
                            <Icon
                              iconNode={unicornHead}
                              className="h-4 w-4 text-dynamic-red"
                            />
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
                            <Icon
                              iconNode={horseHead}
                              className="h-4 w-4 text-dynamic-orange"
                            />
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
                            <Rabbit className="h-4 w-4 text-dynamic-yellow" />
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
                            <Turtle className="h-4 w-4 text-dynamic-blue" />
                            Low
                          </div>
                          {task.priority === 'low' && (
                            <Check className="h-4 w-4 text-dynamic-blue" />
                          )}
                        </div>
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  {/* Due Date Actions */}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <div className="h-4 w-4">
                        <Calendar className="h-4 w-4 text-dynamic-purple" />
                      </div>
                      <div className="flex w-full items-center justify-between">
                        <span>Due Date</span>
                        <span className="ml-auto text-muted-foreground text-xs">
                          {task.end_date
                            ? formatSmartDate(new Date(task.end_date))
                            : 'None'}
                        </span>
                      </div>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem
                        onClick={() => {
                          handleDueDateChange(0);
                          setMenuOpen(false);
                        }}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center gap-2">Today</div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          handleDueDateChange(1);
                          setMenuOpen(false);
                        }}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center gap-2">Tomorrow</div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          handleDueDateChange(7);
                          setMenuOpen(false);
                        }}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center gap-2">Next Week</div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          handleDueDateChange(30);
                          setMenuOpen(false);
                        }}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          Next Month
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          setMenuOpen(false);
                          // Use setTimeout to prevent interference with dropdown closing
                          setTimeout(() => setCustomDateDialogOpen(true), 100);
                        }}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Custom Date
                        </div>
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
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  {/* Estimation Submenu */}
                  {boardConfig?.estimation_type && (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Timer className="h-4 w-4 text-dynamic-pink" />
                        Estimation
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-40">
                        {buildEstimationIndices({
                          extended: boardConfig?.extended_estimation,
                          allowZero: boardConfig?.allow_zero_estimates,
                        }).map((idx) => {
                          const disabledByExtended =
                            !boardConfig?.extended_estimation && idx > 5;
                          const label = mapEstimationPoints(
                            idx,
                            boardConfig?.estimation_type
                          );
                          return (
                            <DropdownMenuItem
                              key={idx}
                              onClick={() => updateEstimationPoints(idx)}
                              className={cn(
                                'flex cursor-pointer items-center justify-between',
                                task.estimation_points === idx &&
                                  'bg-dynamic-pink/10 text-dynamic-pink'
                              )}
                              disabled={estimationSaving || disabledByExtended}
                            >
                              <span>
                                {label}
                                {disabledByExtended && (
                                  <span className="ml-1 text-[10px] text-muted-foreground/60">
                                    (upgrade)
                                  </span>
                                )}
                              </span>
                              {task.estimation_points === idx && (
                                <Check className="h-4 w-4" />
                              )}
                            </DropdownMenuItem>
                          );
                        })}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => updateEstimationPoints(null)}
                          className={cn(
                            'cursor-pointer text-muted-foreground',
                            task.estimation_points == null && 'bg-muted/50'
                          )}
                          disabled={estimationSaving}
                        >
                          <X className="h-4 w-4" /> None
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  )}

                  {/* Labels Submenu */}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Tag className="h-4 w-4 text-dynamic-cyan" />
                      Labels
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {labelsLoading && (
                        <div className="px-2 py-1 text-muted-foreground text-xs">
                          Loading...
                        </div>
                      )}
                      {!labelsLoading && workspaceLabels.length === 0 && (
                        <div className="px-2 py-2 text-center text-muted-foreground text-xs">
                          No labels yet. Create your first label below.
                        </div>
                      )}
                      <div className="grid gap-1">
                        {!labelsLoading &&
                          workspaceLabels.length > 0 &&
                          workspaceLabels.map((label) => {
                            const active = task.labels?.some(
                              (l) => l.id === label.id
                            );
                            return (
                              <DropdownMenuItem
                                key={label.id}
                                onClick={() => toggleTaskLabel(label.id)}
                                disabled={labelsSaving === label.id}
                                className={cn(
                                  'flex cursor-pointer items-center justify-between',
                                  active &&
                                    'bg-dynamic-cyan/10 text-dynamic-cyan'
                                )}
                              >
                                <span className="truncate">{label.name}</span>
                                {active && <Check className="h-4 w-4" />}
                              </DropdownMenuItem>
                            );
                          })}
                      </div>
                      {!labelsLoading &&
                        task.labels &&
                        task.labels.length > 0 && (
                          <>
                            <DropdownMenuSeparator />
                            <div className="px-2 pt-1 pb-1 text-[10px] text-muted-foreground">
                              {task.labels.length} applied
                            </div>
                          </>
                        )}
                      {!labelsLoading && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setNewLabelDialogOpen(true);
                              setMenuOpen(false);
                            }}
                            className="flex cursor-pointer items-center gap-2 text-muted-foreground hover:text-foreground"
                          >
                            <Plus className="h-4 w-4" />
                            Add New Label
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  <DropdownMenuSeparator />

                  {/* Move to List Actions */}
                  {availableLists.length > 1 && (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <div className="h-4 w-4">
                          <Move className="h-4 w-4 text-dynamic-blue" />
                        </div>
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
                          <UserStar className="h-4 w-4 text-dynamic-yellow" />
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

                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setDeleteDialogOpen(true);
                      setMenuOpen(false);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-dynamic-red" />
                    Delete task
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
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
        </div>
        {/* Dates Section (improved layout & conditional rendering) */}
        {(startDate || endDate) && (
          <div className="mb-1 space-y-0.5 text-[10px] leading-snug">
            {/* Show start only if in the future (hide historical start for visual simplicity) */}
            {startDate && startDate > now && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">
                  Starts {formatSmartDate(startDate)}
                </span>
              </div>
            )}
            {endDate && (
              <div
                className={cn(
                  'flex items-center gap-1',
                  isOverdue && !task.archived
                    ? 'font-medium text-dynamic-red'
                    : 'text-muted-foreground'
                )}
              >
                <Calendar className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">Due {formatSmartDate(endDate)}</span>
                {isOverdue && !task.archived ? (
                  <Badge className="ml-1 h-4 bg-dynamic-red px-1 font-semibold text-[9px] text-white tracking-wide">
                    OVERDUE
                  </Badge>
                ) : (
                  <span className="ml-1 hidden text-[10px] text-muted-foreground md:inline">
                    {format(endDate, "MMM dd 'at' h:mm a")}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
        {/* Bottom Row: Three-column layout for assignee, priority, and checkbox, with only one tag visible and +N tooltip for extras */}
        <div className="flex h-8 min-w-0 items-center gap-x-1 overflow-hidden whitespace-nowrap">
          {/* Priority */}
          {!task.archived && task.priority && (
            <div className="min-w-0 max-w-[80px] overflow-hidden">
              {getPriorityIndicator()}
            </div>
          )}
          {/* Estimation Points */}
          {!task.archived && task.estimation_points && (
            <div className="min-w-0 flex-shrink-0">
              <TaskEstimationDisplay
                points={task.estimation_points}
                size="sm"
                estimationType={boardConfig?.estimation_type}
                showIcon
              />
            </div>
          )}
          {/* Labels */}
          {!task.archived && task.labels && task.labels.length > 0 && (
            <div className="flex min-w-0 flex-shrink-0 flex-wrap gap-1">
              {/* Sort labels for deterministic display order */}
              <TaskLabelsDisplay
                labels={[...task.labels].sort((a, b) =>
                  a.name.toLowerCase().localeCompare(b.name.toLowerCase())
                )}
                size="sm"
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
      <TaskEditDialog
        task={task}
        isOpen={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        onUpdate={onUpdate}
        availableLists={availableLists}
      />
      <Dialog open={newLabelDialogOpen} onOpenChange={setNewLabelDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New Label</DialogTitle>
            <DialogDescription>
              Add a new label to organize your tasks. Give it a descriptive name
              and choose a color.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Label Name</Label>
              <Input
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                placeholder="e.g., Bug, Feature, Priority"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newLabelName.trim()) {
                    createNewLabel();
                  }
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label>Color</Label>
              <div className="flex items-center gap-3">
                <ColorPicker
                  value={newLabelColor}
                  onChange={setNewLabelColor}
                />
                <Badge
                  style={{
                    backgroundColor: `color-mix(in srgb, ${newLabelColor} 15%, transparent)`,
                    borderColor: `color-mix(in srgb, ${newLabelColor} 30%, transparent)`,
                    color: newLabelColor,
                  }}
                  className="border"
                >
                  {newLabelName.trim() || 'Preview'}
                </Badge>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setNewLabelDialogOpen(false)}
              disabled={creatingLabel}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={createNewLabel}
              disabled={!newLabelName.trim() || creatingLabel}
            >
              {creatingLabel ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Label'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Date Dialog */}
      <Dialog
        open={customDateDialogOpen}
        onOpenChange={setCustomDateDialogOpen}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Set Custom Due Date</DialogTitle>
            <DialogDescription>
              Choose a specific date and time for when this task should be
              completed.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-3">
              <Label className="font-medium text-sm">Due Date & Time</Label>
              <DateTimePicker
                date={task.end_date ? new Date(task.end_date) : undefined}
                setDate={handleCustomDateChange}
                showTimeSelect={true}
                minDate={new Date()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCustomDateDialogOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            {task.end_date && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  handleDueDateChange(null);
                  setCustomDateDialogOpen(false);
                }}
                disabled={isLoading}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
                Remove Due Date
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!isOverlay && (
        <TaskActions taskId={task.id} boardId={boardId} onUpdate={onUpdate} />
      )}
    </Card>
  );
}

// Custom comparator to avoid re-renders when stable fields unchanged
export const TaskCard = memo(TaskCardInner, (prev, next) => {
  // Quick identity checks for frequently changing props
  if (prev.isOverlay !== next.isOverlay) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.isMultiSelectMode !== next.isMultiSelectMode) return false;
  if (prev.boardId !== next.boardId) return false;
  // Shallow compare task critical fields
  const a = prev.task;
  const b = next.task;
  if (a === b) return true;
  // Compare a subset of fields relevant to rendering
  const keys: (keyof typeof a)[] = [
    'id',
    'name',
    'priority',
    'archived',
    'end_date',
    'start_date',
    'estimation_points',
    'list_id',
  ];
  for (const k of keys) {
    if (a[k] !== b[k]) return false;
  }
  // Compare labels length + names (sorted) for deterministic check
  const aLabels = (a.labels || [])
    .map((l) => l.name)
    .sort()
    .join('|');
  const bLabels = (b.labels || [])
    .map((l) => l.name)
    .sort()
    .join('|');
  if (aLabels !== bLabels) return false;
  return true;
});
