import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowUpCircle,
  Ban,
  Box,
  Calendar,
  Check,
  CheckCircle2,
  CircleSlash,
  Clock,
  Copy,
  FileText,
  Image as ImageIcon,
  Link2,
  ListTodo,
  ListTree,
  MoreHorizontal,
  Play,
  Timer,
  Trash2,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useCalendarPreferences } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { useTaskActions } from '@tuturuuu/ui/hooks/use-task-actions';
import { useWorkspaceMembers } from '@tuturuuu/ui/hooks/use-workspace-members';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@tuturuuu/ui/hover-card';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import {
  createTask,
  getTicketIdentifier,
  useBoardConfig,
  useWorkspaceLabels,
} from '@tuturuuu/utils/task-helper';
import { getDescriptionMetadata } from '@tuturuuu/utils/text-helper';
import { getTimeFormatPattern } from '@tuturuuu/utils/time-helper';
import { format, formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTaskCardRelationships } from '../../hooks/useTaskCardRelationships';
import { useTaskDialog } from '../../hooks/useTaskDialog';
import { useTaskDialogState } from '../../hooks/useTaskDialogState';
import { useTaskLabelManagement } from '../../hooks/useTaskLabelManagement';
import { useTaskProjectManagement } from '../../hooks/useTaskProjectManagement';
import { useTaskDialogContext } from '../../providers/task-dialog-provider';
import { AssigneeSelect } from '../../shared/assignee-select';
import { TaskEstimationDisplay } from '../../shared/task-estimation-display';
import { TaskLabelsDisplay } from '../../shared/task-labels-display';
import { TaskViewerAvatarsComponent } from '../../shared/user-presence-avatars';
import {
  getCardColorClasses as getCardColorClassesUtil,
  getListColorClasses,
  getListTextColorClass,
  getTicketBadgeColorClasses,
} from '../../utils/taskColorUtils';
import { formatSmartDate } from '../../utils/taskDateUtils';
import { getPriorityIndicator } from '../../utils/taskPriorityUtils';
import {
  TaskAssigneesMenu,
  TaskBlockingMenu,
  TaskDueDateMenu,
  TaskEstimationMenu,
  TaskLabelsMenu,
  TaskMoveMenu,
  TaskParentMenu,
  TaskPriorityMenu,
  TaskProjectsMenu,
  TaskRelatedMenu,
} from './menus';
import { TaskActions } from './task-actions';
import { TaskCustomDateDialog } from './task-dialogs/TaskCustomDateDialog';
import { TaskDeleteDialog } from './task-dialogs/TaskDeleteDialog';
import { TaskNewLabelDialog } from './task-dialogs/TaskNewLabelDialog';
import { TaskNewProjectDialog } from './task-dialogs/TaskNewProjectDialog';

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
  onClearSelection?: () => void;
  optimisticUpdateInProgress?: Set<string>;
  selectedTasks?: Set<string>; // For bulk operations
  bulkUpdateCustomDueDate?: (date: Date | null) => Promise<void>; // From useBulkOperations
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
  onClearSelection,
  optimisticUpdateInProgress,
  selectedTasks,
  bulkUpdateCustomDueDate,
}: TaskCardProps) {
  const { wsId: rawWsId } = useParams();
  const wsId = Array.isArray(rawWsId) ? rawWsId[0] : rawWsId;
  const queryClient = useQueryClient();
  const { timeFormat } = useCalendarPreferences();
  const timePattern = getTimeFormatPattern(timeFormat);

  const [isLoading, setIsLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuGuardUntil, setMenuGuardUntil] = useState(0);

  // Use extracted dialog state management hook
  const { state: dialogState, actions: dialogActions } = useTaskDialogState();
  const { state: dialogStateFromProvider, createSubtask } =
    useTaskDialogContext();

  // Use centralized task dialog
  const { openTask } = useTaskDialog();

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
  const [assigneeSaving, setAssigneeSaving] = useState<string | null>(null);

  // Use extracted label management hook
  const {
    toggleTaskLabel,
    createNewLabel,
    labelsSaving,
    newLabelName,
    setNewLabelName,
    newLabelColor,
    setNewLabelColor,
    creatingLabel,
  } = useTaskLabelManagement({
    task,
    boardId,
    workspaceLabels,
    workspaceId: boardConfig?.ws_id,
    selectedTasks,
    isMultiSelectMode,
    onClearSelection,
  });

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
      staleTime: 5 * 60 * 1000, // 5 minutes - projects rarely change
    }
  );

  // Use extracted project management hook
  const {
    toggleTaskProject,
    projectsSaving,
    newProjectName,
    setNewProjectName,
    creatingProject,
    createNewProject,
  } = useTaskProjectManagement({
    task,
    boardId,
    workspaceProjects,
    workspaceId: boardConfig?.ws_id,
    selectedTasks,
    isMultiSelectMode,
    onClearSelection,
  });

  // Fetch workspace members
  const { data: workspaceMembers = [], isLoading: membersLoading } =
    useWorkspaceMembers(wsId, { enabled: !!wsId && !isPersonalWorkspace });

  // Use task relationships hook for managing parent/child/blocking/related tasks
  const {
    parentTask,
    childTasks,
    blocking: blockingTasks,
    blockedBy: blockedByTasks,
    relatedTasks,
    setParentTask,
    removeParentTask,
    addBlockingTask,
    removeBlockingTask,
    addBlockedByTask,
    removeBlockedByTask,
    addRelatedTask,
    removeRelatedTask,
    isSaving: relationshipSaving,
    savingTaskId: relationshipSavingTaskId,
  } = useTaskCardRelationships({
    taskId: task.id,
    boardId,
  });

  // Fetch available task lists using React Query (same key as other components)
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
    enabled: !propAvailableLists, // Only fetch if not provided as prop
    initialData: propAvailableLists,
    staleTime: 60 * 1000, // 1 minute - lists change less frequently
  });

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

  // Check if task is optimistically added (pending realtime confirmation)
  const isOptimistic = '_isOptimistic' in task && task._isOptimistic === true;

  const dragDisabled =
    dialogState.editDialogOpen ||
    dialogState.deleteDialogOpen ||
    dialogState.customDateDialogOpen ||
    dialogState.newLabelDialogOpen ||
    dialogState.newProjectDialogOpen ||
    menuOpen ||
    isOptimistic; // Disable drag for optimistic tasks until confirmed

  // Debug: log drag state for newly created task
  if (task.name === 'new task') {
    console.log('[TaskCard Debug]', {
      taskId: task.id,
      editDialogOpen: dialogState.editDialogOpen,
      deleteDialogOpen: dialogState.deleteDialogOpen,
      customDateDialogOpen: dialogState.customDateDialogOpen,
      newLabelDialogOpen: dialogState.newLabelDialogOpen,
      newProjectDialogOpen: dialogState.newProjectDialogOpen,
      menuOpen,
      isOptimistic,
      RESULT_dragDisabled: dragDisabled,
    });
  }

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
    // Show reduced opacity for optimistic tasks (pending realtime confirmation)
    opacity: isOptimistic ? 0.6 : undefined,
  };

  const now = new Date();
  const isOverdue = task.end_date && new Date(task.end_date) < now;
  const startDate = task.start_date ? new Date(task.start_date) : null;
  const endDate = task.end_date ? new Date(task.end_date) : null;

  // Memoize description metadata to prevent unnecessary recalculations
  // This is important because descriptionMeta is used in taskBadges dependency array
  const descriptionMeta = useMemo(
    () => getDescriptionMetadata(task.description),
    [task.description]
  );

  // Helper function to get card color classes
  const getCardColorClasses = () =>
    getCardColorClassesUtil(taskList, task.priority);

  // Use the extracted task actions hook
  const {
    handleArchiveToggle,
    handleMoveToCompletion,
    handleMoveToClose,
    handleDelete,
    handleMoveToList,
    handleDueDateChange,
    handlePriorityChange,
    updateEstimationPoints,
    handleCustomDateChange,
    handleToggleAssignee,
  } = useTaskActions({
    task,
    boardId,
    targetCompletionList,
    targetClosedList,
    availableLists,
    onUpdate,
    setIsLoading,
    setMenuOpen,
    setCustomDateDialogOpen: (open: boolean) =>
      open
        ? dialogActions.openCustomDateDialog()
        : dialogActions.closeCustomDateDialog(),
    setDeleteDialogOpen: (open: boolean) =>
      open
        ? dialogActions.openDeleteDialog()
        : dialogActions.closeDeleteDialog(),
    setEstimationSaving,
    selectedTasks,
    isMultiSelectMode,
    onClearSelection,
    bulkUpdateCustomDueDate,
  });

  const onToggleAssignee = useCallback(
    async (assigneeId: string) => {
      try {
        setAssigneeSaving(assigneeId);
        await handleToggleAssignee(assigneeId);
      } finally {
        setAssigneeSaving(null);
      }
    },
    [handleToggleAssignee]
  );

  // Memoize drag handle for performance
  // Removed explicit drag handle – entire card is now draggable for better UX.
  // Keep attributes/listeners to spread onto root interactive area.

  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      // Check if modifier keys are held (Shift for range select, Cmd/Ctrl for toggle)
      const isModifierHeld = e.shiftKey || e.metaKey || e.ctrlKey;

      // Handle multi-select functionality
      if (isMultiSelectMode || isModifierHeld) {
        onSelect?.(task.id, e);
      } else if (
        !isDragging &&
        !dialogState.editDialogOpen &&
        !dialogState.isClosingDialog &&
        !menuOpen &&
        !dialogState.deleteDialogOpen &&
        !dialogState.customDateDialogOpen &&
        !dialogState.newLabelDialogOpen &&
        !dialogState.newProjectDialogOpen
      ) {
        // Only open edit dialog if not in multi-select mode, not dragging, and no other dialogs are open
        openTask(task, boardId, availableLists);
      }
    },
    [
      task,
      boardId,
      isMultiSelectMode,
      availableLists,
      isDragging,
      menuOpen,
      dialogState,
      onSelect,
      openTask,
    ]
  );

  // Refs for measuring badge widths
  const containerRef = useRef<HTMLDivElement>(null);
  const badgeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const descriptionMetaRef = useRef<HTMLDivElement>(null);
  const [visibleBadgeCount, setVisibleBadgeCount] = useState(0);

  const handleDuplicateTask = async () => {
    setIsLoading(true);
    setMenuOpen(false);

    // Check if we're in multi-select mode and have multiple tasks selected
    const shouldBulkDuplicate =
      isMultiSelectMode &&
      selectedTasks &&
      selectedTasks.size > 1 &&
      selectedTasks.has(task.id);

    // Get all tasks data from cache for bulk operations
    const allTasks =
      (queryClient.getQueryData<Task[]>(['tasks', boardId]) as Task[]) || [];
    const tasksToDuplicate = shouldBulkDuplicate
      ? allTasks.filter((t) => selectedTasks?.has(t.id))
      : [task];

    try {
      const supabase = createClient();
      const duplicatedTasks: Task[] = [];

      // Duplicate all tasks
      for (const sourceTask of tasksToDuplicate) {
        const taskData: Partial<Task> = {
          name: sourceTask.name.trim(),
          description: sourceTask.description,
          priority: sourceTask.priority,
          start_date: sourceTask.start_date,
          end_date: sourceTask.end_date,
          estimation_points: sourceTask.estimation_points ?? null,
        };

        const newTask = await createTask(
          supabase,
          sourceTask.list_id,
          taskData
        );

        // Link existing labels one by one to ensure triggers fire
        if (sourceTask.labels && sourceTask.labels.length > 0) {
          for (const label of sourceTask.labels) {
            const { error } = await supabase.from('task_labels').insert({
              task_id: newTask.id,
              label_id: label.id,
            });
            if (error) {
              console.error(`Failed to add label ${label.id}:`, error);
            }
          }
        }

        // Link existing assignees one by one to ensure triggers fire
        if (sourceTask.assignees && sourceTask.assignees.length > 0) {
          for (const assignee of sourceTask.assignees) {
            const { error } = await supabase.from('task_assignees').insert({
              task_id: newTask.id,
              user_id: assignee.id,
            });
            if (error) {
              console.error(`Failed to add assignee ${assignee.id}:`, error);
            }
          }
        }

        // Link existing projects one by one to ensure triggers fire
        if (sourceTask.projects && sourceTask.projects.length > 0) {
          for (const project of sourceTask.projects) {
            const { error } = await supabase.from('task_project_tasks').insert({
              task_id: newTask.id,
              project_id: project.id,
            });
            if (error) {
              console.error(`Failed to add project ${project.id}:`, error);
            }
          }
        }

        duplicatedTasks.push({
          ...newTask,
          assignees: sourceTask.assignees,
          labels: sourceTask.labels,
          projects: sourceTask.projects,
        });
      }

      // Add all duplicated tasks to cache at once
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return duplicatedTasks;
          // Filter out any tasks that already exist (in case realtime already added them)
          const newTasks = duplicatedTasks.filter(
            (newTask) => !old.some((t) => t.id === newTask.id)
          );
          return [...old, ...newTasks];
        }
      );

      const taskCount = duplicatedTasks.length;
      toast.success(
        taskCount > 1
          ? `${taskCount} tasks duplicated successfully`
          : 'Task duplicated successfully'
      );
    } catch (error: any) {
      console.error('Error duplicating task(s):', error);
      toast.error(error.message || 'Please try again later');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddSubtask = () => {
    setMenuOpen(false);
    // Open subtask creation dialog - the relationship will be created when the user saves
    createSubtask(task.id, task.name, boardId, task.list_id, availableLists);
  };

  const taskBadges = useMemo(() => {
    // Collect all badges into an array for overflow handling
    const badges: { id: string; element: React.ReactNode }[] = [];

    // Priority badge
    if (task.priority) {
      badges.push({
        id: 'priority',
        element: (
          <div
            key="priority"
            className="flex-none overflow-hidden"
            ref={(el) => {
              if (el) badgeRefs.current.set('priority', el);
            }}
          >
            {getPriorityIndicator(task.priority)}
          </div>
        ),
      });
    }

    // Sub-tasks counter badge
    if (descriptionMeta.totalCheckboxes > 0) {
      badges.push({
        id: 'subtasks',
        element: (
          <Badge
            key="subtasks"
            variant="secondary"
            className={cn(
              'border font-medium text-[10px]',
              descriptionMeta.checkedCheckboxes ===
                descriptionMeta.totalCheckboxes
                ? 'border-dynamic-green/30 bg-dynamic-green/15 text-dynamic-green'
                : 'border-dynamic-gray/30 bg-dynamic-gray/10 text-dynamic-gray'
            )}
            title={`${descriptionMeta.checkedCheckboxes} of ${descriptionMeta.totalCheckboxes} sub-tasks completed`}
            ref={(el) => {
              if (el) badgeRefs.current.set('subtasks', el as any);
            }}
          >
            <ListTodo className="h-3 w-3" />
            {descriptionMeta.checkedCheckboxes}/
            {descriptionMeta.totalCheckboxes}
          </Badge>
        ),
      });
    }

    // Project indicator badge
    if (task.projects && task.projects.length > 0) {
      badges.push({
        id: 'projects',
        element: (
          <div
            key="projects"
            className="min-w-0 shrink-0"
            ref={(el) => {
              if (el) badgeRefs.current.set('projects', el);
            }}
          >
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
        ),
      });
    }

    // Estimation Points badge
    if (task.estimation_points != null) {
      badges.push({
        id: 'estimation',
        element: (
          <div
            key="estimation"
            className="min-w-0 shrink-0"
            ref={(el) => {
              if (el) badgeRefs.current.set('estimation', el);
            }}
          >
            <TaskEstimationDisplay
              points={task.estimation_points}
              size="sm"
              estimationType={boardConfig?.estimation_type}
              showIcon
            />
          </div>
        ),
      });
    }

    // Labels badge
    if (task.labels && task.labels.length > 0) {
      badges.push({
        id: 'labels',
        element: (
          <div
            key="labels"
            className="flex min-w-0 shrink-0 flex-wrap gap-1"
            ref={(el) => {
              if (el) badgeRefs.current.set('labels', el);
            }}
          >
            <TaskLabelsDisplay
              labels={[...task.labels].sort((a, b) =>
                a.name.toLowerCase().localeCompare(b.name.toLowerCase())
              )}
              size="sm"
            />
          </div>
        ),
      });
    }

    // Parent task indicator badge
    if (parentTask) {
      badges.push({
        id: 'parent',
        element: (
          <Badge
            key="parent"
            variant="secondary"
            className="h-5 shrink-0 border border-dynamic-purple/30 bg-dynamic-purple/10 px-2 text-[10px] text-dynamic-purple"
            title={`Sub-task of: ${parentTask.name}`}
            ref={(el) => {
              if (el) badgeRefs.current.set('parent', el as any);
            }}
          >
            <ArrowUpCircle className="h-2.5 w-2.5" />
            {parentTask.name}
          </Badge>
        ),
      });
    }

    // Child tasks (sub-tasks) count badge
    if (childTasks.length > 0) {
      const completedCount = childTasks.filter((t) => t.completed).length;
      badges.push({
        id: 'children',
        element: (
          <Badge
            key="children"
            variant="secondary"
            className={cn(
              'h-5 shrink-0 border px-2 text-[10px]',
              completedCount === childTasks.length
                ? 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green'
                : 'border-dynamic-gray/30 bg-dynamic-gray/10 text-dynamic-gray'
            )}
            title={`${completedCount} of ${childTasks.length} sub-tasks completed`}
            ref={(el) => {
              if (el) badgeRefs.current.set('children', el as any);
            }}
          >
            <ListTree className="h-2.5 w-2.5" />
            {completedCount}/{childTasks.length}
          </Badge>
        ),
      });
    }

    // Blocked indicator badge (this task is blocked by others)
    if (blockedByTasks.length > 0) {
      badges.push({
        id: 'blocked',
        element: (
          <Badge
            key="blocked"
            variant="secondary"
            className="h-5 shrink-0 border border-dynamic-red/30 bg-dynamic-red/10 px-2 text-[10px] text-dynamic-red"
            title={`Blocked by ${blockedByTasks.length} task${blockedByTasks.length > 1 ? 's' : ''}`}
            ref={(el) => {
              if (el) badgeRefs.current.set('blocked', el as any);
            }}
          >
            <Ban className="h-2.5 w-2.5" />
            Blocked
          </Badge>
        ),
      });
    }

    // Blocking indicator badge (this task blocks others)
    if (blockingTasks.length > 0) {
      badges.push({
        id: 'blocking',
        element: (
          <Badge
            key="blocking"
            variant="secondary"
            className="h-5 shrink-0 border border-dynamic-orange/30 bg-dynamic-orange/10 px-2 text-[10px] text-dynamic-orange"
            title={`Blocking ${blockingTasks.length} task${blockingTasks.length > 1 ? 's' : ''}`}
            ref={(el) => {
              if (el) badgeRefs.current.set('blocking', el as any);
            }}
          >
            <Ban className="h-2.5 w-2.5" />
            {blockingTasks.length}
          </Badge>
        ),
      });
    }

    // Related tasks indicator badge
    if (relatedTasks.length > 0) {
      badges.push({
        id: 'related',
        element: (
          <Badge
            key="related"
            variant="secondary"
            className="h-5 shrink-0 border border-dynamic-blue/30 bg-dynamic-blue/10 px-2 text-[10px] text-dynamic-blue"
            title={`${relatedTasks.length} related task${relatedTasks.length > 1 ? 's' : ''}`}
            ref={(el) => {
              if (el) badgeRefs.current.set('related', el as any);
            }}
          >
            <Link2 className="h-2.5 w-2.5" />
            {relatedTasks.length}
          </Badge>
        ),
      });
    }

    return badges;
  }, [
    // Only depend on specific task properties that affect badge rendering
    // to prevent recalculation when unrelated properties (like name) change
    task.priority,
    task.projects,
    task.estimation_points,
    task.labels,
    boardConfig?.estimation_type,
    descriptionMeta.totalCheckboxes,
    descriptionMeta.checkedCheckboxes,
    parentTask,
    childTasks,
    blockingTasks,
    blockedByTasks,
    relatedTasks,
  ]);

  // Calculate visible badges based on available width
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const calculateVisibleCount = () => {
      const containerWidth = container.clientWidth;
      const gap = 4; // gap-1 = 4px

      // Get description meta width
      let descriptionMetaWidth = 0;
      if (descriptionMetaRef.current) {
        descriptionMetaWidth = descriptionMetaRef.current.offsetWidth + gap;
      }

      // Calculate total width needed for each badge
      let totalWidth = descriptionMetaWidth;
      let count = 0;

      for (let i = 0; i < taskBadges.length; i++) {
        const badge = taskBadges[i];
        const badgeElement = badgeRefs.current.get(badge?.id || '');
        if (!badgeElement) continue;

        const isLastBadge = i === taskBadges.length - 1;
        const badgeWidth = badgeElement.offsetWidth + (isLastBadge ? 0 : gap);

        const totalNeeded = totalWidth + badgeWidth;

        if (totalNeeded <= containerWidth) {
          totalWidth += badgeWidth;
          count++;
        } else {
          break;
        }
      }

      setVisibleBadgeCount(count);
    };

    // Initial calculation
    calculateVisibleCount();

    // Re-calculate on container resize
    const resizeObserver = new ResizeObserver(calculateVisibleCount);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [taskBadges]);

  const visibleBadges = taskBadges.slice(0, visibleBadgeCount);
  const hiddenBadges = taskBadges.slice(visibleBadgeCount);

  // Get all tasks from query to subscribe to cache updates
  const { data: allTasksFromQuery } = useQuery({
    queryKey: ['tasks', boardId],
    queryFn: () => [], // No-op function - we only want to read from cache
    enabled: false, // Don't fetch, just subscribe to cache
  });

  // Compute collective attributes for bulk operations
  const {
    displayLabels,
    displayProjects,
    displayAssignees,
    displayEstimation,
  } = useMemo(() => {
    const shouldUseBulkMode =
      isMultiSelectMode &&
      selectedTasks &&
      selectedTasks.size > 1 &&
      selectedTasks.has(task.id);

    if (!shouldUseBulkMode) {
      return {
        displayLabels: task.labels || [],
        displayProjects: task.projects || [],
        displayAssignees: task.assignees || [],
        displayEstimation: task.estimation_points,
      };
    }

    // Get all selected tasks data from query cache
    const allTasks = (allTasksFromQuery as Task[]) || [];
    const selectedTasksData = allTasks.filter((t) => selectedTasks?.has(t.id));

    if (selectedTasksData.length === 0) {
      return {
        displayLabels: task.labels || [],
        displayProjects: task.projects || [],
        displayAssignees: task.assignees || [],
        displayEstimation: task.estimation_points,
      };
    }

    // Find attributes that ALL selected tasks have in common
    // Start with all unique attributes from all selected tasks
    const allLabels = new Map<string, any>();
    const allProjects = new Map<string, any>();
    const allAssignees = new Map<string, any>();

    selectedTasksData.forEach((t) => {
      t.labels?.forEach((label) => {
        allLabels.set(label.id, label);
      });
      t.projects?.forEach((project) => {
        allProjects.set(project.id, project);
      });
      t.assignees?.forEach((assignee) => {
        allAssignees.set(assignee.id, assignee);
      });
    });

    // Filter to only those present in ALL selected tasks
    const commonLabels = Array.from(allLabels.values()).filter((label) =>
      selectedTasksData.every((t) => t.labels?.some((l) => l.id === label.id))
    );

    const commonProjects = Array.from(allProjects.values()).filter((project) =>
      selectedTasksData.every((t) =>
        t.projects?.some((p) => p.id === project.id)
      )
    );

    const commonAssignees = Array.from(allAssignees.values()).filter(
      (assignee) =>
        selectedTasksData.every((t) =>
          t.assignees?.some((a) => a.id === assignee.id)
        )
    );

    // Check if ALL selected tasks have the same estimation
    const firstEstimation = selectedTasksData[0]?.estimation_points;
    const allSameEstimation = selectedTasksData.every(
      (t) => t.estimation_points === firstEstimation
    );
    const commonEstimation = allSameEstimation ? firstEstimation : undefined;

    return {
      displayLabels: commonLabels,
      displayProjects: commonProjects,
      displayAssignees: commonAssignees,
      displayEstimation: commonEstimation,
    };
  }, [
    isMultiSelectMode,
    selectedTasks,
    task.id,
    task.labels,
    task.projects,
    task.assignees,
    task.estimation_points,
    allTasksFromQuery,
  ]);

  return (
    <Card
      data-id={task.id}
      data-task-id={task.id}
      ref={setNodeRef}
      style={style}
      onClick={handleCardClick}
      onContextMenu={(e) => {
        // If modifier keys are held (Shift/Cmd/Ctrl), handle as selection
        // (Command+Click on Mac triggers context menu, but we want it to select)
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
          e.preventDefault();
          e.stopPropagation();
          // Trigger selection (Command+Click fires contextmenu instead of click on Mac)
          onSelect?.(task.id, e as any);
          return;
        }

        // Normal right-click behavior - open context menu
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
        // Closed state (closed tasks)
        (!!task.closed_at || !!task.completed_at) && 'opacity-70 saturate-75',
        // Overdue state
        isOverdue &&
          !(!!task.closed_at || !!task.completed_at) &&
          'border-dynamic-red/70 bg-dynamic-red/10 ring-1 ring-dynamic-red/20',
        // Hover state (no transitions)
        !isDragging && !isSelected && 'hover:ring-1 hover:ring-primary/15',
        // Selection state - enhanced visual feedback
        isSelected &&
          'scale-[1.01] border-l-primary bg-linear-to-r from-primary/10 via-primary/5 to-transparent shadow-lg ring-2 ring-primary/60',
        // Multi-select mode cursor
        isMultiSelectMode && 'cursor-pointer'
      )}
    >
      {/* Overdue indicator */}
      {isOverdue && !(!!task.closed_at || !!task.completed_at) && (
        <div className="absolute top-0 right-0 h-0 w-0 border-t-20 border-t-dynamic-red border-l-20 border-l-transparent">
          <AlertCircle className="absolute -top-4 -right-4.5 h-3 w-3" />
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
            <Check className="h-4 w-4 stroke-3" />
          ) : (
            <div className="h-2 w-2 rounded-full bg-current opacity-30" />
          )}
        </div>
      )}
      <div className="p-3">
        {/* Header */}
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-col gap-1">
              {/* Ticket Identifier */}
              {taskList?.status !== 'documents' && (
                <Badge
                  variant="outline"
                  className={cn(
                    'w-fit px-1 py-0 font-mono text-[10px]',
                    getTicketBadgeColorClasses(taskList, task.priority)
                  )}
                  title={`Ticket ID: ${getTicketIdentifier(boardConfig?.ticket_prefix, task.display_number)}`}
                >
                  {getTicketIdentifier(
                    boardConfig?.ticket_prefix,
                    task.display_number
                  )}
                </Badge>
              )}
              {/* Task Name */}
              <button
                type="button"
                className={cn(
                  'w-full cursor-pointer text-left font-semibold text-xs leading-tight transition-colors duration-200',
                  'line-clamp-2',
                  task.closed_at || task.completed_at
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
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent triggering task card click
                  }}
                >
                  {taskList?.status !== 'documents' && (
                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={isLoading}
                    >
                      <Link
                        href={`/${wsId}/time-tracker/timer?taskSelect=${task?.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2"
                      >
                        <Timer className="h-4 w-4 text-dynamic-blue" />
                        Start tracking time
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {taskList?.status !== 'documents' && (
                    <DropdownMenuSeparator />
                  )}
                  {/* Quick Completion Action */}
                  {taskList?.status !== 'documents' && canMoveToCompletion && (
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
                  {taskList?.status !== 'documents' &&
                    canMoveToClose &&
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

                  {taskList?.status !== 'documents' &&
                    (canMoveToCompletion || canMoveToClose) && (
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
                      setTimeout(
                        () => dialogActions.openCustomDateDialog(),
                        100
                      );
                    }}
                    onMenuItemSelect={handleMenuItemSelect}
                    onClose={() => setMenuOpen(false)}
                  />

                  {/* Estimation Menu */}
                  {boardConfig?.estimation_type && (
                    <TaskEstimationMenu
                      currentPoints={displayEstimation}
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
                    taskLabels={displayLabels}
                    availableLabels={workspaceLabels}
                    isLoading={labelsLoading}
                    labelsSaving={labelsSaving}
                    onToggleLabel={toggleTaskLabel}
                    onCreateNewLabel={() => {
                      dialogActions.openNewLabelDialog();
                      setMenuOpen(false);
                    }}
                    onMenuItemSelect={handleMenuItemSelect}
                  />

                  {/* Projects Menu */}
                  <TaskProjectsMenu
                    taskProjects={displayProjects}
                    availableProjects={workspaceProjects}
                    isLoading={projectsLoading}
                    projectsSaving={projectsSaving}
                    onToggleProject={toggleTaskProject}
                    onCreateNewProject={() => {
                      dialogActions.openNewProjectDialog();
                      setMenuOpen(false);
                    }}
                    onMenuItemSelect={handleMenuItemSelect}
                  />

                  <DropdownMenuSeparator />

                  {/* Task Relationships Section */}
                  {boardConfig?.ws_id && (
                    <>
                      {/* Parent Task Menu */}
                      <TaskParentMenu
                        wsId={boardConfig.ws_id}
                        taskId={task.id}
                        parentTask={parentTask}
                        childTaskIds={childTasks.map((t) => t.id)}
                        isSaving={relationshipSaving}
                        onSetParent={setParentTask}
                        onRemoveParent={removeParentTask}
                      />

                      {/* Blocking/Blocked By Menu */}
                      <TaskBlockingMenu
                        wsId={boardConfig.ws_id}
                        taskId={task.id}
                        blockingTasks={blockingTasks}
                        blockedByTasks={blockedByTasks}
                        isSaving={relationshipSaving}
                        savingTaskId={relationshipSavingTaskId}
                        onAddBlocking={addBlockingTask}
                        onRemoveBlocking={removeBlockingTask}
                        onAddBlockedBy={addBlockedByTask}
                        onRemoveBlockedBy={removeBlockedByTask}
                      />

                      {/* Related Tasks Menu */}
                      <TaskRelatedMenu
                        wsId={boardConfig.ws_id}
                        taskId={task.id}
                        relatedTasks={relatedTasks}
                        isSaving={relationshipSaving}
                        savingTaskId={relationshipSavingTaskId}
                        onAddRelated={addRelatedTask}
                        onRemoveRelated={removeRelatedTask}
                      />

                      <DropdownMenuSeparator />
                    </>
                  )}

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

                  {/* Assignee Actions - Show if not personal workspace */}
                  {!isPersonalWorkspace && (
                    <TaskAssigneesMenu
                      taskAssignees={displayAssignees}
                      availableMembers={workspaceMembers}
                      isLoading={membersLoading}
                      assigneeSaving={assigneeSaving}
                      onToggleAssignee={onToggleAssignee}
                      onMenuItemSelect={handleMenuItemSelect}
                    />
                  )}

                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={handleDuplicateTask}
                    className="cursor-pointer"
                  >
                    <Copy className="h-4 w-4 text-foreground" />
                    Duplicate task
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={handleAddSubtask}
                    className="cursor-pointer"
                  >
                    <ListTree className="h-4 w-4 text-foreground" />
                    Add sub-task
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(e) =>
                      handleMenuItemSelect(e as unknown as Event, () => {
                        dialogActions.openDeleteDialog();
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
                    isOverdue && !task.closed_at
                      ? 'font-medium text-dynamic-red'
                      : 'text-muted-foreground'
                  )}
                >
                  <Calendar className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">
                    Due {formatSmartDate(endDate)}
                  </span>
                  {isOverdue && !task.closed_at ? (
                    <Badge className="ml-1 h-4 bg-dynamic-red px-1 font-semibold text-[9px] text-white tracking-wide">
                      OVERDUE
                    </Badge>
                  ) : (
                    <span className="ml-1 hidden text-[10px] text-muted-foreground md:inline">
                      {format(endDate, `MMM dd 'at' ${timePattern}`)}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        {taskList?.status === 'done' || taskList?.status === 'closed' ? (
          /*
            Completion and Closed Dates Section
            Show completed_at when in done list, closed_at when in closed list
          */
          <div className="mb-1 space-y-0.5 text-[10px] leading-snug">
            {taskList?.status === 'done' && task.completed_at && (
              <div
                className={cn(
                  'flex items-center gap-1',
                  getListTextColorClass(taskList?.color)
                )}
              >
                <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">
                  Completed{' '}
                  {formatDistanceToNow(new Date(task.completed_at), {
                    addSuffix: true,
                  })}
                </span>
                <span className="ml-1 hidden text-[10px] text-muted-foreground md:inline">
                  {format(
                    new Date(task.completed_at),
                    `MMM dd 'at' ${timePattern}`
                  )}
                </span>
              </div>
            )}
            {taskList?.status === 'closed' && task.closed_at && (
              <div
                className={cn(
                  'flex items-center gap-1',
                  getListTextColorClass(taskList?.color)
                )}
              >
                <CircleSlash className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">
                  Closed{' '}
                  {formatDistanceToNow(new Date(task.closed_at), {
                    addSuffix: true,
                  })}
                </span>
                <span className="ml-1 hidden text-[10px] text-muted-foreground md:inline">
                  {format(
                    new Date(task.closed_at),
                    `MMM dd 'at' ${timePattern}`
                  )}
                </span>
              </div>
            )}
          </div>
        ) : (
          /*
            Bottom Row: Three-column layout for assignee, priority, and checkbox, with only one tag visible and +N tooltip for extras.
            Hide bottom row entirely when in done/closed list
          */
          <div className="flex items-center gap-2">
            {/* Hidden measurement container - render all badges to measure their width */}
            <div
              className="pointer-events-none absolute top-0 left-[-9999px] flex items-center gap-1 opacity-0"
              aria-hidden="true"
            >
              {taskBadges.map((badge) => badge.element)}
            </div>
            {/* Visible container - only show badges that fit */}
            <div
              ref={containerRef}
              className="scrollbar-hide flex w-full items-center gap-1 overflow-auto whitespace-nowrap rounded-lg"
            >
              {visibleBadges.map((badge) => badge.element)}
              {visibleBadges.length > 0 && hiddenBadges.length > 0 && (
                <HoverCard openDelay={200}>
                  <HoverCardTrigger asChild>
                    <Badge
                      variant="secondary"
                      className="cursor-pointer border border-border bg-muted/50 font-medium text-[10px] text-muted-foreground hover:bg-muted"
                    >
                      +{hiddenBadges.length}
                    </Badge>
                  </HoverCardTrigger>
                  <HoverCardContent
                    side="top"
                    align="start"
                    className="flex w-auto max-w-xs flex-col gap-2 p-2"
                  >
                    <div className="text-center font-semibold text-sm">
                      Other properties
                    </div>
                    <div className="border" />
                    <div className="flex flex-col gap-2">
                      {hiddenBadges.map((badge) => badge.element)}
                    </div>
                  </HoverCardContent>
                </HoverCard>
              )}
              {/* Description indicators */}
              {(descriptionMeta.hasText ||
                descriptionMeta.hasImages ||
                descriptionMeta.hasVideos ||
                descriptionMeta.hasLinks) && (
                <div
                  ref={descriptionMetaRef}
                  className="flex min-w-0 shrink-0 items-center gap-0.5"
                >
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
            <div className="flex items-center gap-2">
              {!isPersonalWorkspace && (
                <TaskViewerAvatarsComponent
                  taskId={task.id}
                  isViewing={
                    dialogStateFromProvider.isOpen &&
                    dialogStateFromProvider.task?.id === task.id
                  }
                />
              )}

              {/* Checkbox: hidden for documents lists */}
              {taskList?.status !== 'documents' && (
                <Checkbox
                  checked={!!task.closed_at}
                  className={cn(
                    'h-4 w-4 flex-none transition-all duration-200',
                    'data-[state=checked]:border-dynamic-green/70 data-[state=checked]:bg-dynamic-green/70',
                    'hover:scale-110 hover:border-primary/50',
                    getListColorClasses(taskList?.color as SupportedColor),
                    isOverdue &&
                      !task.closed_at &&
                      'border-dynamic-red/70 bg-dynamic-red/10 ring-1 ring-dynamic-red/20'
                  )}
                  disabled={isLoading}
                  onCheckedChange={handleArchiveToggle}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </div>
          </div>
        )}
      </div>
      <TaskDeleteDialog
        task={task}
        open={dialogState.deleteDialogOpen}
        isLoading={isLoading}
        onOpenChange={(open) =>
          open
            ? dialogActions.openDeleteDialog()
            : dialogActions.closeDeleteDialog()
        }
        onConfirm={handleDelete}
      />
      <TaskNewLabelDialog
        open={dialogState.newLabelDialogOpen}
        newLabelName={newLabelName}
        newLabelColor={newLabelColor}
        creatingLabel={creatingLabel}
        onNameChange={setNewLabelName}
        onColorChange={setNewLabelColor}
        onOpenChange={(open) =>
          open
            ? dialogActions.openNewLabelDialog()
            : dialogActions.closeNewLabelDialog()
        }
        onConfirm={createNewLabel}
      />

      <TaskNewProjectDialog
        open={dialogState.newProjectDialogOpen}
        newProjectName={newProjectName}
        creatingProject={creatingProject}
        onNameChange={setNewProjectName}
        onOpenChange={(open) =>
          open
            ? dialogActions.openNewProjectDialog()
            : dialogActions.closeNewProjectDialog()
        }
        onConfirm={createNewProject}
      />

      <TaskCustomDateDialog
        open={dialogState.customDateDialogOpen}
        endDate={task.end_date ?? null}
        isLoading={isLoading}
        onOpenChange={(open) =>
          open
            ? dialogActions.openCustomDateDialog()
            : dialogActions.closeCustomDateDialog()
        }
        onDateChange={handleCustomDateChange}
        onClear={() => {
          handleDueDateChange(null);
          dialogActions.closeCustomDateDialog();
        }}
      />

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
    'closed_at',
    'end_date',
    'start_date',
    'completed_at',
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
  onClearSelection?: () => void;
  onHeight: (height: number) => void;
  optimisticUpdateInProgress?: Set<string>;
  selectedTasks?: Set<string>;
  bulkUpdateCustomDueDate?: (date: Date | null) => Promise<void>;
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
  onClearSelection,
  onHeight,
  optimisticUpdateInProgress,
  selectedTasks,
  bulkUpdateCustomDueDate,
}: MeasuredTaskCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onHeightRef = useRef(onHeight);

  // Keep the ref updated with the latest callback
  useEffect(() => {
    onHeightRef.current = onHeight;
  }, [onHeight]);

  useEffect(() => {
    if (!ref.current) return;
    const node = ref.current;
    // Get the actual card element (first child)
    const card = node.firstElementChild as HTMLElement;
    if (!card) return;

    // Initial measure - use the card's actual height without gaps
    onHeightRef.current(card.getBoundingClientRect().height);

    // Resize observer for dynamic height changes (e.g., label changes)
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === card) {
          onHeightRef.current(entry.contentRect.height);
        }
      }
    });
    ro.observe(card);
    return () => ro.disconnect();
  }, []); // Empty deps - only run once on mount

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
        onClearSelection={onClearSelection}
        optimisticUpdateInProgress={optimisticUpdateInProgress}
        selectedTasks={selectedTasks}
        bulkUpdateCustomDueDate={bulkUpdateCustomDueDate}
      />
    </div>
  );
}
