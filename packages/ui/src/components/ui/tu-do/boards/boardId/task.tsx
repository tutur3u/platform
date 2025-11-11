import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Box,
  Calendar,
  Check,
  CheckCircle2,
  CircleSlash,
  Clock,
  FileText,
  Image as ImageIcon,
  Link2,
  ListTodo,
  MoreHorizontal,
  Play,
  Timer,
  Trash2,
  UserMinus,
  UserStar,
  X,
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTaskActions } from '@tuturuuu/ui/hooks/use-task-actions';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@tuturuuu/ui/hover-card';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { cn } from '@tuturuuu/utils/format';
import {
  useBoardConfig,
  useWorkspaceLabels,
} from '@tuturuuu/utils/task-helper';
import { getDescriptionMetadata } from '@tuturuuu/utils/text-helper';
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
} from '../../utils/taskColorUtils';
import { formatSmartDate } from '../../utils/taskDateUtils';
import { getPriorityIndicator } from '../../utils/taskPriorityUtils';
import {
  TaskDueDateMenu,
  TaskEstimationMenu,
  TaskLabelsMenu,
  TaskMoveMenu,
  TaskPriorityMenu,
  TaskProjectsMenu,
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
}: TaskCardProps) {
  const { wsId } = useParams();

  const [isLoading, setIsLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuGuardUntil, setMenuGuardUntil] = useState(0);

  // Use extracted dialog state management hook
  const { state: dialogState, actions: dialogActions } = useTaskDialogState();
  const { state: dialogStateFromProvider } = useTaskDialogContext();

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
    dialogState.editDialogOpen ||
    dialogState.deleteDialogOpen ||
    dialogState.customDateDialogOpen ||
    dialogState.newLabelDialogOpen ||
    dialogState.newProjectDialogOpen ||
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
  const descriptionMeta = getDescriptionMetadata(task.description);

  // Helper function to get card color classes
  const getCardColorClasses = () =>
    getCardColorClassesUtil(taskList, task.priority);

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
  });

  // Memoize drag handle for performance
  // Removed explicit drag handle – entire card is now draggable for better UX.
  // Keep attributes/listeners to spread onto root interactive area.

  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      // Handle multi-select functionality
      if (isMultiSelectMode) {
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
  const hiddenBadgeNumRef = useRef<HTMLDivElement>(null);
  const descriptionMetaRef = useRef<HTMLDivElement>(null);
  const [visibleBadgeCount, setVisibleBadgeCount] = useState(2);

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
    return badges;
  }, [task, boardConfig, descriptionMeta]);

  // Calculate visible badges based on available width
  useEffect(() => {
    if (!containerRef.current) return;

    const calculateVisibleBadges = () => {
      const container = containerRef.current;
      const hiddenBadgeNum = hiddenBadgeNumRef.current;
      if (!container || !hiddenBadgeNum) return;

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
          count = i + 1;
        } else {
          break;
        }
      }

      // Ensure at least 0 badges are visible
      setVisibleBadgeCount(Math.max(0, count));
    };

    // Initial calculation
    calculateVisibleBadges();

    // Recalculate on resize
    const resizeObserver = new ResizeObserver(calculateVisibleBadges);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, [taskBadges]);

  const visibleBadges = taskBadges.slice(0, visibleBadgeCount);
  const hiddenBadges = taskBadges.slice(visibleBadgeCount);

  return (
    <Card
      data-id={task.id}
      data-task-id={task.id}
      ref={setNodeRef}
      style={style}
      onClick={handleCardClick}
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
            <div className="mb-1 flex items-center gap-2">
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
                      dialogActions.openNewLabelDialog();
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
                    onCreateNewProject={() => {
                      dialogActions.openNewProjectDialog();
                      setMenuOpen(false);
                    }}
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
                          <ScrollArea
                            style={{
                              height: 'min(300px, calc(100vh - 200px))',
                            }}
                          >
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
                      {format(endDate, "MMM dd 'at' h:mm a")}
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
              <div className="flex items-center gap-1 text-dynamic-green">
                <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">
                  Completed{' '}
                  {formatDistanceToNow(new Date(task.completed_at), {
                    addSuffix: true,
                  })}
                </span>
                <span className="ml-1 hidden text-[10px] text-muted-foreground md:inline">
                  {format(new Date(task.completed_at), "MMM dd 'at' h:mm a")}
                </span>
              </div>
            )}
            {taskList?.status === 'closed' && task.closed_at && (
              <div className="flex items-center gap-1 text-dynamic-purple">
                <CircleSlash className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">
                  Closed{' '}
                  {formatDistanceToNow(new Date(task.closed_at), {
                    addSuffix: true,
                  })}
                </span>
                <span className="ml-1 hidden text-[10px] text-muted-foreground md:inline">
                  {format(new Date(task.closed_at), "MMM dd 'at' h:mm a")}
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
            <div
              ref={containerRef}
              className="scrollbar-hide flex w-full items-center gap-1 overflow-auto whitespace-nowrap rounded-lg"
            >
              {visibleBadges.map((badge) => badge.element)}
              {hiddenBadges.length > 0 && (
                <HoverCard openDelay={200}>
                  <HoverCardTrigger asChild>
                    <Badge
                      ref={hiddenBadgeNumRef}
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

              {/* Checkbox: always at far right */}
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
      />
    </div>
  );
}
