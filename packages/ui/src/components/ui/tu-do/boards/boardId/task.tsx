import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Box,
  Calendar,
  Check,
  CheckCircle2,
  CircleSlash,
  Clock,
  FileText,
  Flag,
  horseHead,
  Icon,
  Image as ImageIcon,
  Link2,
  Loader2,
  MoreHorizontal,
  Move,
  Play,
  Rabbit,
  Timer,
  Trash2,
  Turtle,
  unicornHead,
  UserMinus,
  UserStar,
  X,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
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
import { useTaskActions } from '@tuturuuu/ui/hooks/use-task-actions';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { cn } from '@tuturuuu/utils/format';
import {
  useBoardConfig,
  useWorkspaceLabels,
} from '@tuturuuu/utils/task-helper';
import {
  getDescriptionMetadata,
  getDescriptionText,
} from '@tuturuuu/utils/text-helper';
import {
  format,
  formatDistanceToNow,
  isToday,
  isTomorrow,
  isYesterday,
} from 'date-fns';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AssigneeSelect } from '../../shared/assignee-select';
import { TaskEditDialog } from '../../shared/task-edit-dialog';
import { TaskEstimationDisplay } from '../../shared/task-estimation-display';
import { TaskLabelsDisplay } from '../../shared/task-labels-display';
import {
  TaskDueDateMenu,
  TaskEstimationMenu,
  TaskLabelsMenu,
  TaskMoveMenu,
  TaskPriorityMenu,
  TaskProjectsMenu,
} from './menus';
import { TaskActions } from './task-actions';

const NEW_LABEL_COLOR = '#3b82f6';

interface TaskCardProps {
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
  optimisticUpdateInProgress?: Set<string>;
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
  optimisticUpdateInProgress,
}: TaskCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuGuardUntil, setMenuGuardUntil] = useState(0);
  const [customDateDialogOpen, setCustomDateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [isClosingDialog, setIsClosingDialog] = useState(false);

  // Memoize the close handler to prevent unnecessary re-renders
  const handleDialogClose = useCallback(() => {
    setIsClosingDialog(true);
    setEditDialogOpen(false);
    // Reset the closing flag after a short delay to allow the dialog to fully close
    setTimeout(() => {
      setIsClosingDialog(false);
    }, 100);
  }, []);

  // Guarded select handler for Radix DropdownMenuItem to avoid immediate action on context open
  const handleMenuItemSelect = useCallback(
    (e: Event, action: () => void) => {
      if (Date.now() < menuGuardUntil) {
        // Keep menu open by preventing default close
        if (e && typeof (e as any).preventDefault === 'function') {
          (e as any).preventDefault();
        }
        return;
      }
      action();
    },
    [menuGuardUntil]
  );

  // Use React Query hooks for shared data (cached across all task cards)
  const { data: boardConfig } = useBoardConfig(boardId);
  const { data: workspaceLabels = [], isLoading: labelsLoading } =
    useWorkspaceLabels(boardConfig?.ws_id);

  // Local state for UI interactions
  const [estimationSaving, setEstimationSaving] = useState(false);
  const [labelsSaving, setLabelsSaving] = useState<string | null>(null);
  const [projectsSaving, setProjectsSaving] = useState<string | null>(null);

  // New label creation state
  const [newLabelDialogOpen, setNewLabelDialogOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState(NEW_LABEL_COLOR);
  const [creatingLabel, setCreatingLabel] = useState(false);

  // Fetch workspace projects
  const { data: workspaceProjects = [], isLoading: projectsLoading } = useQuery(
    {
      queryKey: ['task_projects', boardConfig?.ws_id],
      queryFn: async () => {
        if (!boardConfig?.ws_id) return [];
        const supabase = createClient();
        const { data, error } = await supabase
          .from('task_projects')
          .select('id, name, status')
          .eq('ws_id', boardConfig.ws_id)
          .eq('deleted', false)
          .order('name');

        if (error) throw error;
        return data || [];
      },
      enabled: !!boardConfig?.ws_id,
    }
  );

  const queryClient = useQueryClient();

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

  // Detect mobile devices to disable drag and drop
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // Tailwind md breakpoint
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const dragDisabled =
    isMobile ||
    editDialogOpen ||
    deleteDialogOpen ||
    customDateDialogOpen ||
    newLabelDialogOpen ||
    menuOpen;

  const { setNodeRef, attributes, listeners, transform, isDragging } =
    useSortable({
      id: task.id,
      data: {
        type: 'Task',
        task: {
          ...task,
          list_id: String(task.list_id),
        },
      },
      disabled: dragDisabled,
      transition: null, // Disable @dnd-kit's built-in transitions
    });

  const style: React.CSSProperties = {
    transform: isDragging
      ? 'translate3d(0, 0, 0)'
      : CSS.Transform.toString(transform),
    transition: 'none', // Always disable transitions - rely on optimistic updates
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

  // Use the extracted task actions hook
  const {
    handleArchiveToggle,
    handleMoveToCompletion,
    handleMoveToClose,
    handleDelete,
    handleRemoveAllAssignees,
    handleRemoveAssignee,
    handleMoveToList,
    handleDueDateChange,
    handlePriorityChange,
    updateEstimationPoints,
    handleCustomDateChange,
  } = useTaskActions({
    task,
    boardId,
    targetCompletionList,
    targetClosedList,
    availableLists,
    onUpdate,
    setIsLoading,
    setMenuOpen,
    setCustomDateDialogOpen,
    setDeleteDialogOpen,
    setEstimationSaving,
  });

  // Toggle a label for the task (quick labels submenu)
  async function toggleTaskLabel(labelId: string) {
    setLabelsSaving(labelId);
    const supabase = createClient();
    const active = task.labels?.some((l) => l.id === labelId);

    // Cancel any outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

    // Snapshot the previous value
    const previousTasks = queryClient.getQueryData(['tasks', boardId]);

    // Find the label details from workspace labels
    const label = workspaceLabels.find((l) => l.id === labelId);

    // Optimistically update the cache
    queryClient.setQueryData(['tasks', boardId], (old: any[] | undefined) => {
      if (!old) return old;
      return old.map((t) => {
        if (t.id === task.id) {
          if (active) {
            // Remove the label
            return {
              ...t,
              labels: t.labels?.filter((l: any) => l.id !== labelId) || [],
            };
          } else {
            // Add the label
            return {
              ...t,
              labels: [
                ...(t.labels || []),
                label || { id: labelId, name: 'Unknown', color: '#3b82f6' },
              ],
            };
          }
        }
        return t;
      });
    });

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
      // Success - mark query as needing refetch but don't force it immediately
      queryClient.setQueryData(['tasks', boardId], (old: any[] | undefined) => {
        return old; // Return unchanged to signal success without triggering render
      });
    } catch (e: any) {
      // Rollback on error
      queryClient.setQueryData(['tasks', boardId], previousTasks);
      toast({
        title: 'Label update failed',
        description: e.message || 'Unable to toggle label',
        variant: 'destructive',
      });
    } finally {
      setLabelsSaving(null);
    }
  }

  // Toggle a project for the task (quick projects submenu)
  async function toggleTaskProject(projectId: string) {
    setProjectsSaving(projectId);
    const supabase = createClient();
    const active = task.projects?.some((p) => p.id === projectId);

    // Cancel any outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

    // Snapshot the previous value
    const previousTasks = queryClient.getQueryData(['tasks', boardId]);

    // Find the project details from workspace projects
    const project = workspaceProjects.find((p) => p.id === projectId);

    // Optimistically update the cache
    queryClient.setQueryData(['tasks', boardId], (old: any[] | undefined) => {
      if (!old) return old;
      return old.map((t) => {
        if (t.id === task.id) {
          if (active) {
            // Remove the project
            return {
              ...t,
              projects:
                t.projects?.filter((p: any) => p.id !== projectId) || [],
            };
          } else {
            // Add the project
            return {
              ...t,
              projects: [
                ...(t.projects || []),
                project || { id: projectId, name: 'Unknown', status: null },
              ],
            };
          }
        }
        return t;
      });
    });

    try {
      if (active) {
        const { error } = await supabase
          .from('task_project_tasks')
          .delete()
          .eq('task_id', task.id)
          .eq('project_id', projectId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('task_project_tasks')
          .insert({ task_id: task.id, project_id: projectId });

        // Handle duplicate key error gracefully
        if (error) {
          // Error code 23505 is duplicate key violation in PostgreSQL
          if (error.code === '23505') {
            // Project is already linked - just update cache to reflect reality
            toast({
              title: 'Already linked',
              description: 'This project is already linked to the task',
            });
            // Fetch current state to sync cache
            await queryClient.invalidateQueries({
              queryKey: ['tasks', boardId],
            });
            return;
          }
          throw error;
        }
      }
      // Success - mark query as needing refetch but don't force it immediately
      queryClient.setQueryData(['tasks', boardId], (old: any[] | undefined) => {
        return old; // Return unchanged to signal success without triggering render
      });
    } catch (e: any) {
      // Rollback on error
      queryClient.setQueryData(['tasks', boardId], previousTasks);
      toast({
        title: 'Project update failed',
        description: e.message || 'Unable to toggle project',
        variant: 'destructive',
      });
    } finally {
      setProjectsSaving(null);
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

      // Auto-apply the newly created label to this task
      try {
        const supabase = createClient();

        // Cancel any outgoing refetches
        await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

        // Snapshot the previous value
        const previousTasks = queryClient.getQueryData(['tasks', boardId]);

        // Optimistically update the cache
        queryClient.setQueryData(
          ['tasks', boardId],
          (old: any[] | undefined) => {
            if (!old) return old;
            return old.map((t) => {
              if (t.id === task.id) {
                return {
                  ...t,
                  labels: [...(t.labels || []), newLabel],
                };
              }
              return t;
            });
          }
        );

        const { error: linkErr } = await supabase
          .from('task_labels')
          .insert({ task_id: task.id, label_id: newLabel.id });
        if (linkErr) {
          // Rollback on error
          queryClient.setQueryData(['tasks', boardId], previousTasks);
          toast({
            title: 'Label created (not applied)',
            description:
              'The label was created but could not be attached to the task. Refresh and try manually.',
            variant: 'destructive',
          });
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

      // Invalidate workspace labels cache so all task cards get the new label
      queryClient.invalidateQueries({
        queryKey: ['workspace-labels', boardConfig.ws_id],
      });
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
        return 'border-dynamic-red shadow-sm shadow-dynamic-red/20';
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
      critical:
        'bg-dynamic-red/20 border-dynamic-red/50 text-dynamic-red shadow-sm shadow-dynamic-red/50',
      high: 'bg-dynamic-orange/10 border-dynamic-orange/30 text-dynamic-orange',
      normal:
        'bg-dynamic-yellow/10 border-dynamic-yellow/30 text-dynamic-yellow',
      low: 'bg-dynamic-blue/10 border-dynamic-blue/30 text-dynamic-blue',
    };

    const labels = {
      critical: <Icon iconNode={unicornHead} className="size-3" />,
      high: <Icon iconNode={horseHead} className="size-3" />,
      normal: <Rabbit className="size-3" />,
      low: <Turtle className="size-3" />,
    };

    return (
      <Badge
        variant="secondary"
        className={cn(
          'p-[0.1875rem] text-xs',
          colors[task.priority as keyof typeof colors]
        )}
      >
        {labels[task.priority as keyof typeof labels]}
      </Badge>
    );
  };

  // Get description metadata for indicators
  const descriptionMeta = getDescriptionMetadata(task.description);

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

  return (
    <Card
      data-id={task.id}
      data-task-id={task.id}
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        // Handle multi-select functionality
        onSelect?.(task.id, e);

        // Only open edit dialog if not in multi-select mode, not dragging, dialog is not already open, and not in the process of closing
        if (
          !e.shiftKey &&
          !isDragging &&
          !editDialogOpen &&
          !isClosingDialog &&
          !menuOpen &&
          !deleteDialogOpen &&
          !customDateDialogOpen &&
          !newLabelDialogOpen
        ) {
          setEditDialogOpen(true);
          setIsClosingDialog(false);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        // Open the context menu (actions dropdown) and guard first click briefly
        setMenuOpen(true);
        setMenuGuardUntil(Date.now() + 300);
      }}
      // Apply sortable listeners/attributes to the full card so the whole surface remains draggable
      {...attributes}
      {...(!dragDisabled && listeners)}
      className={cn(
        'group relative overflow-hidden rounded-lg border-l-4',
        dragDisabled
          ? 'cursor-default'
          : 'cursor-grab touch-none select-none active:cursor-grabbing',
        // Task list or priority-based styling
        getCardColorClasses(),
        // When dragging OR undergoing optimistic update, make invisible but keep in layout
        (isDragging || optimisticUpdateInProgress?.has(task.id)) && 'opacity-0',
        isOverlay &&
          'scale-105 shadow-2xl ring-2 ring-primary/50 backdrop-blur-sm',
        // Archive state (completed tasks)
        task.archived && 'opacity-70 saturate-75',
        // Overdue state
        isOverdue &&
          !task.archived &&
          'border-dynamic-red/70 bg-dynamic-red/10 ring-1 ring-dynamic-red/20',
        // Hover state (no transitions)
        !isDragging && !isSelected && 'hover:ring-1 hover:ring-primary/15',
        // Selection state - enhanced visual feedback
        isSelected &&
          'scale-[1.01] border-l-primary bg-gradient-to-r from-primary/10 via-primary/5 to-transparent shadow-lg ring-2 ring-primary/60',
        // Multi-select mode cursor
        isMultiSelectMode && 'cursor-pointer'
      )}
    >
      {/* Overdue indicator */}
      {isOverdue && !task.archived && (
        <div className="absolute top-0 right-0 h-0 w-0 border-t-[20px] border-t-dynamic-red border-l-[20px] border-l-transparent">
          <AlertCircle className="-top-4 -right-[18px] absolute h-3 w-3" />
        </div>
      )}
      {/* Selection indicator */}
      {isMultiSelectMode && (
        <div
          className={cn(
            'absolute top-2 left-2 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all duration-200',
            isSelected
              ? 'scale-110 border-primary bg-primary text-primary-foreground shadow-md'
              : 'border-border bg-background/80 text-muted-foreground shadow-sm hover:scale-105 hover:border-primary/50'
          )}
        >
          {isSelected ? (
            <Check className="h-4 w-4 stroke-[3]" />
          ) : (
            <div className="h-2 w-2 rounded-full bg-current opacity-30" />
          )}
        </div>
      )}
      <div className="p-3">
        {/* Header */}
        <div className="flex items-start gap-1">
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
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="xs"
                    className={cn(
                      'h-7 w-7 shrink-0 p-0 transition-all duration-200',
                      'hover:scale-105 hover:bg-muted',
                      menuOpen || isMobile
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
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent triggering task card click
                  }}
                >
                  {/* Quick Completion Action */}
                  {canMoveToCompletion && (
                    <DropdownMenuItem
                      onSelect={(e) =>
                        handleMenuItemSelect(
                          e as unknown as Event,
                          handleMoveToCompletion
                        )
                      }
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
                        onSelect={(e) =>
                          handleMenuItemSelect(
                            e as unknown as Event,
                            handleMoveToClose
                          )
                        }
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

                  {/* Priority Menu */}
                  <TaskPriorityMenu
                    currentPriority={task.priority ?? null}
                    isLoading={isLoading}
                    onPriorityChange={handlePriorityChange}
                    onMenuItemSelect={handleMenuItemSelect}
                    onClose={() => setMenuOpen(false)}
                  />

                  {/* Due Date Menu */}
                  <TaskDueDateMenu
                    endDate={task.end_date}
                    isLoading={isLoading}
                    onDueDateChange={handleDueDateChange}
                    onCustomDateClick={() => {
                      setMenuOpen(false);
                      setTimeout(() => setCustomDateDialogOpen(true), 100);
                    }}
                    onMenuItemSelect={handleMenuItemSelect}
                    onClose={() => setMenuOpen(false)}
                  />

                  {/* Estimation Menu */}
                  {boardConfig?.estimation_type && (
                    <TaskEstimationMenu
                      currentPoints={task.estimation_points}
                      estimationType={boardConfig?.estimation_type}
                      extendedEstimation={boardConfig?.extended_estimation}
                      allowZeroEstimates={boardConfig?.allow_zero_estimates}
                      isLoading={estimationSaving}
                      onEstimationChange={updateEstimationPoints}
                      onMenuItemSelect={handleMenuItemSelect}
                    />
                  )}

                  {/* Labels Menu */}
                  <TaskLabelsMenu
                    taskLabels={task.labels || []}
                    availableLabels={workspaceLabels}
                    isLoading={labelsLoading}
                    labelsSaving={labelsSaving}
                    onToggleLabel={toggleTaskLabel}
                    onCreateNewLabel={() => {
                      setNewLabelDialogOpen(true);
                      setMenuOpen(false);
                    }}
                    onMenuItemSelect={handleMenuItemSelect}
                  />

                  {/* Projects Menu */}
                  <TaskProjectsMenu
                    taskProjects={task.projects || []}
                    availableProjects={workspaceProjects}
                    isLoading={projectsLoading}
                    projectsSaving={projectsSaving}
                    onToggleProject={toggleTaskProject}
                    onMenuItemSelect={handleMenuItemSelect}
                  />

                  <DropdownMenuSeparator />

                  {/* Move Menu */}
                  {availableLists.length > 1 && (
                    <TaskMoveMenu
                      currentListId={task.list_id}
                      availableLists={availableLists}
                      isLoading={isLoading}
                      onMoveToList={handleMoveToList}
                      onMenuItemSelect={handleMenuItemSelect}
                    />
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
                        <DropdownMenuSubContent className="max-h-[400px] w-56 overflow-hidden p-0">
                          <ScrollArea className="h-[min(300px,calc(100vh-200px))]">
                            <div className="p-1">
                              {task.assignees.map((assignee) => (
                                <DropdownMenuItem
                                  key={assignee.id}
                                  onSelect={(e) =>
                                    handleMenuItemSelect(
                                      e as unknown as Event,
                                      () => handleRemoveAssignee(assignee.id)
                                    )
                                  }
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
                            </div>
                          </ScrollArea>
                          {task.assignees.length > 1 && (
                            <div className="border-t bg-background">
                              <DropdownMenuItem
                                onSelect={(e) =>
                                  handleMenuItemSelect(
                                    e as unknown as Event,
                                    handleRemoveAllAssignees
                                  )
                                }
                                className="cursor-pointer text-dynamic-red hover:bg-dynamic-red/10 hover:text-dynamic-red/90"
                                disabled={isLoading}
                              >
                                <UserMinus className="h-4 w-4" />
                                Remove all assignees
                              </DropdownMenuItem>
                            </div>
                          )}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}

                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(e) =>
                      handleMenuItemSelect(e as unknown as Event, () => {
                        setDeleteDialogOpen(true);
                        setMenuOpen(false);
                      })
                    }
                    className="cursor-pointer"
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
            <div className="flex flex-none items-start justify-start">
              <AssigneeSelect
                taskId={task.id}
                assignees={task.assignees}
                onUpdate={onUpdate}
              />
            </div>
          )}
        </div>
        {/* Dates Section (improved layout & conditional rendering) */}
        {/* Hide dates when task is in done/closed list */}
        {(startDate || endDate) &&
          taskList?.status !== 'done' &&
          taskList?.status !== 'closed' && (
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
                  <span className="truncate">
                    Due {formatSmartDate(endDate)}
                  </span>
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
        {/* Hide bottom row entirely when in done/closed list */}
        {taskList?.status !== 'done' && taskList?.status !== 'closed' && (
          <div className="flex items-center gap-2">
            <div className="scrollbar-hide flex w-full min-w-0 items-center gap-1 overflow-auto whitespace-nowrap rounded-lg">
              {/* Priority */}
              {!task.archived && task.priority && (
                <div className="flex-none overflow-hidden">
                  {getPriorityIndicator()}
                </div>
              )}
              {/* Project indicator */}
              {!task.archived && task.projects && task.projects.length > 0 && (
                <div className="min-w-0 flex-shrink-0">
                  <Badge
                    variant="secondary"
                    className={cn(
                      'h-5 border px-2 text-[10px]',
                      'border-dynamic-sky/30 bg-dynamic-sky/10 text-dynamic-sky'
                    )}
                  >
                    <Box className="h-2.5 w-2.5" />
                    {task.projects.length === 1
                      ? task.projects[0]?.name
                      : `${task.projects.length} projects`}
                  </Badge>
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
              {/* Description indicators */}
              {!task.archived &&
                (descriptionMeta.hasText ||
                  descriptionMeta.hasImages ||
                  descriptionMeta.hasVideos ||
                  descriptionMeta.hasLinks) && (
                  <div className="flex min-w-0 flex-shrink-0 items-center gap-0.5">
                    {descriptionMeta.hasText && (
                      <div
                        className="flex items-center gap-0.5 rounded bg-dynamic-surface/50 py-0.5"
                        title="Has description"
                      >
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    )}
                    {descriptionMeta.hasImages && (
                      <div
                        className="flex items-center gap-0.5 rounded bg-dynamic-surface/50 py-0.5"
                        title={`${descriptionMeta.imageCount} image${descriptionMeta.imageCount > 1 ? 's' : ''}`}
                      >
                        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        {descriptionMeta.imageCount > 1 && (
                          <span className="text-[9px] text-muted-foreground">
                            {descriptionMeta.imageCount}
                          </span>
                        )}
                      </div>
                    )}
                    {descriptionMeta.hasVideos && (
                      <div
                        className="flex items-center gap-0.5 rounded bg-dynamic-surface/50 py-0.5"
                        title={`${descriptionMeta.videoCount} video${descriptionMeta.videoCount > 1 ? 's' : ''}`}
                      >
                        <Play className="h-3.5 w-3.5 text-muted-foreground" />
                        {descriptionMeta.videoCount > 1 && (
                          <span className="text-[9px] text-muted-foreground">
                            {descriptionMeta.videoCount}
                          </span>
                        )}
                      </div>
                    )}
                    {descriptionMeta.hasLinks && (
                      <div
                        className="flex items-center gap-0.5 rounded bg-dynamic-surface/50 px-1 py-0.5"
                        title={`${descriptionMeta.linkCount} link${descriptionMeta.linkCount > 1 ? 's' : ''}`}
                      >
                        <Link2 className="h-2.5 w-2.5 text-muted-foreground" />
                        {descriptionMeta.linkCount > 1 && (
                          <span className="text-[9px] text-muted-foreground">
                            {descriptionMeta.linkCount}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
            </div>
            {/* Checkbox: always at far right */}
            <Checkbox
              checked={task.archived}
              className={cn(
                'h-4 w-4 flex-none transition-all duration-200',
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
        )}
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
        key={task.id} // Force re-mount when task ID changes
        task={task}
        boardId={boardId}
        isOpen={editDialogOpen}
        onClose={handleDialogClose}
        onUpdate={onUpdate}
        availableLists={availableLists}
        showUserPresence={!isPersonalWorkspace}
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
export const TaskCard = React.memo(TaskCardInner, (prev, next) => {
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
    'description',
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
  const aAssignees = (a.assignees || [])
    .map((assignee) => assignee.id)
    .filter(Boolean)
    .sort()
    .join('|');
  const bAssignees = (b.assignees || [])
    .map((assignee) => assignee.id)
    .filter(Boolean)
    .sort()
    .join('|');
  if (aAssignees !== bAssignees) return false;
  const aProjects = (a.projects || [])
    .map((project) => project.id)
    .filter(Boolean)
    .sort()
    .join('|');
  const bProjects = (b.projects || [])
    .map((project) => project.id)
    .filter(Boolean)
    .sort()
    .join('|');
  if (aProjects !== bProjects) return false;
  return true;
});

interface MeasuredTaskCardProps {
  task: Task;
  taskList: TaskList;
  boardId: string;
  onUpdate: () => void;
  isSelected: boolean;
  isMultiSelectMode?: boolean;
  isPersonalWorkspace?: boolean;
  onSelect?: (taskId: string, event: React.MouseEvent) => void;
  onHeight: (height: number) => void;
  optimisticUpdateInProgress?: Set<string>;
}

export function MeasuredTaskCard({
  task,
  taskList,
  boardId,
  onUpdate,
  isSelected,
  isMultiSelectMode,
  isPersonalWorkspace,
  onSelect,
  onHeight,
  optimisticUpdateInProgress,
}: MeasuredTaskCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const node = ref.current;
    // Get the actual card element (first child)
    const card = node.firstElementChild as HTMLElement;
    if (!card) return;

    // Initial measure - use the card's actual height without gaps
    onHeight(card.getBoundingClientRect().height);

    // Resize observer for dynamic height changes (e.g., label changes)
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === card) {
          onHeight(entry.contentRect.height);
        }
      }
    });
    ro.observe(card);
    return () => ro.disconnect();
  }, [onHeight]);

  return (
    <div ref={ref} data-id={task.id}>
      <TaskCard
        task={task}
        taskList={taskList}
        boardId={boardId}
        onUpdate={onUpdate}
        isSelected={isSelected}
        isMultiSelectMode={isMultiSelectMode}
        isPersonalWorkspace={isPersonalWorkspace}
        onSelect={onSelect}
        optimisticUpdateInProgress={optimisticUpdateInProgress}
      />
    </div>
  );
}

interface LightweightTaskCardProps {
  task: Task;
  destination?: Pick<TaskList, 'id' | 'name' | 'status' | 'color'> | null;
}

function getAssigneeInitials(name?: string | null, email?: string | null) {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts?.[0]?.slice(0, 2).toUpperCase();
    if (parts.length > 1) {
      return (
        (parts?.[0]?.[0] || '') + (parts?.[parts.length - 1]?.[0] || '')
      ).toUpperCase();
    }
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return '??';
}

const destinationTone: Record<SupportedColor, string> = {
  GRAY: 'bg-dynamic-gray/15 text-foreground/80 ring-dynamic-gray/30',
  RED: 'bg-dynamic-red/15 text-dynamic-red ring-dynamic-red/30',
  BLUE: 'bg-dynamic-blue/15 text-dynamic-blue ring-dynamic-blue/30',
  GREEN: 'bg-dynamic-green/15 text-dynamic-green ring-dynamic-green/30',
  YELLOW: 'bg-dynamic-yellow/15 text-dynamic-yellow ring-dynamic-yellow/30',
  ORANGE: 'bg-dynamic-orange/15 text-dynamic-orange ring-dynamic-orange/30',
  PURPLE: 'bg-dynamic-purple/15 text-dynamic-purple ring-dynamic-purple/30',
  PINK: 'bg-dynamic-pink/15 text-dynamic-pink ring-dynamic-pink/30',
  INDIGO: 'bg-dynamic-indigo/15 text-dynamic-indigo ring-dynamic-indigo/30',
  CYAN: 'bg-dynamic-cyan/15 text-dynamic-cyan ring-dynamic-cyan/30',
};

const priorityLabels: Record<NonNullable<Task['priority']>, string> = {
  critical: 'Urgent',
  high: 'High',
  normal: 'Medium',
  low: 'Low',
};

function LightweightTaskCardInner({
  task,
  destination,
}: LightweightTaskCardProps) {
  const descriptionText = getDescriptionText(task.description);
  const sortedLabels = task.labels
    ? [...task.labels].sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      )
    : [];
  const dueDate = task.end_date ? new Date(task.end_date) : null;
  const now = Date.now();
  const dueDisplay = dueDate
    ? formatDistanceToNow(dueDate, { addSuffix: true })
    : null;
  const isOverdue = Boolean(dueDate && dueDate.getTime() < now);
  const assignees = task.assignees ? [...task.assignees] : [];
  const visibleAssignees = assignees.slice(0, 3);
  const extraAssignees = Math.max(
    0,
    assignees.length - visibleAssignees.length
  );
  const destinationColorClass = destination
    ? destinationTone[(destination.color as SupportedColor) || 'GRAY'] ||
      destinationTone.GRAY
    : null;

  return (
    <Card className="pointer-events-none w-full max-w-[340px] select-none overflow-hidden border-2 border-primary/40 bg-background/95 shadow-2xl ring-2 ring-primary/30 backdrop-blur-md">
      <div className="flex flex-col gap-3 p-4">
        {destination && (
          <div className="slide-in-from-top-2 flex animate-in items-center justify-between gap-2 rounded-lg bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-2 text-[11px] duration-300">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-semibold shadow-sm ring-1 ring-inset',
                destinationColorClass
              )}
            >
              <Move className="h-3.5 w-3.5 animate-pulse" />
              <span className="text-xs">{destination.name}</span>
            </span>
            {destination.status && (
              <span className="rounded-full bg-background/80 px-2 py-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wider shadow-sm">
                {destination.status.replace(/_/g, ' ')}
              </span>
            )}
          </div>
        )}
        <div className="space-y-1.5">
          <div className="truncate font-bold text-base text-foreground leading-snug">
            {task.name}
          </div>
          {descriptionText && (
            <div className="line-clamp-2 whitespace-pre-line text-muted-foreground text-xs leading-relaxed">
              {descriptionText.replace(/\n/g, ' • ')}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {dueDisplay && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md bg-dynamic-surface/70 px-2 py-1 font-medium',
                isOverdue ? 'text-dynamic-red' : 'text-dynamic-green'
              )}
            >
              <Calendar className="h-3 w-3" />
              {dueDisplay}
            </span>
          )}
          {task.priority && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium',
                task.priority === 'critical'
                  ? 'bg-dynamic-red text-white shadow-dynamic-red/50 shadow-sm'
                  : 'bg-dynamic-surface/70 text-foreground/80'
              )}
            >
              <Flag
                className={cn(
                  'h-3 w-3',
                  task.priority === 'critical' ? 'h-3.5 w-3.5' : ''
                )}
              />
              {priorityLabels[task.priority]}
            </span>
          )}
          {typeof task.estimation_points === 'number' && (
            <span className="inline-flex items-center gap-1 rounded-md bg-dynamic-surface/70 px-2 py-1 font-medium text-foreground/80">
              <Timer className="h-3 w-3" />
              {task.estimation_points}
            </span>
          )}
        </div>
        {sortedLabels.length > 0 && (
          <TaskLabelsDisplay labels={sortedLabels} size="sm" />
        )}
        {visibleAssignees.length > 0 && (
          <div className="flex items-center gap-1.5">
            {visibleAssignees.map((assignee) => (
              <Avatar
                key={assignee.id}
                className="h-6 w-6 border border-background/60 bg-dynamic-surface"
              >
                {assignee.avatar_url ? (
                  <AvatarImage
                    src={assignee.avatar_url}
                    alt={assignee.display_name || assignee.email || 'Assignee'}
                  />
                ) : null}
                <AvatarFallback>
                  {getAssigneeInitials(assignee.display_name, assignee.email)}
                </AvatarFallback>
              </Avatar>
            ))}
            {extraAssignees > 0 && (
              <span className="rounded-full bg-dynamic-surface/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                +{extraAssignees}
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

export const LightweightTaskCard = memo(LightweightTaskCardInner);
LightweightTaskCard.displayName = 'LightweightTaskCard';
