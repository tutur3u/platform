'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  CircleSlash,
  Copy,
  ExternalLink,
  Trash2,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useWorkspaceMembers } from '@tuturuuu/ui/hooks/use-workspace-members';
import { cn } from '@tuturuuu/utils/format';
import {
  useBoardConfig,
  useWorkspaceLabels,
} from '@tuturuuu/utils/task-helper';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTaskActions } from '../../../hooks/use-task-actions';
import { Avatar, AvatarFallback, AvatarImage } from '../avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../dropdown-menu';
import { toast } from '../sonner';
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
} from '../tu-do/boards/boardId/menus';
import { TaskCustomDateDialog } from '../tu-do/boards/boardId/task-dialogs/TaskCustomDateDialog';
import { TaskDeleteDialog } from '../tu-do/boards/boardId/task-dialogs/TaskDeleteDialog';
import { TaskNewLabelDialog } from '../tu-do/boards/boardId/task-dialogs/TaskNewLabelDialog';
import { TaskNewProjectDialog } from '../tu-do/boards/boardId/task-dialogs/TaskNewProjectDialog';
import { useTaskCardRelationships } from '../tu-do/hooks/useTaskCardRelationships';
import { useTaskLabelManagement } from '../tu-do/hooks/useTaskLabelManagement';
import { useTaskProjectManagement } from '../tu-do/hooks/useTaskProjectManagement';
import {
  getAssigneeInitials,
  getTicketBadgeColorClasses,
} from '../tu-do/utils/taskColorUtils';
import { getPriorityIcon } from '../tu-do/utils/taskPriorityUtils';
import { TaskSummaryPopover } from './task-summary-popover';

// Extended Task type that includes board_id (denormalized field in database)
interface TaskWithBoardId extends Task {
  board_id: string;
}

interface TaskMentionChipProps {
  entityId: string;
  displayNumber: string;
  avatarUrl?: string | null;
  subtitle?: string | null;
  className?: string;
}

export function TaskMentionChip({
  entityId,
  displayNumber,
  avatarUrl,
  subtitle,
  className,
}: TaskMentionChipProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [menuGuardUntil, setMenuGuardUntil] = useState(0);
  const dropdownTriggerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const supabase = createClient();

  // Dialog states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCustomDateDialog, setShowCustomDateDialog] = useState(false);
  const [showNewLabelDialog, setShowNewLabelDialog] = useState(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);

  // Fetch full task data - load immediately to show priority, assignees, and colors
  const {
    data: task,
    isLoading: taskLoading,
    error: taskError,
  } = useQuery({
    queryKey: ['task', entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select(
          `
          *,
          assignees:task_assignees(
            user_id,
            user:users!inner(
              id,
              display_name,
              avatar_url
            )
          ),
          labels:task_labels(
            label_id,
            label:workspace_task_labels!inner(
              id,
              name,
              color,
              created_at
            )
          ),
          projects:task_project_tasks(
            project_id,
            project:task_projects!inner(
              id,
              name,
              status
            )
          )
        `
        )
        .eq('id', entityId)
        .single();

      if (error) throw error;

      // Transform the data to match TaskWithBoardId type
      return {
        ...data,
        assignees: data.assignees?.map((a: any) => ({
          id: a.user.id,
          user_id: a.user_id,
          display_name: a.user.display_name,
          avatar_url: a.user.avatar_url,
        })),
        labels: data.labels?.map((l: any) => ({
          id: l.label.id,
          name: l.label.name,
          color: l.label.color,
          created_at: l.label.created_at,
        })),
        projects: data.projects?.map((p: any) => ({
          id: p.project.id,
          name: p.project.name,
          status: p.project.status,
        })),
      } as TaskWithBoardId;
    },
    enabled: true, // Always load to show inline metadata
    staleTime: 30000,
    retry: false,
  });

  // Get board config - only fetch when menu opens and we have task data
  const { data: boardConfig } = useBoardConfig(task?.board_id);

  // Fetch workspace labels
  const { data: workspaceLabels = [], isLoading: labelsLoading } =
    useWorkspaceLabels(boardConfig?.ws_id);

  // Fetch workspace projects
  const { data: workspaceProjects = [], isLoading: projectsLoading } = useQuery(
    {
      queryKey: ['task_projects', boardConfig?.ws_id],
      queryFn: async () => {
        if (!boardConfig?.ws_id) return [];
        const { data, error } = await supabase
          .from('task_projects')
          .select('id, name, status')
          .eq('ws_id', boardConfig.ws_id)
          .eq('deleted', false)
          .order('name');

        if (error) throw error;
        return data || [];
      },
      enabled: !!boardConfig?.ws_id && menuOpen,
      staleTime: 10 * 60 * 1000,
    }
  );

  // Fetch workspace members
  const { data: workspaceMembers = [], isLoading: membersLoading } =
    useWorkspaceMembers(boardConfig?.ws_id, {
      enabled: !!boardConfig?.ws_id && menuOpen, // Only needed for editing
    });

  // Fetch available task lists - enable when we have task data to get current list color
  const { data: availableLists = [] } = useQuery({
    queryKey: ['task_lists', task?.board_id],
    queryFn: async () => {
      if (!task?.board_id) return [];
      const { data, error } = await supabase
        .from('task_lists')
        .select('*')
        .eq('board_id', task.board_id)
        .eq('deleted', false)
        .order('position')
        .order('created_at');

      if (error) throw error;
      return data as TaskList[];
    },
    enabled: !!task?.board_id, // Load when we have task data
    staleTime: 10 * 60 * 1000,
  });

  // Get current task's list for color rendering
  const currentTaskList = useMemo(() => {
    if (!task || !availableLists.length) return null;
    return availableLists.find((list) => list.id === task.list_id) || null;
  }, [task, availableLists]);

  // Placeholder task for hooks when task is not loaded yet
  const placeholderTask: Task = useMemo(
    () => ({
      id: entityId,
      name: displayNumber,
      list_id: '',
      display_number: 0,
      created_at: new Date().toISOString(),
    }),
    [entityId, displayNumber]
  );

  // Use label management hook - only when we have task
  const {
    toggleTaskLabel: baseToggleTaskLabel,
    createNewLabel: baseCreateNewLabel,
    labelsSaving,
    newLabelName,
    setNewLabelName,
    newLabelColor,
    setNewLabelColor,
    creatingLabel,
  } = useTaskLabelManagement({
    task: task ?? placeholderTask,
    boardId: task?.board_id || '',
    workspaceLabels,
    workspaceId: boardConfig?.ws_id,
    selectedTasks: undefined,
    isMultiSelectMode: false,
    onClearSelection: undefined,
    taskId: entityId, // Pass entityId to sync individual task cache
  });

  // Use project management hook - only when we have task
  const {
    toggleTaskProject: baseToggleTaskProject,
    projectsSaving,
    newProjectName,
    setNewProjectName,
    creatingProject,
    createNewProject: baseCreateNewProject,
  } = useTaskProjectManagement({
    task: task ?? placeholderTask,
    boardId: task?.board_id || '',
    workspaceProjects,
    workspaceId: boardConfig?.ws_id,
    selectedTasks: undefined,
    isMultiSelectMode: false,
    onClearSelection: undefined,
    taskId: entityId, // Pass entityId to sync individual task cache
  });

  // Use task relationships hook - only when we have task
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
    taskId: task?.id || '',
    boardId: task?.board_id || '',
  });

  const targetCompletionList = useMemo(() => {
    if (!task) return null;
    const doneList = availableLists.find((list) => list.status === 'done');
    const closedList = availableLists.find((list) => list.status === 'closed');
    return doneList || closedList || null;
  }, [availableLists, task]);

  const targetClosedList = useMemo(() => {
    if (!task) return null;
    return availableLists.find((list) => list.status === 'closed') || null;
  }, [availableLists, task]);

  const handleUpdate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['task', entityId] });
    if (task?.board_id) {
      queryClient.invalidateQueries({ queryKey: ['tasks', task.board_id] });
    }
  }, [queryClient, entityId, task?.board_id]);

  // Helper to sync individual task cache with updates
  // Supports both direct updates and functional updates for operations that depend on current state
  const syncTaskCache = useCallback(
    (
      updatesOrFn:
        | Partial<TaskWithBoardId>
        | ((current: TaskWithBoardId) => Partial<TaskWithBoardId>)
    ) => {
      queryClient.setQueryData(
        ['task', entityId],
        (old: TaskWithBoardId | undefined) => {
          if (!old) return old;
          const updates =
            typeof updatesOrFn === 'function' ? updatesOrFn(old) : updatesOrFn;
          return { ...old, ...updates };
        }
      );
    },
    [queryClient, entityId]
  );

  // Use task actions hook - only when we have task
  const {
    handleMoveToCompletion: baseHandleMoveToCompletion,
    handleMoveToClose: baseHandleMoveToClose,
    handleDelete: baseHandleDelete,
    handleMoveToList: baseHandleMoveToList,
    handleDueDateChange: baseHandleDueDateChange,
    handlePriorityChange: baseHandlePriorityChange,
    updateEstimationPoints: baseUpdateEstimationPoints,
    handleCustomDateChange: baseHandleCustomDateChange,
    handleToggleAssignee: baseHandleToggleAssignee,
  } = useTaskActions({
    task: task || undefined,
    boardId: task?.board_id || '',
    targetCompletionList,
    targetClosedList,
    availableLists,
    onUpdate: handleUpdate,
    setIsLoading,
    setMenuOpen,
    setCustomDateDialogOpen: setShowCustomDateDialog,
    setDeleteDialogOpen: setShowDeleteDialog,
    setEstimationSaving: () => {},
    selectedTasks: undefined,
    isMultiSelectMode: false,
    onClearSelection: undefined,
    taskId: entityId, // Pass entityId to sync individual task cache
  });

  // Wrap handlers to also sync individual task cache
  const handleMoveToCompletion = useCallback(async () => {
    if (targetCompletionList) {
      syncTaskCache({
        list_id: targetCompletionList.id,
        closed_at: new Date().toISOString(),
        completed_at:
          targetCompletionList.status === 'done'
            ? new Date().toISOString()
            : task?.completed_at,
      });
    }
    return baseHandleMoveToCompletion();
  }, [
    baseHandleMoveToCompletion,
    syncTaskCache,
    targetCompletionList,
    task?.completed_at,
  ]);

  const handleMoveToClose = useCallback(async () => {
    if (targetClosedList) {
      syncTaskCache({
        list_id: targetClosedList.id,
        closed_at: new Date().toISOString(),
      });
    }
    return baseHandleMoveToClose();
  }, [baseHandleMoveToClose, syncTaskCache, targetClosedList]);

  const handleDelete = useCallback(async () => {
    return baseHandleDelete();
  }, [baseHandleDelete]);

  const handleMoveToList = useCallback(
    async (targetListId: string) => {
      const targetList = availableLists.find((l) => l.id === targetListId);
      const isCompletionList =
        targetList?.status === 'done' || targetList?.status === 'closed';
      const now = new Date().toISOString();
      syncTaskCache({
        list_id: targetListId,
        ...(isCompletionList ? { closed_at: now } : { closed_at: undefined }),
        ...(targetList?.status === 'done'
          ? { completed_at: now }
          : { completed_at: undefined }),
      } as Partial<TaskWithBoardId>);
      return baseHandleMoveToList(targetListId);
    },
    [baseHandleMoveToList, syncTaskCache, availableLists]
  );

  const handleDueDateChange = useCallback(
    async (days: number | null) => {
      let newDate: string | null = null;
      if (days !== null) {
        const target = new Date();
        target.setDate(target.getDate() + days);
        target.setHours(23, 59, 59, 999);
        newDate = target.toISOString();
      }
      syncTaskCache({ end_date: newDate });
      return baseHandleDueDateChange(days);
    },
    [baseHandleDueDateChange, syncTaskCache]
  );

  const handlePriorityChange = useCallback(
    async (newPriority: Parameters<typeof baseHandlePriorityChange>[0]) => {
      syncTaskCache({ priority: newPriority });
      return baseHandlePriorityChange(newPriority);
    },
    [baseHandlePriorityChange, syncTaskCache]
  );

  const updateEstimationPoints = useCallback(
    async (points: number | null) => {
      syncTaskCache({ estimation_points: points });
      return baseUpdateEstimationPoints(points);
    },
    [baseUpdateEstimationPoints, syncTaskCache]
  );

  const handleCustomDateChange = useCallback(
    async (date: Date | undefined) => {
      let newDate: string | null = null;
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
        newDate = selectedDate.toISOString();
      }
      syncTaskCache({ end_date: newDate });
      return baseHandleCustomDateChange(date);
    },
    [baseHandleCustomDateChange, syncTaskCache]
  );

  const [assigneeSaving, setAssigneeSaving] = useState<string | null>(null);

  const handleToggleAssignee = useCallback(
    async (assigneeId: string) => {
      if (!task) return;
      // Base function handles optimistic updates to both caches
      return baseHandleToggleAssignee(assigneeId);
    },
    [baseHandleToggleAssignee, task]
  );

  const onToggleAssignee = useCallback(
    async (assigneeId: string) => {
      if (!handleToggleAssignee) return;
      try {
        setAssigneeSaving(assigneeId);
        await handleToggleAssignee(assigneeId);
      } finally {
        setAssigneeSaving(null);
      }
    },
    [handleToggleAssignee]
  );

  // Wrap label toggle - base function handles all cache updates
  const toggleTaskLabel = useCallback(
    async (labelId: string) => {
      if (!task) return;
      // Base function handles optimistic updates to both caches
      return baseToggleTaskLabel(labelId);
    },
    [baseToggleTaskLabel, task]
  );

  // Wrap project toggle - base function handles all cache updates
  const toggleTaskProject = useCallback(
    async (projectId: string) => {
      if (!task) return;
      // Base function handles optimistic updates to both caches
      return baseToggleTaskProject(projectId);
    },
    [baseToggleTaskProject, task]
  );

  // Wrap create new label - base function handles cache updates
  const createNewLabel = useCallback(async () => {
    // Base function handles optimistic updates to both caches
    return baseCreateNewLabel();
  }, [baseCreateNewLabel]);

  // Wrap create new project - base function handles cache updates
  const createNewProject = useCallback(async () => {
    // Base function handles optimistic updates to both caches
    return baseCreateNewProject();
  }, [baseCreateNewProject]);

  // Guarded select handler for menu items
  const handleMenuItemSelect = useCallback(
    (e: Event, action: () => void) => {
      if (Date.now() < menuGuardUntil) {
        if (e && typeof (e as any).preventDefault === 'function') {
          (e as any).preventDefault();
        }
        return;
      }
      action();
    },
    [menuGuardUntil]
  );

  const getTaskUrl = () => {
    const pathSegments = window.location.pathname.split('/');
    const wsId = pathSegments[1];
    return `${window.location.origin}/${wsId}/tasks/${entityId}`;
  };

  const handleGoToTask = () => {
    window.open(getTaskUrl(), '_blank', 'noopener,noreferrer');
    setMenuOpen(false);
  };

  const handleCopyTaskLink = async () => {
    try {
      await navigator.clipboard.writeText(getTaskUrl());
      toast.success('Task link copied to clipboard');
    } catch {
      toast.error('Failed to copy link');
    }
    setMenuOpen(false);
    setPopoverOpen(false);
  };

  const title = subtitle
    ? `#${displayNumber} • ${subtitle}`
    : `#${displayNumber}`;

  // Get styling based on task list color or priority
  const chipColorClasses = useMemo(() => {
    return getTicketBadgeColorClasses(
      currentTaskList || undefined,
      task?.priority || undefined
    );
  }, [currentTaskList, task?.priority]);

  const chipContent = (
    <span
      data-mention="true"
      data-entity-id={entityId}
      data-entity-type="task"
      data-display-number={displayNumber}
      data-avatar-url={avatarUrl ?? ''}
      data-subtitle={subtitle ?? ''}
      data-priority={task?.priority ?? ''}
      data-list-color={currentTaskList?.color ?? ''}
      title={title}
      contentEditable={false}
      onClick={(e) => {
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        e.preventDefault();
        setPopoverOpen((prev) => !prev);
      }}
      onContextMenu={(e) => {
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        e.preventDefault();
        // Right-click: close popover and open dropdown menu directly
        setPopoverOpen(false);
        setMenuOpen(true);
        setMenuGuardUntil(Date.now() + 300);
      }}
      onAuxClick={(e) => {
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        e.preventDefault();
      }}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 font-medium text-[12px] leading-none transition-colors',
        chipColorClasses,
        'hover:opacity-80',
        className
      )}
    >
      {/* Chip content - updated 2025-12-23 11:52 */}
      {/* Task Number */}
      <span className="font-semibold">#{displayNumber}</span>

      {/* Priority Icon */}
      {task?.priority && (
        <span className="ml-1 flex items-center justify-center">
          {getPriorityIcon(task.priority, 'h-3 w-3')}
        </span>
      )}

      {/* Task Name */}
      {(subtitle || task?.name) && (
        <>
          <span className="opacity-50">•</span>
          <span className='max-w-50 truncate font-medium'>
            {subtitle || task?.name}
          </span>
        </>
      )}

      {/* Assignee Avatars */}
      {task?.assignees && task.assignees.length > 0 && (
        <span className="ml-1 flex -space-x-1">
          {task.assignees.slice(0, 3).map((assignee) => (
            <Avatar
              key={assignee.id}
              className="h-4 w-4 border border-background"
              title={assignee.display_name || 'Unknown'}
            >
              {assignee.avatar_url && (
                <AvatarImage
                  src={assignee.avatar_url}
                  alt={assignee.display_name || 'User'}
                  referrerPolicy="no-referrer"
                />
              )}
              <AvatarFallback className="text-[8px]">
                {getAssigneeInitials(assignee.display_name, null)}
              </AvatarFallback>
            </Avatar>
          ))}
          {task.assignees.length > 3 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full border border-background bg-muted font-medium text-[8px]">
              +{task.assignees.length - 3}
            </span>
          )}
        </span>
      )}
    </span>
  );

  const canMoveToCompletion =
    targetCompletionList && targetCompletionList.id !== task?.list_id;
  const canMoveToClose =
    targetClosedList && targetClosedList.id !== task?.list_id;

  const menuItems = task ? (
    <>
      <DropdownMenuItem onClick={handleGoToTask} className="cursor-pointer">
        <ExternalLink className="mr-2 h-4 w-4" />
        Go to task
      </DropdownMenuItem>

      <DropdownMenuItem onClick={handleCopyTaskLink} className="cursor-pointer">
        <Copy className="mr-2 h-4 w-4" />
        Copy task link
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      {/* Quick Completion Actions */}
      {canMoveToCompletion && (
        <DropdownMenuItem
          onSelect={(e) =>
            handleMenuItemSelect(e as unknown as Event, handleMoveToCompletion)
          }
          className="cursor-pointer"
          disabled={isLoading}
        >
          <CheckCircle2 className="mr-2 h-4 w-4 text-dynamic-green" />
          Mark as {targetCompletionList?.status === 'done' ? 'Done' : 'Closed'}
        </DropdownMenuItem>
      )}

      {canMoveToClose && targetClosedList?.id !== targetCompletionList?.id && (
        <DropdownMenuItem
          onSelect={(e) =>
            handleMenuItemSelect(e as unknown as Event, handleMoveToClose)
          }
          className="cursor-pointer"
          disabled={isLoading}
        >
          <CircleSlash className="mr-2 h-4 w-4 text-dynamic-purple" />
          Mark as Closed
        </DropdownMenuItem>
      )}

      {(canMoveToCompletion || canMoveToClose) && <DropdownMenuSeparator />}

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
          setTimeout(() => setShowCustomDateDialog(true), 100);
        }}
        onMenuItemSelect={handleMenuItemSelect}
        onClose={() => setMenuOpen(false)}
      />

      {/* Estimation Menu */}
      {boardConfig?.estimation_type && (
        <TaskEstimationMenu
          currentPoints={task.estimation_points}
          estimationType={boardConfig.estimation_type}
          extendedEstimation={boardConfig.extended_estimation}
          allowZeroEstimates={boardConfig.allow_zero_estimates}
          isLoading={isLoading}
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
          setShowNewLabelDialog(true);
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
          setShowNewProjectDialog(true);
          setMenuOpen(false);
        }}
        onMenuItemSelect={handleMenuItemSelect}
      />

      <DropdownMenuSeparator />

      {/* Task Relationships Section */}
      {boardConfig?.ws_id && (
        <>
          <TaskParentMenu
            wsId={boardConfig.ws_id}
            taskId={task.id}
            parentTask={parentTask}
            childTaskIds={childTasks.map((t) => t.id)}
            isSaving={relationshipSaving}
            onSetParent={setParentTask}
            onRemoveParent={removeParentTask}
          />

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

      {/* Assignee Menu */}
      {boardConfig?.ws_id && (
        <TaskAssigneesMenu
          taskAssignees={task.assignees || []}
          availableMembers={workspaceMembers}
          isLoading={membersLoading}
          assigneeSaving={assigneeSaving}
          onToggleAssignee={onToggleAssignee}
          onMenuItemSelect={handleMenuItemSelect}
        />
      )}

      <DropdownMenuSeparator />

      <DropdownMenuItem
        onSelect={(e) =>
          handleMenuItemSelect(e as unknown as Event, () => {
            setShowDeleteDialog(true);
            setMenuOpen(false);
          })
        }
        className="cursor-pointer text-dynamic-red focus:text-dynamic-red"
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Delete task
      </DropdownMenuItem>
    </>
  ) : (
    <>
      <button
        type="button"
        onClick={handleGoToTask}
        className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden hover:bg-accent hover:text-accent-foreground"
      >
        <ExternalLink className="h-4 w-4" />
        Go to task
      </button>

      <button
        type="button"
        onClick={handleCopyTaskLink}
        className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden hover:bg-accent hover:text-accent-foreground"
      >
        <Copy className="h-4 w-4" />
        Copy task link
      </button>
    </>
  );

  // Render chip that opens popover, and a separate dropdown menu for editing
  return (
    <div style={{ display: 'inline-flex', position: 'relative' }}>
      <TaskSummaryPopover
        task={task || null}
        taskList={currentTaskList}
        isLoading={taskLoading}
        onEdit={() => {
          setPopoverOpen(false);
          setTimeout(() => setMenuOpen(true), 100);
        }}
        onGoToTask={handleGoToTask}
        open={popoverOpen}
        onOpenChange={setPopoverOpen}
        blockedBy={blockedByTasks as Task[]}
        workspaceId={boardConfig?.ws_id}
      >
        {chipContent}
      </TaskSummaryPopover>

      {/* Dropdown menu for editing */}
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open);
          if (open) {
            setMenuGuardUntil(Date.now() + 300);
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <div
            ref={dropdownTriggerRef}
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              pointerEvents: 'none',
              opacity: 0,
              width: '1px',
              height: '1px',
            }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-56"
          side="bottom"
          sideOffset={8}
          onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
        >
          {taskLoading ? (
            <div className="flex items-center justify-center p-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : taskError ? (
            <div className="flex flex-col items-center gap-2 p-4 text-center text-muted-foreground text-sm">
              <AlertCircle className="h-5 w-5 text-dynamic-red" />
              <span>Failed to load task</span>
              <span className="text-xs opacity-70">
                {taskError instanceof Error
                  ? taskError.message
                  : 'Unknown error'}
              </span>
            </div>
          ) : (
            menuItems
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialogs */}
      {task && (
        <>
          <TaskDeleteDialog
            task={task}
            open={showDeleteDialog}
            isLoading={isLoading}
            onOpenChange={setShowDeleteDialog}
            onConfirm={handleDelete}
          />

          <TaskCustomDateDialog
            open={showCustomDateDialog}
            endDate={task.end_date ?? null}
            isLoading={isLoading}
            onOpenChange={setShowCustomDateDialog}
            onDateChange={handleCustomDateChange}
            onClear={() => {
              handleDueDateChange(null);
              setShowCustomDateDialog(false);
            }}
          />

          <TaskNewLabelDialog
            open={showNewLabelDialog}
            newLabelName={newLabelName}
            newLabelColor={newLabelColor}
            creatingLabel={creatingLabel}
            onNameChange={setNewLabelName}
            onColorChange={setNewLabelColor}
            onOpenChange={setShowNewLabelDialog}
            onConfirm={createNewLabel}
          />

          <TaskNewProjectDialog
            open={showNewProjectDialog}
            newProjectName={newProjectName}
            creatingProject={creatingProject}
            onNameChange={setNewProjectName}
            onOpenChange={setShowNewProjectDialog}
            onConfirm={createNewProject}
          />
        </>
      )}
    </div>
  );
}