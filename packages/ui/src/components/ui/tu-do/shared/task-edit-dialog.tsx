'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Editor, JSONContent } from '@tiptap/react';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { User } from '@tuturuuu/types/primitives/User';
import { Dialog, DialogContent } from '@tuturuuu/ui/dialog';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { useYjsCollaboration } from '@tuturuuu/ui/hooks/use-yjs-collaboration';
import { convertListItemToTask } from '@tuturuuu/utils/editor';
import {
  getTicketIdentifier,
  invalidateTaskCaches,
} from '@tuturuuu/utils/task-helper';
import dayjs from 'dayjs';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  checkStorageQuota,
  StorageQuotaError,
} from '../../text-editor/media-utils';
import { BoardEstimationConfigDialog } from '../boards/boardId/task-dialogs/BoardEstimationConfigDialog';
import { TaskNewLabelDialog } from '../boards/boardId/task-dialogs/TaskNewLabelDialog';
import { TaskNewProjectDialog } from '../boards/boardId/task-dialogs/TaskNewProjectDialog';
import { createInitialSuggestionState } from './mention-system/types';
import { SyncWarningDialog } from './sync-warning-dialog';
import { MobileFloatingSaveButton } from './task-edit-dialog/components/mobile-floating-save-button';
import { TaskDescriptionEditor } from './task-edit-dialog/components/task-description-editor';
import { TaskDialogHeader } from './task-edit-dialog/components/task-dialog-header';
import { TaskNameInput } from './task-edit-dialog/components/task-name-input';
import { TaskSuggestionMenus } from './task-edit-dialog/components/task-suggestion-menus';
import { NAME_UPDATE_DEBOUNCE_MS } from './task-edit-dialog/constants';
import { useEditorCommands } from './task-edit-dialog/hooks/use-editor-commands';
import { useSuggestionMenus } from './task-edit-dialog/hooks/use-suggestion-menus';
import { useTaskChangeDetection } from './task-edit-dialog/hooks/use-task-change-detection';
import { useTaskData } from './task-edit-dialog/hooks/use-task-data';
import { useTaskDependencies } from './task-edit-dialog/hooks/use-task-dependencies';
import { useTaskDialogClose } from './task-edit-dialog/hooks/use-task-dialog-close';
import { useTaskDialogKeyboardShortcuts } from './task-edit-dialog/hooks/use-task-dialog-keyboard-shortcuts';
import { useTaskFormReset } from './task-edit-dialog/hooks/use-task-form-reset';
import { useTaskFormState } from './task-edit-dialog/hooks/use-task-form-state';
import { useTaskSave } from './task-edit-dialog/hooks/use-task-save';
import { useTaskYjsSync } from './task-edit-dialog/hooks/use-task-yjs-sync';

// Re-export relationship types
import type {
  PendingRelationship,
  PendingRelationshipType,
} from './task-edit-dialog/types/pending-relationship';

export type { PendingRelationship, PendingRelationshipType };

export {
  type DialogHeaderInfo,
  getTaskDialogHeaderInfo,
} from './task-edit-dialog/components/task-dialog-header';

import { useTaskMutations } from './task-edit-dialog/hooks/use-task-mutations';
import { useTaskRealtimeSync } from './task-edit-dialog/hooks/use-task-realtime-sync';
import { useTaskRelationships } from './task-edit-dialog/hooks/use-task-relationships';
import { TaskActivitySection } from './task-edit-dialog/task-activity-section';
import { TaskDeleteDialog } from './task-edit-dialog/task-delete-dialog';
import { TaskPropertiesSection } from './task-edit-dialog/task-properties-section';
import { TaskRelationshipsProperties } from './task-edit-dialog/task-relationships-properties';
import type { WorkspaceTaskLabel } from './task-edit-dialog/types';
import {
  clearDraft,
  getDraftStorageKey,
  saveYjsDescriptionToDatabase,
} from './task-edit-dialog/utils';
import type { TaskFilters } from './types';

const supabase = createClient();

export interface TaskEditDialogProps {
  wsId: string;
  task?: Task;
  boardId: string;
  isOpen: boolean;
  availableLists?: TaskList[];
  filters?: TaskFilters;
  mode?: 'edit' | 'create';
  collaborationMode?: boolean;
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
  task,
  boardId,
  isOpen,
  availableLists: propAvailableLists,
  filters,
  mode = 'edit',
  collaborationMode = false,
  isPersonalWorkspace = false,
  parentTaskId,
  parentTaskName,
  pendingRelationship,
  currentUser: propsCurrentUser,
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
  const pathname = usePathname();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
    const userId = user?.id || 'anonymous';
    return colors[Math.abs(hashCode(userId)) % colors.length] || colors[0];
  }, [user?.id]);

  // User task settings
  const { data: userTaskSettings } = useQuery({
    queryKey: ['user-task-settings'],
    queryFn: async () => {
      const res = await fetch('/api/v1/users/task-settings');
      if (!res.ok) return { task_auto_assign_to_self: false };
      return res.json() as Promise<{ task_auto_assign_to_self: boolean }>;
    },
    enabled: isCreateMode && !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Yjs collaboration
  const { doc, provider, synced, connected } = useYjsCollaboration({
    channel: `task-editor-${task?.id || 'new'}`,
    tableName: 'tasks',
    columnName: 'description_yjs_state',
    id: task?.id || '',
    user: user
      ? {
          id: user.id || '',
          name: user.display_name || '',
          color: userColor || '',
        }
      : null,
    enabled: isOpen && !isCreateMode && collaborationMode && !!task?.id,
  });

  const isYjsSyncing = useMemo(() => {
    return (
      isOpen && !isCreateMode && collaborationMode && !!task?.id && !synced
    );
  }, [isOpen, isCreateMode, collaborationMode, task?.id, synced]);

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
    wsId,
    boardId,
    isOpen,
    propAvailableLists,
    taskSearchQuery,
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
  const [newLabelColor, setNewLabelColor] = useState('gray');
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

  // Dialog states
  const [showNewLabelDialog, setShowNewLabelDialog] = useState(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [showEstimationConfigDialog, setShowEstimationConfigDialog] =
    useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [createMultiple, setCreateMultiple] = useState(false);
  const [showSyncWarning, setShowSyncWarning] = useState(false);

  // Calendar events state
  const [localCalendarEvents, setLocalCalendarEvents] = useState<
    Task['calendar_events'] | undefined
  >(task?.calendar_events);

  useEffect(() => {
    setLocalCalendarEvents(task?.calendar_events);
  }, [task?.calendar_events]);

  const { data: personalScheduleData } = useQuery({
    queryKey: ['task-personal-schedule', task?.id, isOpen],
    enabled: !!isOpen && !isCreateMode && !!task?.id,
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/users/me/tasks/${task!.id}/schedule`
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
  useEffect(() => {
    if (!personalScheduleData?.task || !isOpen || isCreateMode) return;
    formState.setTotalDuration(
      personalScheduleData.task.total_duration ?? null
    );
    formState.setIsSplittable(!!personalScheduleData.task.is_splittable);
    formState.setMinSplitDurationMinutes(
      personalScheduleData.task.min_split_duration_minutes ?? null
    );
    formState.setMaxSplitDurationMinutes(
      personalScheduleData.task.max_split_duration_minutes ?? null
    );
    formState.setCalendarHours(
      personalScheduleData.task.calendar_hours ?? null
    );
    formState.setAutoSchedule(!!personalScheduleData.task.auto_schedule);
  }, [
    personalScheduleData?.task,
    isOpen,
    isCreateMode,
    formState.setTotalDuration,
    formState.setIsSplittable,
    formState.setMinSplitDurationMinutes,
    formState.setMaxSplitDurationMinutes,
    formState.setCalendarHours,
    formState.setAutoSchedule,
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
    wsId,
    currentTaskId: task?.id,
    isPersonalWorkspace,
    endDate: formState.endDate,
    priority: formState.priority,
    showAdvancedOptions,
    setShowAdvancedOptions,
  });

  // Change detection
  const { hasUnsavedChanges, canSave } = useTaskChangeDetection({
    task,
    name: formState.name,
    description: formState.description,
    priority: formState.priority,
    startDate: formState.startDate,
    endDate: formState.endDate,
    selectedListId: formState.selectedListId,
    estimationPoints: formState.estimationPoints,
    isCreateMode,
    isLoading,
    collaborationMode,
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
    taskId: task?.id,
    isCreateMode,
    boardId,
    boardConfig,
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
  } = useTaskDependencies({
    taskId: task?.id,
    boardId,
    wsId,
    listId: task?.list_id,
    isCreateMode,
    onUpdate,
  });

  // Realtime sync
  useTaskRealtimeSync({
    taskId: task?.id,
    isCreateMode,
    isOpen,
    name: formState.name,
    priority: formState.priority,
    startDate: formState.startDate,
    endDate: formState.endDate,
    estimationPoints: formState.estimationPoints,
    selectedListId: formState.selectedListId,
    pendingNameRef,
    setName: formState.setName,
    setPriority: formState.setPriority,
    setStartDate: formState.setStartDate,
    setEndDate: formState.setEndDate,
    setEstimationPoints: formState.setEstimationPoints,
    setSelectedListId: formState.setSelectedListId,
    setSelectedLabels: formState.setSelectedLabels,
    setSelectedAssignees: formState.setSelectedAssignees,
    setSelectedProjects: formState.setSelectedProjects,
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
    boardId,
    isOpen,
    isCreateMode,
    collaborationMode,
    description: formState.description,
    editorInstance,
    doc,
    queryClient,
    flushEditorPendingRef,
  });

  // Quick due date handler
  const handleQuickDueDate = useCallback(
    (days: number | null) => {
      const newDate =
        days !== null
          ? dayjs().add(days, 'day').endOf('day').toDate()
          : undefined;
      formState.setEndDate(newDate);
      if (!isCreateMode) updateEndDate(newDate);
    },
    [isCreateMode, formState, updateEndDate]
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
      if (!wsId) throw new Error('Workspace ID is required for image upload');
      try {
        await checkStorageQuota(supabase, wsId, file.size);
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${wsId}/task-images/${fileName}`;
        const { data, error } = await supabase.storage
          .from('workspaces')
          .upload(filePath, file, { contentType: file.type, upsert: false });
        if (error) throw new Error('Failed to upload image');
        const { data: signedUrlData, error: signedUrlError } =
          await supabase.storage
            .from('workspaces')
            .createSignedUrl(data.path, 31536000);
        if (signedUrlError) throw new Error('Failed to generate signed URL');
        return signedUrlData.signedUrl;
      } catch (error) {
        if (error instanceof StorageQuotaError) {
          toast({
            title: 'Storage Quota Exceeded',
            description: error.message,
            variant: 'destructive',
          });
        }
        throw error;
      }
    },
    [wsId, toast]
  );

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
      toast({
        title: 'No lists available',
        description: 'Create a list first before converting items to tasks',
        variant: 'destructive',
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
        // Note: display_number and board_id are auto-assigned by database trigger
        // Select all fields needed for the Task type to add to cache
        const { data: newTask, error } = await supabase
          .from('tasks')
          .insert({
            name,
            list_id: listId,
          })
          .select('*')
          .single();
        if (error || !newTask) throw error;

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
      toast({
        title: result.error!.message,
        description: result.error!.description,
        variant: 'destructive',
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

    toast({
      title: 'Task created',
      description: `Created task "${result.taskName}" and added mention`,
    });
  }, [editorInstance, boardId, availableLists, queryClient, toast]);

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
    boardId,
    taskId: task?.id,
    isCreateMode,
    collaborationMode,
    isPersonalWorkspace,
    parentTaskId,
    pendingRelationship,
    draftStorageKey,
    name: formState.name,
    description: formState.description,
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

  // Close handlers
  const { handleClose, handleForceClose, handleNavigateBack, handleCloseRef } =
    useTaskDialogClose({
      taskId: task?.id,
      boardId,
      isCreateMode,
      collaborationMode,
      synced,
      connected,
      draftStorageKey,
      parentTaskId,
      pendingRelationship,
      flushEditorPendingRef,
      queryClient,
      onClose,
      onNavigateToTask,
      flushNameUpdate,
      setShowSyncWarning,
    });

  // Dialog open change - prevents close when menus are open
  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      if (
        !open &&
        !suggestionMenus.showCustomDatePicker &&
        !suggestionMenus.slashState.open &&
        !suggestionMenus.mentionState.open
      ) {
        handleClose();
      }
    },
    [
      suggestionMenus.showCustomDatePicker,
      suggestionMenus.slashState.open,
      suggestionMenus.mentionState.open,
      handleClose,
    ]
  );

  const handleEditorReady = useCallback((editor: Editor) => {
    setEditorInstance(editor);
  }, []);

  // Keyboard shortcuts
  const hasUnsavedChangesRef = useRef<boolean>(false);
  hasUnsavedChangesRef.current = hasUnsavedChanges;

  useTaskDialogKeyboardShortcuts({
    isOpen,
    canSave,
    isCreateMode,
    collaborationMode,
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
        await flushNameUpdate();
        if (
          collaborationMode &&
          !isCreateMode &&
          task?.id &&
          flushEditorPendingRef.current
        ) {
          await saveYjsDescriptionToDatabase({
            taskId: task.id,
            getContent: flushEditorPendingRef.current,
            boardId,
            queryClient,
            context: 'auto-close',
          });
        }
        if (!isCreateMode) clearDraft(draftStorageKey);
        onClose();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [
    showSyncWarning,
    synced,
    connected,
    flushNameUpdate,
    isCreateMode,
    draftStorageKey,
    onClose,
    collaborationMode,
    task?.id,
    boardId,
    queryClient,
  ]);

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
    if (!isOpen || !wsId || !suggestionMenus.mentionState.open) {
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
    wsId,
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
            <TaskDialogHeader
              isCreateMode={isCreateMode}
              collaborationMode={collaborationMode}
              isOpen={isOpen}
              synced={synced}
              connected={connected}
              taskId={task?.id}
              parentTaskId={parentTaskId}
              parentTaskName={parentTaskName}
              pendingRelationship={pendingRelationship}
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
              wsId={wsId}
              boardId={boardId}
              pathname={pathname}
              canSave={canSave}
              isLoading={isLoading}
              setCreateMultiple={setCreateMultiple}
              handleClose={handleClose}
              setShowDeleteConfirm={setShowDeleteConfirm}
              clearDraftState={formState.clearDraftState}
              handleSave={handleSave}
              onNavigateBack={
                isCreateMode && (pendingRelationship || parentTaskId)
                  ? handleNavigateBack
                  : undefined
              }
            />

            <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
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
                />

                <TaskPropertiesSection
                  wsId={wsId}
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
                />

                <TaskRelationshipsProperties
                  wsId={wsId}
                  taskId={task?.id}
                  boardId={boardId}
                  listId={task?.list_id}
                  isCreateMode={isCreateMode}
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
                  onAddSubtask={onAddSubtask}
                  onAddParentTask={onAddParentTask}
                  onAddBlockingTaskDialog={onAddBlockingTask}
                  onAddBlockedByTaskDialog={onAddBlockedByTask}
                  onAddRelatedTaskDialog={onAddRelatedTask}
                  onAddExistingAsSubtask={addChildTask}
                  isSaving={!!savingRelationship}
                  savingTaskId={savingRelationship}
                />

                <TaskDescriptionEditor
                  description={formState.description}
                  setDescription={formState.setDescription}
                  isOpen={isOpen}
                  isCreateMode={isCreateMode}
                  collaborationMode={collaborationMode}
                  isYjsSyncing={isYjsSyncing}
                  wsId={wsId}
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
                  yjsProvider={provider}
                  onImageUpload={handleImageUpload}
                  onEditorReady={handleEditorReady}
                />

                {!isCreateMode && task && (
                  <TaskActivitySection
                    wsId={wsId}
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
            canSave={canSave}
            handleSave={handleSave}
          />
        </DialogContent>
      </Dialog>

      <TaskDeleteDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        taskId={task?.id}
        boardId={boardId}
        isLoading={isLoading}
        onSuccess={onUpdate}
        onClose={onClose}
      />

      <SyncWarningDialog
        open={showSyncWarning}
        onOpenChange={setShowSyncWarning}
        synced={synced}
        connected={connected}
        onForceClose={handleForceClose}
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
      />

      <TaskNewProjectDialog
        open={showNewProjectDialog}
        newProjectName={newProjectName}
        creatingProject={creatingProject}
        onOpenChange={setShowNewProjectDialog}
        onNameChange={setNewProjectName}
        onConfirm={handleCreateProject}
      />

      {boardConfig && wsId && (
        <BoardEstimationConfigDialog
          open={showEstimationConfigDialog}
          wsId={wsId}
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
    </>
  );
}
