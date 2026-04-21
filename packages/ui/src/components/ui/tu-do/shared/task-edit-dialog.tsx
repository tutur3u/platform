'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Editor, JSONContent } from '@tiptap/react';
import {
  checkWorkspacePermission,
  createWorkspaceTask,
  updateWorkspaceCalendarEvent,
  uploadWorkspaceTaskFile,
} from '@tuturuuu/internal-api';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { User } from '@tuturuuu/types/primitives/User';
import { Dialog, DialogContent, DialogTitle } from '@tuturuuu/ui/dialog';
import { useYjsCollaboration } from '@tuturuuu/ui/hooks/use-yjs-collaboration';
import { toast } from '@tuturuuu/ui/sonner';
import { MAX_TASK_DESCRIPTION_LENGTH } from '@tuturuuu/utils/constants';
import { convertListItemToTask } from '@tuturuuu/utils/editor';
import {
  getTicketIdentifier,
  invalidateTaskCaches,
} from '@tuturuuu/utils/task-helper';
import { convertJsonContentToYjsState } from '@tuturuuu/utils/yjs-helper';
import dayjs from 'dayjs';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BoardEstimationConfigDialog } from '../boards/boardId/task-dialogs/BoardEstimationConfigDialog';
import { TaskNewLabelDialog } from '../boards/boardId/task-dialogs/TaskNewLabelDialog';
import { TaskNewProjectDialog } from '../boards/boardId/task-dialogs/TaskNewProjectDialog';
import { useTaskDialogContext } from '../providers/task-dialog-provider';
import { useOptionalWorkspacePresenceContext } from '../providers/workspace-presence-provider';
import { NEW_LABEL_COLOR } from '../utils/taskConstants';
import { getActiveBroadcast } from './board-broadcast-context';
import { DescriptionOverflowWarningDialog } from './description-overflow-warning-dialog';
import { createInitialSuggestionState } from './mention-system/types';
import { SyncWarningDialog } from './sync-warning-dialog';
import { MobileFloatingSaveButton } from './task-edit-dialog/components/mobile-floating-save-button';
import { TaskDescriptionEditor } from './task-edit-dialog/components/task-description-editor';
import { TaskDialogHeader } from './task-edit-dialog/components/task-dialog-header';
import { TaskNameInput } from './task-edit-dialog/components/task-name-input';
import { TaskSuggestionMenus } from './task-edit-dialog/components/task-suggestion-menus';
import { NAME_UPDATE_DEBOUNCE_MS } from './task-edit-dialog/constants';
import { fetchWorkspaceTaskDescription } from './task-edit-dialog/hooks/task-api';
import { useEditorCommands } from './task-edit-dialog/hooks/use-editor-commands';
import { useSuggestionMenus } from './task-edit-dialog/hooks/use-suggestion-menus';
import { useTaskChangeDetection } from './task-edit-dialog/hooks/use-task-change-detection';
import {
  type SharedTaskContext,
  useTaskData,
} from './task-edit-dialog/hooks/use-task-data';
import { useTaskDependencies } from './task-edit-dialog/hooks/use-task-dependencies';
import { useTaskDialogClose } from './task-edit-dialog/hooks/use-task-dialog-close';
import { useTaskDialogKeyboardShortcuts } from './task-edit-dialog/hooks/use-task-dialog-keyboard-shortcuts';
import { useTaskFormReset } from './task-edit-dialog/hooks/use-task-form-reset';
import { useTaskFormState } from './task-edit-dialog/hooks/use-task-form-state';
import { useTaskMutations } from './task-edit-dialog/hooks/use-task-mutations';
import { useTaskRealtimeSync } from './task-edit-dialog/hooks/use-task-realtime-sync';
import { useTaskRelationships } from './task-edit-dialog/hooks/use-task-relationships';
import { useTaskSave } from './task-edit-dialog/hooks/use-task-save';
import { useTaskYjsSync } from './task-edit-dialog/hooks/use-task-yjs-sync';
import { PersonalOverridesSection } from './task-edit-dialog/personal-overrides-section';
import { TaskActivitySection } from './task-edit-dialog/task-activity-section';
import { TaskDeleteDialog } from './task-edit-dialog/task-delete-dialog';
import { TaskInstancesSection } from './task-edit-dialog/task-instances-section';
import { TaskPropertiesSection } from './task-edit-dialog/task-properties-section';
import { TaskRelationshipsProperties } from './task-edit-dialog/task-relationships-properties';
import type { WorkspaceTaskLabel } from './task-edit-dialog/types';
// Re-export relationship types
import type {
  PendingRelationship,
  PendingRelationshipType,
  PendingTaskRelationships,
} from './task-edit-dialog/types/pending-relationship';
import { getSeededPendingTaskRelationships } from './task-edit-dialog/types/pending-relationship';
import {
  broadcastTaskDescriptionUpsert,
  clearDraft,
  getDraftStorageKey,
  getTaskDescriptionPercentLeft,
  getTaskDescriptionStorageLength,
  saveAndVerifyYjsDescriptionToDatabase,
  saveYjsDescriptionToDatabase,
  serializeTaskDescriptionContent,
  shouldPreserveNativeContextMenu,
} from './task-edit-dialog/utils';
import { TaskShareDialog } from './task-share-dialog';
import type { TaskFilters } from './types';
import { UnsavedChangesWarningDialog } from './unsaved-changes-warning-dialog';

export {
  type DialogHeaderInfo,
  getTaskDialogHeaderInfo,
} from './task-edit-dialog/components/task-dialog-header';
export type { PendingRelationship, PendingRelationshipType, SharedTaskContext };

export interface TaskEditDialogProps {
  wsId: string;
  taskWsId?: string;
  task?: Task;
  boardId: string;
  isOpen: boolean;
  /** Present when opened via /shared/task/[shareCode] */
  shareCode?: string;
  /** Permission returned from shared-task API */
  sharedPermission?: 'view' | 'edit';
  availableLists?: TaskList[];
  filters?: TaskFilters;
  mode?: 'edit' | 'create';
  collaborationMode?: boolean;
  /** Whether realtime features (Yjs sync, presence avatars) are enabled - true for all tiers */
  realtimeEnabled?: boolean;
  isPersonalWorkspace?: boolean;
  parentTaskId?: string;
  parentTaskName?: string;
  pendingRelationship?: PendingRelationship;
  currentUser?: {
    id: string;
    display_name?: string;
    email?: string;
    avatar_url?: string;
  };
  /** Pre-loaded data for shared task context - bypasses internal fetches when provided */
  sharedContext?: SharedTaskContext;
  /** Whether draft mode is enabled from user settings */
  draftModeEnabled?: boolean;
  /** When editing an existing draft, this is the draft ID */
  draftId?: string;
  onClose: () => void;
  onUpdate: () => void;
  onNavigateToTask?: (taskId: string) => Promise<void>;
  onAddSubtask?: () => void;
  onAddParentTask?: () => void;
  onAddBlockingTask?: () => void;
  onAddBlockedByTask?: () => void;
  onAddRelatedTask?: () => void;
}

export function TaskEditDialog({
  wsId,
  taskWsId,
  task,
  boardId,
  isOpen,
  shareCode,
  sharedPermission,
  availableLists: propAvailableLists,
  filters,
  mode = 'edit',
  collaborationMode = false,
  realtimeEnabled = false,
  isPersonalWorkspace = false,
  parentTaskId,
  parentTaskName,
  pendingRelationship,
  currentUser: propsCurrentUser,
  sharedContext,
  draftModeEnabled = false,
  draftId,
  onClose,
  onUpdate,
  onNavigateToTask,
  onAddSubtask,
  onAddParentTask,
  onAddBlockingTask,
  onAddBlockedByTask,
  onAddRelatedTask,
}: TaskEditDialogProps) {
  const isCreateMode = mode === 'create';
  const effectiveTaskWsId = !isCreateMode ? (taskWsId ?? wsId) : wsId;
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const t = useTranslations('common');
  const dialogT = useTranslations('ws-task-boards.dialog');
  const { registerCloseRequestHandler } = useTaskDialogContext();

  // Access workspace tier for tier-aware collaboration settings (null outside the provider)
  const presenceCtx = useOptionalWorkspacePresenceContext();
  const workspaceTier = presenceCtx?.tier ?? null;

  // Disable editing if we are viewing via a shared link
  // User requested: always disable editing for shared tasks, regardless of permission
  const disabled = !!shareCode;

  const { data: canManageTaskMedia, isPending: isCheckingTaskMediaPermission } =
    useQuery({
      queryKey: [
        'workspace-permission',
        effectiveTaskWsId,
        'manage_drive_tasks_directory',
      ],
      queryFn: async () => {
        const result = await checkWorkspacePermission(
          effectiveTaskWsId,
          'manage_drive_tasks_directory'
        );
        return result.hasPermission;
      },
      enabled: Boolean(effectiveTaskWsId) && !disabled,
      staleTime: 5 * 60 * 1000,
    });

  // Core loading state
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const formState = useTaskFormState({
    task,
    boardId,
    isOpen,
    isCreateMode,
    isSaving,
  });

  // Refs
  const titleInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const richTextEditorRef = useRef<HTMLDivElement>(null);
  const lastCursorPositionRef = useRef<number | null>(null);
  const targetEditorCursorRef = useRef<number | null>(null);
  const flushEditorPendingRef = useRef<(() => JSONContent | null) | undefined>(
    undefined
  );
  const nameUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNameRef = useRef<string | null>(null);
  const quickDueRef = useRef<(days: number | null) => void>(() => {});
  const updateEstimationRef = useRef<(points: number | null) => void>(() => {});
  const handleConvertToTaskRef = useRef<(() => Promise<void>) | null>(null);
  const descriptionRef = useRef<JSONContent | null>(formState.description);

  useEffect(() => {
    descriptionRef.current = formState.description;
  }, [formState.description]);

  // User state
  const [user, setUser] = useState<User | null>(
    propsCurrentUser
      ? {
          id: propsCurrentUser.id,
          display_name: propsCurrentUser.display_name || null,
          avatar_url: propsCurrentUser.avatar_url || null,
          email: propsCurrentUser.email || null,
        }
      : null
  );

  const userColor = useMemo(() => {
    const hashCode = (str: string) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      return hash;
    };
    const colors = [
      '#3b82f6',
      '#8b5cf6',
      '#ec4899',
      '#f97316',
      '#10b981',
      '#06b6d4',
      '#f59e0b',
      '#6366f1',
    ];
    const userId = user?.id || 'unknown';
    return colors[Math.abs(hashCode(userId)) % colors.length] || colors[0];
  }, [user?.id]);

  // Memoize the user object for Yjs collaboration to prevent unstable references
  // from causing the SupabaseProvider to be destroyed and recreated every render
  const userId = user?.id;
  const userEmail = user?.email;
  const userDisplayName =
    user?.display_name || userEmail?.split('@')[0] || 'Unknown User';

  const yjsUser = useMemo(
    () =>
      userId
        ? {
            id: userId || '',
            name: userDisplayName,
            color: userColor || '',
          }
        : null,
    [userId, userDisplayName, userColor]
  );

  // User task settings
  const { data: userTaskSettings } = useQuery({
    queryKey: ['user-task-settings'],
    queryFn: async () => {
      const res = await fetch('/api/v1/users/task-settings', {
        cache: 'no-store',
      });
      if (!res.ok) return { task_auto_assign_to_self: false };
      return res.json() as Promise<{ task_auto_assign_to_self: boolean }>;
    },
    enabled: isCreateMode && !!user?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const loadTaskDescriptionState = useCallback(async () => {
    if (!task?.id) return null;
    const response = await fetchWorkspaceTaskDescription(
      effectiveTaskWsId,
      task.id
    );
    return response.description_yjs_state ?? null;
  }, [effectiveTaskWsId, task?.id]);

  const saveTaskDescriptionState = useCallback(
    async (yjsState: number[]) => {
      if (!task?.id) return;

      const content =
        flushEditorPendingRef.current?.() ?? descriptionRef.current;
      const serializedDescription = serializeTaskDescriptionContent(content);

      if (
        serializedDescription &&
        serializedDescription.length > MAX_TASK_DESCRIPTION_LENGTH
      ) {
        return;
      }

      const didPersist = await saveYjsDescriptionToDatabase({
        wsId: effectiveTaskWsId,
        taskId: task.id,
        getContent: () => content,
        getYjsState: () => yjsState,
        boardId,
        queryClient,
        context: 'realtime-persist',
      });

      if (!didPersist) return;

      const broadcast = getActiveBroadcast();
      broadcastTaskDescriptionUpsert({
        taskId: task.id,
        descriptionString: serializedDescription,
        broadcast: broadcast ?? undefined,
      });
    },
    [boardId, effectiveTaskWsId, queryClient, task?.id]
  );

  // Yjs collaboration — paid tiers get immediate broadcasts; free tier coalesces rapid edits
  // Note: realtimeEnabled controls Yjs sync (all tiers), collaborationMode controls cursors (paid tiers)
  const { doc, provider, synced, connected } = useYjsCollaboration({
    channel: `task-editor-${task?.id || 'new'}`,
    tableName: 'tasks',
    columnName: 'description_yjs_state',
    id: task?.id || '',
    user: yjsUser,
    enabled: isOpen && !isCreateMode && realtimeEnabled && !!task?.id,
    broadcastDebounceMs: workspaceTier && workspaceTier !== 'FREE' ? 0 : 200,
    saveDebounceMs: 5000,
    loadDocumentState: loadTaskDescriptionState,
    saveDocumentState: saveTaskDescriptionState,
  });

  const [hasHydratedYjsState, setHasHydratedYjsState] = useState(false);

  useEffect(() => {
    if (!isOpen || isCreateMode || !realtimeEnabled || !task?.id) {
      setHasHydratedYjsState(false);
      return;
    }

    if (synced) {
      setHasHydratedYjsState(true);
    }
  }, [isOpen, isCreateMode, realtimeEnabled, task?.id, synced]);

  const isYjsSyncing = useMemo(() => {
    return (
      isOpen &&
      !isCreateMode &&
      realtimeEnabled &&
      !!task?.id &&
      !hasHydratedYjsState &&
      !synced
    );
  }, [
    hasHydratedYjsState,
    isOpen,
    isCreateMode,
    realtimeEnabled,
    task?.id,
    synced,
  ]);

  // Update user when props change
  useEffect(() => {
    if (propsCurrentUser) {
      setUser({
        id: propsCurrentUser.id,
        display_name: propsCurrentUser.display_name || null,
        avatar_url: propsCurrentUser.avatar_url || null,
        email: propsCurrentUser.email || null,
      });
    }
  }, [propsCurrentUser]);

  // Data fetching
  const [taskSearchQuery, setTaskSearchQuery] = useState<string>('');
  const taskSearchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const {
    boardConfig,
    availableLists,
    workspaceLabels,
    workspaceMembers,
    taskProjects,
    workspaceTasks,
    workspaceTasksLoading,
  } = useTaskData({
    wsId: effectiveTaskWsId,
    boardId,
    isOpen,
    propAvailableLists,
    taskSearchQuery,
    sharedContext,
  });

  // Update browser tab title
  useEffect(() => {
    if (!isOpen || isCreateMode || !task) return;
    const originalTitle = document.title;
    document.title = `${getTicketIdentifier(boardConfig?.ticket_prefix, task.display_number)} - ${task.name}`;
    return () => {
      document.title = originalTitle;
    };
  }, [isOpen, isCreateMode, task, boardConfig?.ticket_prefix]);

  // Labels state
  const [availableLabels, setAvailableLabels] = useState<WorkspaceTaskLabel[]>(
    []
  );
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState(NEW_LABEL_COLOR);
  const previousWorkspaceLabelsRef = useRef<string>('');

  useEffect(() => {
    const currentLabelsKey = JSON.stringify(
      workspaceLabels.map((l) => l.id).sort()
    );
    if (previousWorkspaceLabelsRef.current !== currentLabelsKey) {
      previousWorkspaceLabelsRef.current = currentLabelsKey;
      setAvailableLabels(workspaceLabels);
    }
  }, [workspaceLabels]);

  // Projects state
  const [newProjectName, setNewProjectName] = useState('');

  // Editor state
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(true);
  const [descriptionStorageLength, setDescriptionStorageLength] = useState(() =>
    getTaskDescriptionStorageLength(formState.description)
  );
  const descriptionPayloadTooLargeNotifiedRef = useRef(false);
  const closeBlockedByOverflowRef = useRef(false);

  // Dialog states
  const [showNewLabelDialog, setShowNewLabelDialog] = useState(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [showEstimationConfigDialog, setShowEstimationConfigDialog] =
    useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [createMultiple, setCreateMultiple] = useState(false);
  const [showSyncWarning, setShowSyncWarning] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [showDescriptionOverflowWarning, setShowDescriptionOverflowWarning] =
    useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [saveAsDraft, setSaveAsDraft] = useState(draftModeEnabled);
  const [isTitleVisible, setIsTitleVisible] = useState(true);
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(
    null
  );

  // Calendar events state
  const [localCalendarEvents, setLocalCalendarEvents] = useState<
    Task['calendar_events'] | undefined
  >(task?.calendar_events);

  const [lockingEventId, setLockingEventId] = useState<string | null>(null);

  const handleLockToggle = useCallback(
    async (eventId: string, currentLocked: boolean) => {
      setLockingEventId(eventId);
      try {
        await updateWorkspaceCalendarEvent(effectiveTaskWsId, eventId, {
          locked: !currentLocked,
        });

        // Update local state
        setLocalCalendarEvents((prev) =>
          prev?.map((e) =>
            e.id === eventId ? { ...e, locked: !currentLocked } : e
          )
        );

        toast(!currentLocked ? 'Event locked' : 'Event unlocked', {
          description: !currentLocked
            ? 'The auto-scheduler will no longer move this instance.'
            : 'The auto-scheduler can now move this instance.',
        });
      } catch (error) {
        console.error('Failed to update lock status for calendar event', error);
        toast.error('Error', {
          description: 'Failed to update lock status',
        });
      } finally {
        setLockingEventId(null);
      }
    },
    [effectiveTaskWsId]
  );

  useEffect(() => {
    setLocalCalendarEvents(task?.calendar_events);
  }, [task?.calendar_events]);

  const { data: personalScheduleData } = useQuery({
    queryKey: ['task-personal-schedule', task?.id, isOpen],
    enabled: !!isOpen && !isCreateMode && !!task?.id,
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/users/me/tasks/${task!.id}/schedule`,
        { cache: 'no-store' }
      );
      if (!response.ok) return null;
      return (await response.json()) as null | {
        task: {
          total_duration: number | null;
          is_splittable: boolean | null;
          min_split_duration_minutes: number | null;
          max_split_duration_minutes: number | null;
          calendar_hours: any;
          auto_schedule: boolean | null;
        };
        events: Array<{
          id: string;
          title: string;
          start_at: string;
          end_at: string;
          scheduled_minutes: number;
          completed: boolean;
        }>;
      };
    },
    staleTime: 15_000,
  });

  // Sync scheduled events into local state for rendering
  useEffect(() => {
    if (!personalScheduleData?.events) return;
    setLocalCalendarEvents(
      personalScheduleData.events.map((e) => ({
        id: e.id,
        title: e.title,
        start_at: e.start_at,
        end_at: e.end_at,
        scheduled_minutes: e.scheduled_minutes,
        completed: e.completed,
      }))
    );
  }, [personalScheduleData?.events]);

  // Sync "my scheduling settings" into the form state when opening the dialog
  const {
    setTotalDuration,
    setIsSplittable,
    setMinSplitDurationMinutes,
    setMaxSplitDurationMinutes,
    setCalendarHours,
    setAutoSchedule,
    setEndDate,
  } = formState;
  useEffect(() => {
    if (!personalScheduleData?.task || !isOpen || isCreateMode) return;
    setTotalDuration(personalScheduleData.task.total_duration ?? null);
    setIsSplittable(!!personalScheduleData.task.is_splittable);
    setMinSplitDurationMinutes(
      personalScheduleData.task.min_split_duration_minutes ?? null
    );
    setMaxSplitDurationMinutes(
      personalScheduleData.task.max_split_duration_minutes ?? null
    );
    setCalendarHours(personalScheduleData.task.calendar_hours ?? null);
    setAutoSchedule(!!personalScheduleData.task.auto_schedule);
  }, [
    personalScheduleData?.task,
    isOpen,
    isCreateMode,
    setTotalDuration,
    setIsSplittable,
    setMinSplitDurationMinutes,
    setMaxSplitDurationMinutes,
    setCalendarHours,
    setAutoSchedule,
  ]);

  const hasUnsavedSchedulingChanges = useMemo(() => {
    if (isCreateMode) return false;

    const saved = personalScheduleData?.task;
    if (!saved) {
      return (
        formState.totalDuration !== null ||
        formState.isSplittable ||
        formState.minSplitDurationMinutes !== null ||
        formState.maxSplitDurationMinutes !== null ||
        formState.calendarHours !== null ||
        formState.autoSchedule
      );
    }

    return (
      formState.totalDuration !== (saved.total_duration ?? null) ||
      formState.isSplittable !== !!saved.is_splittable ||
      formState.minSplitDurationMinutes !==
        (saved.min_split_duration_minutes ?? null) ||
      formState.maxSplitDurationMinutes !==
        (saved.max_split_duration_minutes ?? null) ||
      formState.calendarHours !== (saved.calendar_hours ?? null) ||
      formState.autoSchedule !== !!saved.auto_schedule
    );
  }, [
    isCreateMode,
    personalScheduleData?.task,
    formState.totalDuration,
    formState.isSplittable,
    formState.minSplitDurationMinutes,
    formState.maxSplitDurationMinutes,
    formState.calendarHours,
    formState.autoSchedule,
  ]);

  const draftStorageKey = getDraftStorageKey(boardId);

  // Suggestion menus
  const suggestionMenus = useSuggestionMenus({
    editorInstance,
    isOpen,
    workspaceMembers,
    boardConfig,
    taskProjects,
    workspaceTasks,
    workspaceTasksLoading,
    wsId: effectiveTaskWsId,
    currentTaskId: task?.id,
    isPersonalWorkspace,
    endDate: formState.endDate,
    priority: formState.priority,
    showAdvancedOptions,
    setShowAdvancedOptions,
  });

  // Change detection
  const { hasUnsavedChanges, canSave, parseDescription } =
    useTaskChangeDetection({
      task,
      name: formState.name,
      description: formState.description,
      priority: formState.priority,
      startDate: formState.startDate,
      endDate: formState.endDate,
      selectedListId: formState.selectedListId,
      estimationPoints: formState.estimationPoints,
      selectedLabels: formState.selectedLabels,
      selectedAssignees: formState.selectedAssignees,
      isCreateMode,
      isLoading,
      collaborationMode,
      draftId,
    });

  // Task mutations
  const {
    updateEstimation,
    updatePriority,
    updateStartDate,
    updateEndDate,
    updateList,
    saveNameToDatabase,
    saveSchedulingSettings,
    schedulingSaving,
  } = useTaskMutations({
    wsId: effectiveTaskWsId,
    taskId: task?.id,
    isCreateMode,
    boardId,
    estimationPoints: formState.estimationPoints ?? null,
    priority: formState.priority,
    selectedListId: formState.selectedListId,
    taskName: task?.name,
    setEstimationPoints: formState.setEstimationPoints,
    setPriority: formState.setPriority,
    setStartDate: formState.setStartDate,
    setEndDate: formState.setEndDate,
    setSelectedListId: formState.setSelectedListId,
    onUpdate,
  });

  // Task relationships
  const {
    toggleLabel,
    toggleAssignee,
    toggleProject,
    handleCreateLabel,
    handleCreateProject,
    creatingLabel,
    creatingProject,
  } = useTaskRelationships({
    wsId: effectiveTaskWsId,
    taskId: task?.id,
    isCreateMode,
    boardId,
    selectedLabels: formState.selectedLabels,
    selectedAssignees: formState.selectedAssignees,
    selectedProjects: formState.selectedProjects,
    newLabelName,
    newLabelColor,
    newProjectName,
    setSelectedLabels: formState.setSelectedLabels,
    setSelectedAssignees: formState.setSelectedAssignees,
    setSelectedProjects: formState.setSelectedProjects,
    setAvailableLabels,
    setNewLabelName,
    setNewLabelColor,
    setNewProjectName,
    setShowNewLabelDialog,
    setShowNewProjectDialog,
    onUpdate,
  });

  const seededPendingRelationships = useMemo<PendingTaskRelationships>(
    () =>
      getSeededPendingTaskRelationships({
        parentTaskId,
        parentTaskName,
        pendingRelationship,
      }),
    [parentTaskId, parentTaskName, pendingRelationship]
  );

  // Task dependencies
  const {
    isLoading: dependenciesLoading,
    parentTask,
    setParentTask,
    childTasks,
    addChildTask,
    blocking: blockingTasks,
    addBlockingTask,
    removeBlockingTask,
    blockedBy: blockedByTasks,
    addBlockedByTask,
    removeBlockedByTask,
    relatedTasks,
    addRelatedTask,
    removeRelatedTask,
    savingRelationship,
    pendingRelationships,
  } = useTaskDependencies({
    taskId: task?.id,
    boardId,
    wsId: effectiveTaskWsId,
    listId: task?.list_id,
    isCreateMode,
    initialPendingRelationships: seededPendingRelationships,
    onUpdate,
  });

  // Realtime sync
  useTaskRealtimeSync({
    wsId: effectiveTaskWsId,
    taskWorkspaceId: taskWsId,
    taskId: task?.id,
    isCreateMode,
    isOpen,
    name: formState.name,
    description: formState.description,
    priority: formState.priority,
    startDate: formState.startDate,
    endDate: formState.endDate,
    estimationPoints: formState.estimationPoints,
    selectedListId: formState.selectedListId,
    pendingNameRef,
    setName: formState.setName,
    setDescription: formState.setDescription,
    setPriority: formState.setPriority,
    setStartDate: formState.setStartDate,
    collaborationMode,

    setEndDate: formState.setEndDate,
    setEstimationPoints: formState.setEstimationPoints,
    setSelectedListId: formState.setSelectedListId,
    setSelectedLabels: formState.setSelectedLabels,
    setSelectedAssignees: formState.setSelectedAssignees,
    setSelectedProjects: formState.setSelectedProjects,
    disabled,
  });

  // Form reset
  useTaskFormReset({
    isOpen,
    isCreateMode,
    task,
    filters,
    setName: formState.setName,
    setDescription: formState.setDescription,
    setPriority: formState.setPriority,
    setStartDate: formState.setStartDate,
    setEndDate: formState.setEndDate,
    setSelectedListId: formState.setSelectedListId,
    setEstimationPoints: formState.setEstimationPoints,
    setSelectedLabels: formState.setSelectedLabels,
    setSelectedAssignees: formState.setSelectedAssignees,
    setSelectedProjects: formState.setSelectedProjects,
  });

  // Yjs sync
  useTaskYjsSync({
    taskId: task?.id,
    wsId: effectiveTaskWsId,
    boardId,
    isOpen,
    isCreateMode,
    realtimeEnabled,
    description: formState.description,
    editorInstance,
    doc,
    queryClient,
    flushEditorPendingRef,
  });

  useEffect(() => {
    setDescriptionStorageLength(
      getTaskDescriptionStorageLength(formState.description)
    );
  }, [formState.description]);

  const handleDescriptionStorageLengthChange = useCallback((length: number) => {
    setDescriptionStorageLength((currentLength) =>
      currentLength === length ? currentLength : length
    );
  }, []);

  const isDescriptionOverLimit =
    descriptionStorageLength > MAX_TASK_DESCRIPTION_LENGTH;
  const descriptionPercentLeft = getTaskDescriptionPercentLeft(
    descriptionStorageLength,
    MAX_TASK_DESCRIPTION_LENGTH
  );

  const showDescriptionPayloadTooLargeToast = useCallback(() => {
    const title = dialogT.has('description_payload_too_large_title')
      ? dialogT('description_payload_too_large_title')
      : 'Description payload is too large';
    const description = dialogT.has('description_payload_too_large_description')
      ? dialogT('description_payload_too_large_description')
      : 'This description is too large to sync. Please shorten it or split it into smaller documents.';

    toast.error(title, { description });
  }, [dialogT]);

  useEffect(() => {
    if (!isOpen) {
      descriptionPayloadTooLargeNotifiedRef.current = false;
      return;
    }

    if (!isDescriptionOverLimit) {
      descriptionPayloadTooLargeNotifiedRef.current = false;
      return;
    }

    if (descriptionPayloadTooLargeNotifiedRef.current) return;

    descriptionPayloadTooLargeNotifiedRef.current = true;
    showDescriptionPayloadTooLargeToast();
  }, [isDescriptionOverLimit, isOpen, showDescriptionPayloadTooLargeToast]);

  // Quick due date handler
  const handleQuickDueDate = useCallback(
    (days: number | null) => {
      const newDate =
        days !== null
          ? dayjs().add(days, 'day').endOf('day').toDate()
          : undefined;
      setEndDate(newDate);
      if (!isCreateMode) updateEndDate(newDate);
    },
    [isCreateMode, setEndDate, updateEndDate]
  );

  // Name update handlers
  const updateName = useCallback(
    (newName: string) => {
      if (nameUpdateTimerRef.current) clearTimeout(nameUpdateTimerRef.current);
      pendingNameRef.current = newName;
      nameUpdateTimerRef.current = setTimeout(() => {
        saveNameToDatabase(newName);
        pendingNameRef.current = null;
        nameUpdateTimerRef.current = null;
      }, NAME_UPDATE_DEBOUNCE_MS);
    },
    [saveNameToDatabase]
  );

  const flushNameUpdate = useCallback(async () => {
    if (nameUpdateTimerRef.current) {
      clearTimeout(nameUpdateTimerRef.current);
      nameUpdateTimerRef.current = null;
    }
    if (pendingNameRef.current) {
      await saveNameToDatabase(pendingNameRef.current);
      pendingNameRef.current = null;
    }
  }, [saveNameToDatabase]);

  // Image upload handler
  const handleImageUpload = useCallback(
    async (file: File): Promise<string> => {
      if (!effectiveTaskWsId) {
        throw new Error(t('error'));
      }
      if (canManageTaskMedia === false) {
        throw new Error(t('insufficient_permissions'));
      }
      try {
        const uploadResult = await uploadWorkspaceTaskFile(
          effectiveTaskWsId,
          file,
          { taskId: task?.id }
        );

        const query = new URLSearchParams({ path: uploadResult.path });
        if (task?.id) {
          query.set('taskId', task.id);
        }

        return `/api/v1/workspaces/${encodeURIComponent(effectiveTaskWsId)}/storage/share?${query.toString()}`;
      } catch (error) {
        const message = error instanceof Error ? error.message : t('error');
        toast.error(t('error'), { description: message });
        throw error;
      }
    },
    [canManageTaskMedia, effectiveTaskWsId, task?.id, t]
  );

  const imageUploadHandler =
    !effectiveTaskWsId ||
    isCheckingTaskMediaPermission ||
    canManageTaskMedia === false
      ? undefined
      : handleImageUpload;

  const handleEstimationConfigSuccess = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: ['board-config', boardId],
    });
    await invalidateTaskCaches(queryClient, boardId);
    onUpdate();
  }, [queryClient, boardId, onUpdate]);

  // Editor commands
  const { executeSlashCommand, insertMentionOption, handleCustomDateSelect } =
    useEditorCommands({
      editorInstance,
      slashState: suggestionMenus.slashState,
      mentionState: suggestionMenus.mentionState,
      includeTime: suggestionMenus.includeTime,
      selectedHour: suggestionMenus.selectedHour,
      selectedMinute: suggestionMenus.selectedMinute,
      selectedPeriod: suggestionMenus.selectedPeriod,
      handleQuickDueDate,
      setPriority: formState.setPriority,
      setShowAdvancedOptions,
      setShowCustomDatePicker: suggestionMenus.setShowCustomDatePicker,
      setCustomDate: suggestionMenus.setCustomDate,
      setIncludeTime: suggestionMenus.setIncludeTime,
      setSelectedHour: suggestionMenus.setSelectedHour,
      setSelectedMinute: suggestionMenus.setSelectedMinute,
      setSelectedPeriod: suggestionMenus.setSelectedPeriod,
      closeSlashMenu: suggestionMenus.closeSlashMenu,
      closeMentionMenu: suggestionMenus.closeMentionMenu,
      handleConvertToTaskRef,
    });

  // Convert to task handler
  const handleConvertToTask = useCallback(async () => {
    if (!editorInstance || !boardId || !availableLists) return;
    const firstList = availableLists[0];
    if (!firstList) {
      toast.error('No lists available', {
        description: 'Create a list first before converting items to tasks',
      });
      return;
    }

    // Store the created task to add to cache later
    let createdTask: Task | null = null;

    const result = await convertListItemToTask({
      editor: editorInstance,
      listId: firstList.id,
      listName: firstList.name,
      wrapInParagraph: false,
      createTask: async ({
        name,
        listId,
      }: {
        name: string;
        listId: string;
      }) => {
        const response = await createWorkspaceTask(effectiveTaskWsId, {
          name,
          listId,
        });
        const newTask = response.task;
        if (!newTask) {
          throw new Error('Failed to create task');
        }

        // Store full task for cache update
        createdTask = {
          ...newTask,
          assignees: [],
          labels: [],
          projects: [],
        } as Task;

        return {
          id: newTask.id,
          name: newTask.name,
          display_number: newTask.display_number ?? undefined,
        };
      },
    });
    if (!result.success) {
      toast.error(result.error!.message, {
        description: result.error!.description,
      });
      return;
    }

    // CRITICAL: Flush the debounced editor change immediately after inserting the mention.
    // Without this, the editor's onChange is debounced (500ms delay), and any re-render
    // during that window causes the editor to sync back to stale content, erasing the mention.
    // This ensures the React state (description) is updated BEFORE any cache invalidations.
    if (flushEditorPendingRef.current) {
      flushEditorPendingRef.current();
    }

    // Add the new task to the cache directly instead of relying on realtime
    // This ensures the task appears immediately in personal workspaces (no realtime)
    // and avoids full-board refetch flickering
    if (createdTask) {
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return [createdTask];
          // Check if task already exists (from realtime), if so don't duplicate
          if (old.some((t) => t.id === createdTask!.id)) return old;
          return [...old, createdTask];
        }
      );
    }

    // Only invalidate time tracking data since task availability affects it
    await queryClient.invalidateQueries({
      queryKey: ['time-tracking-data'],
    });

    toast('Task created', {
      description: `Created task "${result.taskName}" and added mention`,
    });
  }, [editorInstance, boardId, availableLists, queryClient, effectiveTaskWsId]);

  // Save handler
  // Transform user for save hook (ensure id is string if present)
  const userForSave = useMemo(() => {
    if (!user?.id) return null;
    return {
      id: user.id,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
    };
  }, [user?.id, user?.display_name, user?.avatar_url]);

  const { handleSave, handleSaveRef } = useTaskSave({
    wsId: effectiveTaskWsId,
    boardId,
    taskId: task?.id,
    saveAsDraft: isCreateMode && (!!draftId || saveAsDraft),
    draftId,
    isCreateMode,
    collaborationMode,
    isPersonalWorkspace,
    shareCode,
    sharedPermission,
    parentTaskId,
    pendingRelationship,
    pendingTaskRelationships: pendingRelationships,
    draftStorageKey,
    name: formState.name,
    description: formState.description,
    editorInstance,
    priority: formState.priority,
    startDate: formState.startDate,
    endDate: formState.endDate,
    selectedListId: formState.selectedListId,
    estimationPoints: formState.estimationPoints,
    selectedLabels: formState.selectedLabels,
    selectedAssignees: formState.selectedAssignees,
    selectedProjects: formState.selectedProjects,
    totalDuration: formState.totalDuration,
    isSplittable: formState.isSplittable,
    minSplitDurationMinutes: formState.minSplitDurationMinutes,
    maxSplitDurationMinutes: formState.maxSplitDurationMinutes,
    calendarHours: formState.calendarHours,
    autoSchedule: formState.autoSchedule,
    saveSchedulingSettings,
    hasUnsavedSchedulingChanges,
    user: userForSave,
    userTaskSettings,
    createMultiple,
    nameUpdateTimerRef,
    pendingNameRef,
    flushEditorPendingRef,
    queryClient,
    onUpdate,
    onClose,
    setIsSaving,
    setIsLoading,
    setName: formState.setName,
    setDescription: formState.setDescription,
    setPriority: formState.setPriority,
    setStartDate: formState.setStartDate,
    setEndDate: formState.setEndDate,
    setEstimationPoints: formState.setEstimationPoints,
    setSelectedLabels: formState.setSelectedLabels,
    setSelectedAssignees: formState.setSelectedAssignees,
    setSelectedProjects: formState.setSelectedProjects,
  });

  const persistTaskDescriptionOnClose = useCallback(async () => {
    if (isCreateMode || !task?.id || !flushEditorPendingRef.current) {
      return true;
    }

    closeBlockedByOverflowRef.current = false;

    const currentContent = flushEditorPendingRef.current();
    const currentSerializedDescription =
      serializeTaskDescriptionContent(currentContent) ?? null;

    if (
      currentSerializedDescription &&
      currentSerializedDescription.length > MAX_TASK_DESCRIPTION_LENGTH
    ) {
      closeBlockedByOverflowRef.current = true;
      setShowDescriptionOverflowWarning(true);
      return false;
    }

    const initialSerializedDescription =
      serializeTaskDescriptionContent(parseDescription(task.description)) ??
      null;

    if (currentSerializedDescription === initialSerializedDescription) {
      return true;
    }

    const yjsState =
      currentContent && editorInstance?.schema
        ? Array.from(
            convertJsonContentToYjsState(currentContent, editorInstance.schema)
          )
        : null;

    return saveAndVerifyYjsDescriptionToDatabase({
      wsId: effectiveTaskWsId,
      taskId: task.id,
      getContent: () => currentContent,
      getYjsState: () => yjsState,
      boardId,
      queryClient,
      context: 'close',
    });
  }, [
    isCreateMode,
    task?.id,
    task?.description,
    effectiveTaskWsId,
    editorInstance,
    boardId,
    parseDescription,
    queryClient,
  ]);

  const hasPendingRealtimeDescriptionChanges = useCallback(() => {
    if (isCreateMode || !task?.id || !flushEditorPendingRef.current) {
      return false;
    }

    const currentContent = flushEditorPendingRef.current();
    const currentSerializedDescription =
      serializeTaskDescriptionContent(currentContent) ?? null;

    if (
      currentSerializedDescription &&
      currentSerializedDescription.length > MAX_TASK_DESCRIPTION_LENGTH
    ) {
      return false;
    }

    const initialSerializedDescription =
      serializeTaskDescriptionContent(parseDescription(task.description)) ??
      null;

    return currentSerializedDescription !== initialSerializedDescription;
  }, [isCreateMode, parseDescription, task?.description, task?.id]);

  // Close handlers
  const { handleClose, handleForceClose, handleNavigateBack, handleCloseRef } =
    useTaskDialogClose({
      taskId: task?.id,
      isCreateMode,
      collaborationMode,
      synced,
      connected,
      draftStorageKey,
      parentTaskId,
      pendingRelationship,
      onClose,
      onNavigateToTask,
      flushNameUpdate,
      persistTaskDescription: persistTaskDescriptionOnClose,
      hasPendingRealtimeDescriptionChanges,
      onCloseBlocked: () => {
        if (closeBlockedByOverflowRef.current) {
          return;
        }

        const closeFailedTitle = dialogT.has('description_close_failed_title')
          ? dialogT('description_close_failed_title')
          : 'Task description is still syncing';
        const closeFailedDescription = dialogT.has(
          'description_close_failed_description'
        )
          ? dialogT('description_close_failed_description')
          : 'The latest description changes have not been confirmed on the server yet. Keep the dialog open and try again.';

        toast.error(closeFailedTitle, {
          description: closeFailedDescription,
        });
      },
      setShowSyncWarning,
    });

  // Attempt close — intercepts in create mode with unsaved changes
  const handleAttemptClose = useCallback(() => {
    if (isCreateMode && hasUnsavedChanges && formState.name.trim()) {
      setShowUnsavedWarning(true);
      return;
    }
    handleClose();
  }, [isCreateMode, hasUnsavedChanges, formState.name, handleClose]);

  const handleConfirmCloseWithOverflow = useCallback(async () => {
    closeBlockedByOverflowRef.current = false;
    setShowDescriptionOverflowWarning(false);

    await flushNameUpdate();

    if (!isCreateMode) {
      clearDraft(draftStorageKey);
    }

    onClose();
  }, [flushNameUpdate, isCreateMode, draftStorageKey, onClose]);

  // Dialog open change - prevents close when menus are open
  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      if (
        !open &&
        !suggestionMenus.showCustomDatePicker &&
        !suggestionMenus.slashState.open &&
        !suggestionMenus.mentionState.open
      ) {
        handleAttemptClose();
      }
    },
    [
      suggestionMenus.showCustomDatePicker,
      suggestionMenus.slashState.open,
      suggestionMenus.mentionState.open,
      handleAttemptClose,
    ]
  );

  useEffect(() => {
    if (!isOpen) {
      registerCloseRequestHandler(null);
      return;
    }

    registerCloseRequestHandler(() => {
      handleAttemptClose();
    });

    return () => {
      registerCloseRequestHandler(null);
    };
  }, [handleAttemptClose, isOpen, registerCloseRequestHandler]);

  // Unsaved changes warning handlers
  const handleWarningDiscard = useCallback(() => {
    setShowUnsavedWarning(false);
    handleClose();
  }, [handleClose]);

  const handleWarningSaveAsDraft = useCallback(() => {
    setShowUnsavedWarning(false);
    setSaveAsDraft(true);
    // Wait for React to re-render with updated saveAsDraft before triggering save
    setTimeout(() => handleSaveRef.current(), 0);
  }, [handleSaveRef]);

  const handleWarningCreateTask = useCallback(() => {
    setShowUnsavedWarning(false);
    setSaveAsDraft(false);
    // Wait for React to re-render with updated saveAsDraft before triggering save
    setTimeout(() => handleSaveRef.current(), 0);
  }, [handleSaveRef]);

  const handleEditorReady = useCallback((editor: Editor) => {
    setEditorInstance(editor);
  }, []);

  // Navigate to a collaborator's cursor position in the editor.
  // The CollaborationCaret extension renders `<span class="collaboration-carets__label">`
  // with the user's display name. We match by name and scroll it into view.
  const scrollToUserCursor = useCallback(
    (_userId: string, displayName: string) => {
      if (!editorInstance) return;

      // Search inside the ProseMirror editor DOM for caret labels
      const labels = editorInstance.view.dom.querySelectorAll(
        '.collaboration-carets__label'
      );
      for (const label of labels) {
        if (label.textContent?.trim() === displayName) {
          // Scroll the parent caret element into view (the label is positioned absolute)
          const caret = label.closest('.collaboration-carets__caret');
          (caret ?? label).scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
          // Briefly flash the label so the user spots it
          const el = label as HTMLElement;
          el.style.opacity = '1';
          el.style.animation = 'none';
          setTimeout(() => {
            el.style.animation = '';
          }, 2000);
          return;
        }
      }
    },
    [editorInstance]
  );

  // Keyboard shortcuts
  const hasUnsavedChangesRef = useRef<boolean>(false);
  hasUnsavedChangesRef.current = hasUnsavedChanges;

  useTaskDialogKeyboardShortcuts({
    isOpen,
    canSave,
    isCreateMode,
    collaborationMode,
    disabled,
    editorInstance,
    boardConfig,
    slashState: suggestionMenus.slashState,
    filteredSlashCommands: suggestionMenus.filteredSlashCommands,
    slashHighlightIndex: suggestionMenus.slashHighlightIndex,
    setSlashHighlightIndex: suggestionMenus.setSlashHighlightIndex,
    mentionState: suggestionMenus.mentionState,
    filteredMentionOptions: suggestionMenus.filteredMentionOptions,
    mentionHighlightIndex: suggestionMenus.mentionHighlightIndex,
    setMentionHighlightIndex: suggestionMenus.setMentionHighlightIndex,
    showCustomDatePicker: suggestionMenus.showCustomDatePicker,
    setShowCustomDatePicker: suggestionMenus.setShowCustomDatePicker,
    setCustomDate: suggestionMenus.setCustomDate,
    handleSaveRef,
    handleCloseRef,
    hasUnsavedChangesRef,
    quickDueRef,
    updateEstimationRef,
    setPriority: formState.setPriority,
    setShowAdvancedOptions,
    executeSlashCommand,
    insertMentionOption,
    closeSlashMenu: suggestionMenus.closeSlashMenu,
    closeMentionMenu: suggestionMenus.closeMentionMenu,
  });

  // Auto-close sync warning
  useEffect(() => {
    if (showSyncWarning && synced && connected) {
      const timer = setTimeout(async () => {
        setShowSyncWarning(false);
        await handleClose();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [showSyncWarning, synced, connected, handleClose]);

  // Sync saveAsDraft with user setting when dialog opens (always on when editing a draft)
  useEffect(() => {
    if (isOpen) {
      setSaveAsDraft(!!draftId || draftModeEnabled);
    }
  }, [isOpen, draftModeEnabled, draftId]);

  // Track whether the title input is scrolled out of view
  useEffect(() => {
    const el = titleInputRef.current;
    if (!el || !scrollContainer || !isOpen) {
      setIsTitleVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setIsTitleVisible(!!entry?.isIntersecting),
      { root: scrollContainer, threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isOpen, scrollContainer]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      if (nameUpdateTimerRef.current) {
        clearTimeout(nameUpdateTimerRef.current);
        nameUpdateTimerRef.current = null;
        pendingNameRef.current = null;
      }
      suggestionMenus.setSlashState(createInitialSuggestionState());
      suggestionMenus.setMentionState(createInitialSuggestionState());
      setEditorInstance(null);
      suggestionMenus.setSlashHighlightIndex(0);
      suggestionMenus.setMentionHighlightIndex(0);
      suggestionMenus.setShowCustomDatePicker(false);
      suggestionMenus.setCustomDate(undefined);
      suggestionMenus.setIncludeTime(false);
      suggestionMenus.setSelectedHour('11');
      suggestionMenus.setSelectedMinute('59');
      suggestionMenus.setSelectedPeriod('PM');
    }
  }, [isOpen, suggestionMenus]);

  // Task search debouncing
  useEffect(() => {
    if (!isOpen || !effectiveTaskWsId || !suggestionMenus.mentionState.open) {
      if (taskSearchQuery) setTaskSearchQuery('');
      return;
    }
    const query = suggestionMenus.mentionState.query.trim();
    if (taskSearchDebounceRef.current)
      clearTimeout(taskSearchDebounceRef.current);
    taskSearchDebounceRef.current = setTimeout(() => {
      if (query !== taskSearchQuery) setTaskSearchQuery(query);
    }, 300);
    return () => {
      if (taskSearchDebounceRef.current)
        clearTimeout(taskSearchDebounceRef.current);
    };
  }, [
    isOpen,
    effectiveTaskWsId,
    suggestionMenus.mentionState.open,
    suggestionMenus.mentionState.query,
    taskSearchQuery,
  ]);

  // Update refs
  quickDueRef.current = handleQuickDueDate;
  updateEstimationRef.current = updateEstimation;
  handleConvertToTaskRef.current = handleConvertToTask;

  return (
    <>
      <TaskSuggestionMenus
        slashState={suggestionMenus.slashState}
        filteredSlashCommands={suggestionMenus.filteredSlashCommands}
        slashHighlightIndex={suggestionMenus.slashHighlightIndex}
        setSlashHighlightIndex={suggestionMenus.setSlashHighlightIndex}
        slashListRef={suggestionMenus.slashListRef}
        mentionState={suggestionMenus.mentionState}
        filteredMentionOptions={suggestionMenus.filteredMentionOptions}
        mentionHighlightIndex={suggestionMenus.mentionHighlightIndex}
        setMentionHighlightIndex={suggestionMenus.setMentionHighlightIndex}
        mentionListRef={suggestionMenus.mentionListRef}
        workspaceTasksLoading={workspaceTasksLoading}
        showCustomDatePicker={suggestionMenus.showCustomDatePicker}
        setShowCustomDatePicker={suggestionMenus.setShowCustomDatePicker}
        customDate={suggestionMenus.customDate}
        setCustomDate={suggestionMenus.setCustomDate}
        includeTime={suggestionMenus.includeTime}
        setIncludeTime={suggestionMenus.setIncludeTime}
        selectedHour={suggestionMenus.selectedHour}
        setSelectedHour={suggestionMenus.setSelectedHour}
        selectedMinute={suggestionMenus.selectedMinute}
        setSelectedMinute={suggestionMenus.setSelectedMinute}
        selectedPeriod={suggestionMenus.selectedPeriod}
        setSelectedPeriod={suggestionMenus.setSelectedPeriod}
        executeSlashCommand={executeSlashCommand}
        insertMentionOption={insertMentionOption}
        handleCustomDateSelect={handleCustomDateSelect}
      />

      <Dialog open={isOpen} onOpenChange={handleDialogOpenChange} modal={true}>
        <DialogContent
          showCloseButton={false}
          className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom-2 data-[state=open]:slide-in-from-bottom-2 inset-0! top-0! left-0! flex h-screen max-h-screen w-screen max-w-none! translate-x-0! translate-y-0! gap-0 rounded-none! border-0 p-0"
          onContextMenu={(e) => {
            if (shouldPreserveNativeContextMenu(e.target)) {
              return;
            }

            e.preventDefault();
            e.stopPropagation();
          }}
          onPointerDownOutside={(e) => {
            if (
              suggestionMenus.showCustomDatePicker ||
              suggestionMenus.slashState.open ||
              suggestionMenus.mentionState.open
            )
              e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (
              suggestionMenus.showCustomDatePicker ||
              suggestionMenus.slashState.open ||
              suggestionMenus.mentionState.open
            )
              e.preventDefault();
          }}
        >
          <div className="flex min-w-0 flex-1 flex-col bg-background transition-all duration-300">
            {disabled && (
              <DialogTitle className="sr-only">Task Details</DialogTitle>
            )}
            {!disabled && (
              <TaskDialogHeader
                isCreateMode={isCreateMode}
                collaborationMode={collaborationMode}
                realtimeEnabled={realtimeEnabled}
                isOpen={isOpen}
                synced={synced}
                connected={connected}
                taskId={task?.id}
                parentTaskId={parentTaskId}
                parentTaskName={parentTaskName}
                pendingRelationship={pendingRelationship}
                saveAsDraft={saveAsDraft}
                setSaveAsDraft={setSaveAsDraft}
                draftId={draftId}
                isTitleVisible={isTitleVisible}
                taskName={formState.name}
                ticketPrefix={boardConfig?.ticket_prefix}
                displayNumber={task?.display_number}
                user={
                  user
                    ? {
                        id: user.id || '',
                        display_name: user.display_name ?? null,
                        avatar_url: user.avatar_url ?? null,
                        email: user.email ?? null,
                      }
                    : null
                }
                createMultiple={createMultiple}
                hasDraft={formState.hasDraft}
                wsId={effectiveTaskWsId}
                boardId={boardId}
                pathname={pathname}
                canSave={canSave && !isDescriptionOverLimit}
                isLoading={isLoading}
                setCreateMultiple={setCreateMultiple}
                handleClose={handleAttemptClose}
                setShowDeleteConfirm={setShowDeleteConfirm}
                clearDraftState={formState.clearDraftState}
                handleSave={handleSave}
                onNavigateBack={
                  isCreateMode && (pendingRelationship || parentTaskId)
                    ? handleNavigateBack
                    : undefined
                }
                isPersonalWorkspace={isPersonalWorkspace}
                onOpenShareDialog={
                  !isCreateMode && task?.id
                    ? () => setShowShareDialog(true)
                    : undefined
                }
                disabled={disabled}
                onScrollToUserCursor={
                  collaborationMode ? scrollToUserCursor : undefined
                }
              />
            )}

            <div
              ref={setScrollContainer}
              className="relative flex min-h-0 flex-1 flex-col overflow-y-auto"
            >
              <div className="flex flex-col">
                <TaskNameInput
                  name={formState.name}
                  isCreateMode={isCreateMode}
                  titleInputRef={titleInputRef}
                  editorRef={editorRef}
                  lastCursorPositionRef={lastCursorPositionRef}
                  targetEditorCursorRef={targetEditorCursorRef}
                  setName={formState.setName}
                  updateName={updateName}
                  flushNameUpdate={flushNameUpdate}
                  disabled={disabled}
                />

                {!disabled && (
                  <TaskPropertiesSection
                    wsId={effectiveTaskWsId}
                    boardId={boardId}
                    taskId={task?.id}
                    priority={formState.priority}
                    startDate={formState.startDate}
                    endDate={formState.endDate}
                    estimationPoints={formState.estimationPoints}
                    selectedLabels={formState.selectedLabels}
                    selectedProjects={formState.selectedProjects}
                    selectedListId={formState.selectedListId}
                    selectedAssignees={formState.selectedAssignees}
                    isLoading={isLoading}
                    isPersonalWorkspace={isPersonalWorkspace}
                    totalDuration={formState.totalDuration}
                    isSplittable={formState.isSplittable}
                    minSplitDurationMinutes={formState.minSplitDurationMinutes}
                    maxSplitDurationMinutes={formState.maxSplitDurationMinutes}
                    calendarHours={formState.calendarHours}
                    autoSchedule={formState.autoSchedule}
                    availableLists={availableLists}
                    availableLabels={availableLabels}
                    taskProjects={taskProjects}
                    workspaceMembers={workspaceMembers}
                    boardConfig={boardConfig}
                    onPriorityChange={updatePriority}
                    onStartDateChange={updateStartDate}
                    onEndDateChange={updateEndDate}
                    onEstimationChange={updateEstimation}
                    onLabelToggle={toggleLabel}
                    onProjectToggle={toggleProject}
                    onListChange={updateList}
                    onAssigneeToggle={toggleAssignee}
                    onQuickDueDate={handleQuickDueDate}
                    onShowNewLabelDialog={() => setShowNewLabelDialog(true)}
                    onShowNewProjectDialog={() => setShowNewProjectDialog(true)}
                    onShowEstimationConfigDialog={() =>
                      setShowEstimationConfigDialog(true)
                    }
                    onTotalDurationChange={formState.setTotalDuration}
                    onIsSplittableChange={formState.setIsSplittable}
                    onMinSplitDurationChange={
                      formState.setMinSplitDurationMinutes
                    }
                    onMaxSplitDurationChange={
                      formState.setMaxSplitDurationMinutes
                    }
                    onCalendarHoursChange={formState.setCalendarHours}
                    onAutoScheduleChange={formState.setAutoSchedule}
                    isCreateMode={isCreateMode}
                    savedSchedulingSettings={
                      personalScheduleData?.task
                        ? {
                            totalDuration:
                              personalScheduleData.task.total_duration ?? null,
                            isSplittable:
                              !!personalScheduleData.task.is_splittable,
                            minSplitDurationMinutes:
                              personalScheduleData.task
                                .min_split_duration_minutes ?? null,
                            maxSplitDurationMinutes:
                              personalScheduleData.task
                                .max_split_duration_minutes ?? null,
                            calendarHours:
                              personalScheduleData.task.calendar_hours ?? null,
                            autoSchedule:
                              !!personalScheduleData.task.auto_schedule,
                          }
                        : undefined
                    }
                    onSaveSchedulingSettings={saveSchedulingSettings}
                    schedulingSaving={schedulingSaving}
                    scheduledEvents={localCalendarEvents}
                    disabled={disabled}
                    isDraftMode={!!draftId || (isCreateMode && saveAsDraft)}
                  />
                )}

                {!disabled && !isCreateMode && (
                  <PersonalOverridesSection
                    taskId={task?.id}
                    isCreateMode={isCreateMode}
                    boardConfig={boardConfig}
                    onUpdate={onUpdate}
                  />
                )}

                {!disabled && !draftId && !(isCreateMode && saveAsDraft) && (
                  <TaskRelationshipsProperties
                    wsId={effectiveTaskWsId}
                    taskId={task?.id}
                    boardId={boardId}
                    listId={task?.list_id}
                    isCreateMode={isCreateMode}
                    initialActiveTab={
                      seededPendingRelationships.initialActiveTab
                    }
                    initialDependencySubTab={
                      seededPendingRelationships.initialDependencySubTab
                    }
                    parentTask={parentTask}
                    childTasks={childTasks}
                    blockingTasks={blockingTasks}
                    blockedByTasks={blockedByTasks}
                    relatedTasks={relatedTasks}
                    isLoading={dependenciesLoading}
                    onSetParent={setParentTask}
                    onRemoveParent={() => setParentTask(null)}
                    onAddBlockingTask={addBlockingTask}
                    onRemoveBlockingTask={removeBlockingTask}
                    onAddBlockedByTask={addBlockedByTask}
                    onRemoveBlockedByTask={removeBlockedByTask}
                    onAddRelatedTask={addRelatedTask}
                    onRemoveRelatedTask={removeRelatedTask}
                    onNavigateToTask={async (taskId) => {
                      if (onNavigateToTask) await onNavigateToTask(taskId);
                    }}
                    onAddSubtask={isCreateMode ? undefined : onAddSubtask}
                    onAddParentTask={isCreateMode ? undefined : onAddParentTask}
                    onAddBlockingTaskDialog={
                      isCreateMode ? undefined : onAddBlockingTask
                    }
                    onAddBlockedByTaskDialog={
                      isCreateMode ? undefined : onAddBlockedByTask
                    }
                    onAddRelatedTaskDialog={
                      isCreateMode ? undefined : onAddRelatedTask
                    }
                    onAddExistingAsSubtask={addChildTask}
                    isSaving={!!savingRelationship}
                    savingTaskId={savingRelationship}
                    disabled={disabled}
                  />
                )}

                <TaskDescriptionEditor
                  description={formState.description}
                  setDescription={formState.setDescription}
                  isOpen={isOpen}
                  isCreateMode={isCreateMode}
                  collaborationMode={collaborationMode}
                  realtimeEnabled={realtimeEnabled}
                  isYjsSyncing={isYjsSyncing}
                  wsId={effectiveTaskWsId}
                  boardId={boardId}
                  taskId={task?.id}
                  availableLists={availableLists}
                  queryClient={queryClient}
                  editorRef={editorRef}
                  richTextEditorRef={richTextEditorRef}
                  titleInputRef={titleInputRef}
                  lastCursorPositionRef={lastCursorPositionRef}
                  targetEditorCursorRef={targetEditorCursorRef}
                  flushEditorPendingRef={flushEditorPendingRef}
                  yjsDoc={doc}
                  yjsProvider={provider ?? undefined}
                  collaborationUser={
                    user
                      ? {
                          name: userDisplayName,
                          color: userColor || '',
                        }
                      : null
                  }
                  onImageUpload={imageUploadHandler}
                  onEditorReady={handleEditorReady}
                  onDescriptionStorageLengthChange={
                    handleDescriptionStorageLengthChange
                  }
                  descriptionStorageLength={descriptionStorageLength}
                  descriptionPercentLeft={descriptionPercentLeft}
                  descriptionLimit={MAX_TASK_DESCRIPTION_LENGTH}
                  isDescriptionOverLimit={isDescriptionOverLimit}
                  disabled={disabled}
                  mentionTranslations={{
                    delete_task: t('delete_task'),
                    delete_task_confirmation: (name: string) =>
                      t('delete_task_confirmation', { name }),
                    cancel: t('cancel'),
                    deleting: t('deleting'),
                    set_custom_due_date: t('set_custom_due_date'),
                    custom_due_date_description: t(
                      'custom_due_date_description'
                    ),
                    remove_due_date: t('remove_due_date'),
                    create_new_label: t('create_new_label'),
                    create_new_label_description: t(
                      'create_new_label_description'
                    ),
                    label_name: t('label_name'),
                    color: t('color'),
                    preview: t('preview'),
                    creating: t('creating'),
                    create_label: t('create_label'),
                    create_new_project: t('create_new_project'),
                    create_new_project_description: t(
                      'create_new_project_description'
                    ),
                    project_name: t('project_name'),
                    create_project: t('create_project'),
                  }}
                />

                {!isCreateMode && localCalendarEvents && (
                  <TaskInstancesSection
                    wsId={effectiveTaskWsId}
                    taskId={task?.id}
                    scheduledEvents={localCalendarEvents}
                    onLockToggle={handleLockToggle}
                    isLocking={lockingEventId}
                  />
                )}

                {!disabled && !isCreateMode && task && (
                  <TaskActivitySection
                    wsId={effectiveTaskWsId}
                    taskId={task.id}
                    boardId={boardId}
                    currentTask={{
                      id: task.id,
                      name: formState.name || task.name || '',
                      description: formState.description,
                      priority: formState.priority,
                      start_date: formState.startDate?.toISOString() || null,
                      end_date: formState.endDate?.toISOString() || null,
                      estimation_points: formState.estimationPoints ?? null,
                      list_id: formState.selectedListId || task.list_id || '',
                      list_name:
                        availableLists?.find(
                          (l) => l.id === formState.selectedListId
                        )?.name || null,
                      completed: !!task.completed_at,
                      assignees: formState.selectedAssignees.map((a) => ({
                        id: a.id,
                        user_id: a.id,
                      })),
                      labels: formState.selectedLabels.map((l) => ({
                        id: l.id,
                      })),
                      projects: formState.selectedProjects.map((p) => ({
                        id: p.id,
                      })),
                    }}
                    revertDisabled={true}
                  />
                )}
              </div>
            </div>
          </div>

          <MobileFloatingSaveButton
            isCreateMode={isCreateMode}
            collaborationMode={collaborationMode}
            isLoading={isLoading}
            canSave={canSave && !isDescriptionOverLimit}
            handleSave={handleSave}
            disabled={disabled}
          />
        </DialogContent>
      </Dialog>

      <TaskDeleteDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        taskId={task?.id}
        workspaceId={taskWsId ?? wsId}
        isLoading={isLoading}
        onSuccess={onUpdate}
        onClose={onClose}
      />

      {isCreateMode && (
        <UnsavedChangesWarningDialog
          open={showUnsavedWarning}
          onOpenChange={setShowUnsavedWarning}
          onDiscard={handleWarningDiscard}
          onSaveAsDraft={handleWarningSaveAsDraft}
          onCreateTask={handleWarningCreateTask}
          canSave={canSave}
        />
      )}

      <SyncWarningDialog
        open={showSyncWarning}
        onOpenChange={setShowSyncWarning}
        synced={synced}
        connected={connected}
        onForceClose={handleForceClose}
      />

      <DescriptionOverflowWarningDialog
        open={showDescriptionOverflowWarning}
        onOpenChange={setShowDescriptionOverflowWarning}
        onConfirmClose={handleConfirmCloseWithOverflow}
        title={
          dialogT.has('description_overflow_close_warning_title')
            ? dialogT('description_overflow_close_warning_title')
            : 'Description is too large to save'
        }
        description={
          dialogT.has('description_overflow_close_warning_description')
            ? dialogT('description_overflow_close_warning_description')
            : 'This description is too large to sync right now. You can go back and shorten or split it, or close now and discard the unsaved description changes.'
        }
        cancelLabel={
          dialogT.has('description_overflow_close_warning_cancel')
            ? dialogT('description_overflow_close_warning_cancel')
            : 'Go back and edit'
        }
        confirmLabel={
          dialogT.has('description_overflow_close_warning_confirm')
            ? dialogT('description_overflow_close_warning_confirm')
            : 'Close without saving description'
        }
        warningMessage={
          dialogT.has('description_overflow_close_warning_warning')
            ? dialogT('description_overflow_close_warning_warning')
            : 'Oversized content will be discarded if you close now.'
        }
      />

      <TaskNewLabelDialog
        open={showNewLabelDialog}
        newLabelName={newLabelName}
        newLabelColor={newLabelColor}
        creatingLabel={creatingLabel}
        onOpenChange={setShowNewLabelDialog}
        onNameChange={setNewLabelName}
        onColorChange={setNewLabelColor}
        onConfirm={handleCreateLabel}
        translations={{
          create_new_label: t('create_new_label'),
          create_new_label_description: t('create_new_label_description'),
          label_name: t('label_name'),
          color: t('color'),
          preview: t('preview'),
          cancel: t('cancel'),
          creating: t('creating'),
          create_label: t('create_label'),
        }}
      />

      <TaskNewProjectDialog
        open={showNewProjectDialog}
        newProjectName={newProjectName}
        creatingProject={creatingProject}
        onOpenChange={setShowNewProjectDialog}
        onNameChange={setNewProjectName}
        onConfirm={handleCreateProject}
        translations={{
          create_new_project: t('create_new_project'),
          create_new_project_description: t('create_new_project_description'),
          project_name: t('project_name'),
          cancel: t('cancel'),
          creating: t('creating'),
          create_project: t('create_project'),
        }}
      />

      {boardConfig && effectiveTaskWsId && (
        <BoardEstimationConfigDialog
          open={showEstimationConfigDialog}
          wsId={effectiveTaskWsId}
          boardId={boardId}
          boardName={(boardConfig as { name?: string }).name || 'Board'}
          currentEstimationType={boardConfig.estimation_type || null}
          currentExtendedEstimation={boardConfig.extended_estimation || false}
          currentAllowZeroEstimates={boardConfig.allow_zero_estimates ?? true}
          currentCountUnestimatedIssues={
            (boardConfig as { count_unestimated_issues?: boolean })
              .count_unestimated_issues || false
          }
          onOpenChange={setShowEstimationConfigDialog}
          onSuccess={handleEstimationConfigSuccess}
        />
      )}

      {/* Task Share Dialog */}
      {!isCreateMode && task?.id && (
        <TaskShareDialog
          open={showShareDialog}
          onOpenChange={setShowShareDialog}
          taskId={task.id}
          taskName={formState.name}
          wsId={effectiveTaskWsId}
        />
      )}
    </>
  );
}
