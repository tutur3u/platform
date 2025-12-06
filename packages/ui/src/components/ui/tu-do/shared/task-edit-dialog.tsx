'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Editor, JSONContent } from '@tiptap/react';
import { Loader2 } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { User } from '@tuturuuu/types/primitives/User';
import { Dialog, DialogContent } from '@tuturuuu/ui/dialog';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { useYjsCollaboration } from '@tuturuuu/ui/hooks/use-yjs-collaboration';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { convertListItemToTask } from '@tuturuuu/utils/editor';
import { cn } from '@tuturuuu/utils/format';
import {
  createTaskRelationship,
  getTicketIdentifier,
  invalidateTaskCaches,
  useUpdateTask,
} from '@tuturuuu/utils/task-helper';
import { convertJsonContentToYjsState } from '@tuturuuu/utils/yjs-helper';
import dayjs from 'dayjs';
import debounce from 'lodash/debounce';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as Y from 'yjs';
import {
  checkStorageQuota,
  StorageQuotaError,
} from '../../text-editor/media-utils';
import { BoardEstimationConfigDialog } from '../boards/boardId/task-dialogs/BoardEstimationConfigDialog';
import { TaskNewLabelDialog } from '../boards/boardId/task-dialogs/TaskNewLabelDialog';
import { TaskNewProjectDialog } from '../boards/boardId/task-dialogs/TaskNewProjectDialog';
import CursorOverlayWrapper from './cursor-overlay-wrapper';
import { CustomDatePickerDialog } from './custom-date-picker/custom-date-picker-dialog';
import { MentionMenu } from './mention-system/mention-menu';
import {
  createInitialSuggestionState,
  isSameSuggestionState,
  type SuggestionState,
} from './mention-system/types';
import { useMentionSuggestions } from './mention-system/use-mention-suggestions';
import {
  filterSlashCommands,
  getSlashCommands,
  type SlashCommandDefinition,
} from './slash-commands/definitions';
import { SlashCommandMenu } from './slash-commands/slash-command-menu';
import { SyncWarningDialog } from './sync-warning-dialog';
// Import refactored utilities and hooks
import { MobileFloatingSaveButton } from './task-edit-dialog/components/mobile-floating-save-button';
import { TaskDialogHeader } from './task-edit-dialog/components/task-dialog-header';
import { TaskNameInput } from './task-edit-dialog/components/task-name-input';
import {
  DESCRIPTION_SYNC_DEBOUNCE_MS,
  NAME_UPDATE_DEBOUNCE_MS,
  SUGGESTION_MENU_WIDTH,
} from './task-edit-dialog/constants';
import { useEditorCommands } from './task-edit-dialog/hooks/use-editor-commands';
import { useTaskData } from './task-edit-dialog/hooks/use-task-data';
import { useTaskDependencies } from './task-edit-dialog/hooks/use-task-dependencies';
import { useTaskFormState } from './task-edit-dialog/hooks/use-task-form-state';

// Re-export relationship types from centralized location
import type {
  PendingRelationship,
  PendingRelationshipType,
} from './task-edit-dialog/types/pending-relationship';

export type { PendingRelationship, PendingRelationshipType };

// Re-export dialog header utilities for external use
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
  getDescriptionContent,
  getDraftStorageKey,
  saveYjsDescriptionToDatabase,
} from './task-edit-dialog/utils';
import type { TaskFilters } from './types';

// Module-level Supabase client singleton to avoid repeated instantiation
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
  parentTaskId?: string; // For creating subtasks - will set parent relationship on save
  parentTaskName?: string; // Name of parent task when creating subtasks
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

  // ============================================================================
  // CORE TASK STATE - Basic task properties (name, description, dates, etc.)
  // ============================================================================
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ============================================================================
  // FORM STATE - Using refactored hook
  // ============================================================================
  const {
    name,
    setName,
    description,
    setDescription,
    priority,
    setPriority,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    selectedListId,
    setSelectedListId,
    estimationPoints,
    setEstimationPoints,
    selectedLabels,
    setSelectedLabels,
    selectedAssignees,
    setSelectedAssignees,
    selectedProjects,
    setSelectedProjects,
    hasDraft,
    clearDraftState,
    // Scheduling fields
    totalDuration,
    setTotalDuration,
    isSplittable,
    setIsSplittable,
    minSplitDurationMinutes,
    setMinSplitDurationMinutes,
    maxSplitDurationMinutes,
    setMaxSplitDurationMinutes,
    calendarHours,
    setCalendarHours,
    autoSchedule,
    setAutoSchedule,
  } = useTaskFormState({
    task,
    boardId,
    isOpen,
    isCreateMode,
    isSaving,
  });

  const previousTaskIdRef = useRef<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const richTextEditorRef = useRef<HTMLDivElement>(null);
  const lastCursorPositionRef = useRef<number | null>(null);
  const targetEditorCursorRef = useRef<number | null>(null);

  /**
   * Reference to a function that flushes pending editor content
   *
   * TYPE CONTRACT:
   * - In collaboration mode: Returns JSONContent | null (actual content from Yjs state)
   *   - null indicates empty/cleared editor
   *   - JSONContent represents the current editor state
   * - In non-collaboration mode: Returns JSONContent | null (pending changes)
   *
   * This function is provided by the RichTextEditor component and is used to:
   * 1. Extract current editor content before closing/saving
   * 2. Sync Yjs-derived description to database for embeddings and analytics
   * 3. Enable real-time UI updates (e.g., checkbox counts) without requiring save/close
   */
  const flushEditorPendingRef = useRef<(() => JSONContent | null) | undefined>(
    undefined
  );

  const updateTaskMutation = useUpdateTask(boardId);

  // ============================================================================
  // USER & COLLABORATION - User state and Yjs collaboration setup
  // ============================================================================
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

  const userColor: string | undefined = useMemo(() => {
    const hashCode = (str: string) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      return hash;
    };

    const colors = [
      '#3b82f6', // blue
      '#8b5cf6', // purple
      '#ec4899', // pink
      '#f97316', // orange
      '#10b981', // green
      '#06b6d4', // cyan
      '#f59e0b', // amber
      '#6366f1', // indigo
    ];

    const userId = user?.id || 'anonymous';
    const index = Math.abs(hashCode(userId)) % colors.length;
    return colors[index] || colors[0];
  }, [user?.id]);

  // Fetch user task settings for auto-assign feature
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

  // Determine if we should show loading state for Yjs sync
  const isYjsSyncing = useMemo(() => {
    const collaborationEnabled =
      isOpen && !isCreateMode && collaborationMode && !!task?.id;
    return collaborationEnabled && !synced;
  }, [isOpen, isCreateMode, collaborationMode, task?.id, synced]);

  // Update user state when propsCurrentUser changes
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

  // ============================================================================
  // DATA FETCHING - Using refactored hook
  // ============================================================================
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

  // Update browser tab title with ticket identifier when dialog is open
  useEffect(() => {
    if (!isOpen || isCreateMode || !task) return;

    const originalTitle = document.title;
    const ticketId = getTicketIdentifier(
      boardConfig?.ticket_prefix,
      task.display_number
    );
    document.title = `${ticketId} - ${task.name}`;

    // Restore original title when dialog closes
    return () => {
      document.title = originalTitle;
    };
  }, [isOpen, isCreateMode, task, boardConfig?.ticket_prefix]);

  // ============================================================================
  // LABELS MANAGEMENT - Workspace labels, selected labels, and creation
  // ============================================================================
  const [availableLabels, setAvailableLabels] = useState<WorkspaceTaskLabel[]>(
    []
  );
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('gray');

  // Track previous workspaceLabels to avoid infinite loops
  const previousWorkspaceLabelsRef = useRef<string>('');

  useEffect(() => {
    // Only update if the actual content changed, not just the reference
    const currentLabelsKey = JSON.stringify(
      workspaceLabels.map((l) => l.id).sort()
    );
    if (previousWorkspaceLabelsRef.current !== currentLabelsKey) {
      previousWorkspaceLabelsRef.current = currentLabelsKey;
      setAvailableLabels(workspaceLabels);
    }
  }, [workspaceLabels]);

  // ============================================================================
  // PROJECTS - Project creation state
  // ============================================================================
  const [newProjectName, setNewProjectName] = useState('');

  // ============================================================================
  // EDITOR & SUGGESTIONS - Rich text editor and slash/mention menus
  // ============================================================================
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const [slashState, setSlashState] = useState<SuggestionState>(
    createInitialSuggestionState
  );
  const [mentionState, setMentionState] = useState<SuggestionState>(
    createInitialSuggestionState
  );
  const [slashHighlightIndex, setSlashHighlightIndex] = useState(0);
  const [mentionHighlightIndex, setMentionHighlightIndex] = useState(0);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(true);

  // Dialog states for creating labels, projects, and configuring estimation
  const [showNewLabelDialog, setShowNewLabelDialog] = useState(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [showEstimationConfigDialog, setShowEstimationConfigDialog] =
    useState(false);

  const slashListRef = useRef<HTMLDivElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const previousMentionHighlightRef = useRef(0);
  const previousSlashHighlightRef = useRef(0);
  const previousSlashQueryRef = useRef('');
  const previousMentionQueryRef = useRef('');

  const suggestionMenuWidth = SUGGESTION_MENU_WIDTH;

  const slashCommands = useMemo<SlashCommandDefinition[]>(() => {
    return getSlashCommands({
      hasMembers: workspaceMembers.length > 0,
      hasEndDate: !!endDate,
      hasPriority: !!priority,
      showAdvanced: showAdvancedOptions,
    });
  }, [workspaceMembers.length, endDate, priority, showAdvancedOptions]);

  const filteredSlashCommands = useMemo(() => {
    if (!slashState.open) return [] as SlashCommandDefinition[];
    return filterSlashCommands(slashCommands, slashState.query);
  }, [slashCommands, slashState.open, slashState.query]);

  const { filteredMentionOptions } = useMentionSuggestions({
    workspaceMembers,
    currentWorkspace: boardConfig
      ? {
          id: wsId,
          name: (boardConfig as any).name || 'Workspace',
          handle: null,
          personal: isPersonalWorkspace,
        }
      : null,
    taskProjects,
    workspaceTasks,
    currentTaskId: task?.id,
    query: mentionState.query,
  });

  const closeSlashMenu = useCallback(() => {
    setSlashState((prev) =>
      prev.open ? createInitialSuggestionState() : prev
    );
  }, []);

  const closeMentionMenu = useCallback(() => {
    setMentionState((prev) =>
      prev.open ? createInitialSuggestionState() : prev
    );
    setShowCustomDatePicker(false);
    setCustomDate(undefined);
    setIncludeTime(false);
    setSelectedHour('11');
    setSelectedMinute('59');
    setSelectedPeriod('PM');
  }, []);

  const handleEditorReady = useCallback((editor: Editor) => {
    setEditorInstance(editor);
  }, []);

  // ============================================================================
  // CUSTOM DATE PICKER - Date picker state for mention menu
  // ============================================================================
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);
  const [includeTime, setIncludeTime] = useState(false);
  const [selectedHour, setSelectedHour] = useState<string>('11');
  const [selectedMinute, setSelectedMinute] = useState<string>('59');
  const [selectedPeriod, setSelectedPeriod] = useState<'AM' | 'PM'>('PM');

  // ============================================================================
  // UI STATE - Dialog and options visibility
  // ============================================================================
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [createMultiple, setCreateMultiple] = useState(false);
  const [showSyncWarning, setShowSyncWarning] = useState(false);

  // Local state for calendar events (updated after scheduling)
  const [localCalendarEvents, setLocalCalendarEvents] = useState<
    Task['calendar_events'] | undefined
  >(task?.calendar_events);

  // Sync localCalendarEvents when task prop changes
  // Include task?.id to ensure state resets when switching between tasks
  useEffect(() => {
    setLocalCalendarEvents(task?.calendar_events);
  }, [task?.calendar_events]);

  // Fetch calendar events when dialog opens for existing tasks
  useEffect(() => {
    if (!isOpen || isCreateMode || !task?.id || !wsId) return;

    // Only fetch if task has scheduling settings (total_duration set)
    if (!task.total_duration || task.total_duration <= 0) return;

    const fetchCalendarEvents = async () => {
      try {
        const response = await fetch(
          `/api/v1/workspaces/${wsId}/tasks/${task.id}/schedule`
        );
        if (!response.ok) return;

        const data = await response.json();
        if (data.events && Array.isArray(data.events)) {
          setLocalCalendarEvents(
            data.events.map(
              (e: {
                id: string;
                title: string;
                start_at: string;
                end_at: string;
                scheduled_minutes: number;
                completed: boolean;
              }) => ({
                id: e.id,
                title: e.title,
                start_at: e.start_at,
                end_at: e.end_at,
                scheduled_minutes: e.scheduled_minutes,
                completed: e.completed,
              })
            )
          );
        }
      } catch (error) {
        console.error('Error fetching calendar events:', error);
      }
    };

    fetchCalendarEvents();
  }, [isOpen, isCreateMode, task?.id, task?.total_duration, wsId]);

  // ============================================================================
  // NAME UPDATE & DEBOUNCING
  // ============================================================================
  const nameUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNameRef = useRef<string | null>(null);

  const draftStorageKey = getDraftStorageKey(boardId);

  // ============================================================================
  // HANDLER REFS - Stable refs for callbacks used in effects
  // ============================================================================
  const handleSaveRef = useRef<() => void>(() => {});
  const handleCloseRef = useRef<() => void>(() => {});
  const hasUnsavedChangesRef = useRef<boolean>(false);
  const quickDueRef = useRef<(days: number | null) => void>(() => {});
  const updateEstimationRef = useRef<(points: number | null) => void>(() => {});
  const handleConvertToTaskRef = useRef<(() => Promise<void>) | null>(null);
  const flushNameUpdateRef = useRef<(() => Promise<void>) | null>(null);

  // ============================================================================
  // CHANGE DETECTION - Track unsaved changes for save button state
  // ============================================================================
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

  const initialSnapshot = useMemo(() => {
    return {
      name: (task?.name || '').trim(),
      description: JSON.stringify(parseDescription(task?.description) || null),
      priority: task?.priority || null,
      start: task?.start_date
        ? new Date(task?.start_date).toISOString()
        : undefined,
      end: task?.end_date ? new Date(task?.end_date).toISOString() : undefined,
      listId: task?.list_id,
      estimationPoints: task?.estimation_points ?? null,
    } as const;
  }, [task, parseDescription]);

  const currentSnapshot = useMemo(() => {
    return {
      name: (name || '').trim(),
      description: JSON.stringify(description || null),
      priority: priority || null,
      start: startDate?.toISOString(),
      end: endDate?.toISOString(),
      listId: selectedListId,
      estimationPoints: estimationPoints ?? null,
    } as const;
  }, [
    name,
    description,
    priority,
    startDate,
    endDate,
    selectedListId,
    estimationPoints,
  ]);

  const hasUnsavedChanges = useMemo(() => {
    // When collaboration is enabled, description is managed by Yjs - don't track it
    const descriptionChanged = collaborationMode
      ? false
      : initialSnapshot.description !== currentSnapshot.description;

    return (
      initialSnapshot.name !== currentSnapshot.name ||
      descriptionChanged ||
      initialSnapshot.priority !== currentSnapshot.priority ||
      initialSnapshot.start !== currentSnapshot.start ||
      initialSnapshot.end !== currentSnapshot.end ||
      initialSnapshot.listId !== currentSnapshot.listId ||
      initialSnapshot.estimationPoints !== currentSnapshot.estimationPoints
    );
  }, [initialSnapshot, currentSnapshot, collaborationMode]);

  const canSave = useMemo(() => {
    const hasName = !!(name || '').trim();
    if (isCreateMode) return hasName && !isLoading;
    return hasName && hasUnsavedChanges && !isLoading;
  }, [isCreateMode, name, hasUnsavedChanges, isLoading]);

  // ============================================================================
  // CUSTOM HOOKS - Task mutations and relationships
  // ============================================================================
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
    estimationPoints: estimationPoints ?? null,
    priority,
    selectedListId,
    taskName: task?.name,
    setEstimationPoints,
    setPriority,
    setStartDate,
    setEndDate,
    setSelectedListId,
    onUpdate,
  });

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
    selectedLabels,
    selectedAssignees,
    selectedProjects,
    newLabelName,
    newLabelColor,
    newProjectName,
    setSelectedLabels,
    setSelectedAssignees,
    setSelectedProjects,
    setAvailableLabels,
    setNewLabelName,
    setNewLabelColor,
    setNewProjectName,
    setShowNewLabelDialog,
    setShowNewProjectDialog,
    onUpdate,
  });

  // ============================================================================
  // TASK DEPENDENCIES - Parent, children, blocking, blocked-by, related tasks
  // ============================================================================
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

  // ============================================================================
  // REALTIME SYNC - Subscribe to task changes from other users
  // ============================================================================
  useTaskRealtimeSync({
    taskId: task?.id,
    isCreateMode,
    isOpen,
    name,
    priority,
    startDate,
    endDate,
    estimationPoints,
    selectedListId,
    pendingNameRef,
    setName,
    setPriority,
    setStartDate,
    setEndDate,
    setEstimationPoints,
    setSelectedListId,
    setSelectedLabels,
    setSelectedAssignees,
    setSelectedProjects,
  });

  // ============================================================================
  // EVENT HANDLERS - Core event handlers (dates, estimation, labels, etc.)
  // ============================================================================
  const handleQuickDueDate = useCallback(
    (days: number | null) => {
      let newDate: Date | undefined;
      if (days !== null) {
        newDate = dayjs().add(days, 'day').endOf('day').toDate();
      }
      setEndDate(newDate);
      if (isCreateMode) {
        return;
      }
      setIsLoading(true);
      const taskUpdates: Partial<Task> = {
        end_date: newDate ? newDate.toISOString() : null,
      };

      if (task?.id)
        updateTaskMutation.mutate(
          { taskId: task?.id, updates: taskUpdates },
          {
            onSuccess: async () => {
              // Note: useUpdateTask already has optimistic updates
              // Realtime handles cross-user sync
              toast({
                title: 'Due date updated',
                description: newDate
                  ? `Due date set to ${newDate.toLocaleDateString()}`
                  : 'Due date removed',
              });
              onUpdate();
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
    },
    [isCreateMode, onUpdate, task, updateTaskMutation, toast, setEndDate]
  );

  const updateName = useCallback(
    (newName: string) => {
      // Clear any pending save
      if (nameUpdateTimerRef.current) {
        clearTimeout(nameUpdateTimerRef.current);
      }

      // Store the pending name
      pendingNameRef.current = newName;

      // Schedule debounced save
      nameUpdateTimerRef.current = setTimeout(() => {
        saveNameToDatabase(newName);
        pendingNameRef.current = null;
        nameUpdateTimerRef.current = null;
      }, NAME_UPDATE_DEBOUNCE_MS);
    },
    [saveNameToDatabase]
  );

  const flushNameUpdate = useCallback(async () => {
    // Clear the debounce timer
    if (nameUpdateTimerRef.current) {
      clearTimeout(nameUpdateTimerRef.current);
      nameUpdateTimerRef.current = null;
    }

    // Save immediately if there's a pending name
    if (pendingNameRef.current) {
      await saveNameToDatabase(pendingNameRef.current);
      pendingNameRef.current = null;
    }
  }, [saveNameToDatabase]);

  const handleImageUpload = useCallback(
    async (file: File): Promise<string> => {
      if (!wsId) {
        const errorMsg = 'Workspace ID is required for image upload';
        toast({
          title: 'Upload failed',
          description: errorMsg,
          variant: 'destructive',
        });
        throw new Error(errorMsg);
      }

      try {
        // Check storage quota before uploading
        await checkStorageQuota(supabase, wsId, file.size);

        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${wsId}/task-images/${fileName}`;

        const { data, error } = await supabase.storage
          .from('workspaces')
          .upload(filePath, file, {
            contentType: file.type,
            upsert: false,
          });

        if (error) {
          console.error('Upload error:', error);
          toast({
            title: 'Upload failed',
            description: error.message || 'Failed to upload image',
            variant: 'destructive',
          });
          throw new Error('Failed to upload image');
        }

        const { data: signedUrlData, error: signedUrlError } =
          await supabase.storage
            .from('workspaces')
            .createSignedUrl(data.path, 31536000);

        if (signedUrlError) {
          console.error('Signed URL error:', signedUrlError);
          toast({
            title: 'URL generation failed',
            description:
              signedUrlError.message || 'Failed to generate signed URL',
            variant: 'destructive',
          });
          throw new Error('Failed to generate signed URL');
        }

        return signedUrlData.signedUrl;
      } catch (error) {
        if (error instanceof StorageQuotaError) {
          toast({
            title: 'Storage Quota Exceeded',
            description: error.message,
            variant: 'destructive',
          });
          throw error;
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

  // ============================================================================
  // EDITOR COMMANDS - Slash commands and mention insertion
  // ============================================================================
  const { executeSlashCommand, insertMentionOption, handleCustomDateSelect } =
    useEditorCommands({
      editorInstance,
      slashState,
      mentionState,
      includeTime,
      selectedHour,
      selectedMinute,
      selectedPeriod,
      handleQuickDueDate,
      setPriority,
      setShowAdvancedOptions,
      setShowCustomDatePicker,
      setCustomDate,
      setIncludeTime,
      setSelectedHour,
      setSelectedMinute,
      setSelectedPeriod,
      closeSlashMenu,
      closeMentionMenu,
      handleConvertToTaskRef,
    });

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
        const { data: newTask, error } = await supabase
          .from('tasks')
          .insert({
            name,
            list_id: listId,
          })
          .select('id, name')
          .single();

        if (error || !newTask) throw error;
        return newTask;
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

    // Only invalidate time tracking data since task availability affects it
    // Note: We intentionally do NOT invalidate the tasks cache here to avoid
    // conflicts with realtime sync and unnecessary full-board refetches.
    // The realtime subscription will handle adding the new task to the cache.
    await queryClient.invalidateQueries({
      queryKey: ['time-tracking-data'],
    });

    toast({
      title: 'Task created',
      description: `Created task "${result.taskName}" and added mention`,
    });
  }, [editorInstance, boardId, availableLists, queryClient, toast]);

  const handleSave = useCallback(async () => {
    if (!name?.trim()) return;

    // Clear any pending name update timer since we're saving now
    if (nameUpdateTimerRef.current) {
      clearTimeout(nameUpdateTimerRef.current);
      nameUpdateTimerRef.current = null;
      pendingNameRef.current = null;
    }

    let currentDescription = description;
    if (flushEditorPendingRef.current) {
      const flushedContent = flushEditorPendingRef.current();
      if (flushedContent) {
        currentDescription = flushedContent;
      }
    }

    setIsSaving(true);
    setIsLoading(true);

    clearDraft(draftStorageKey);

    let descriptionString: string | null = null;
    if (currentDescription) {
      try {
        descriptionString = JSON.stringify(currentDescription);
      } catch (serializationError) {
        console.error('Failed to serialize description:', serializationError);
        descriptionString = null;
      }
    }

    if (isCreateMode) {
      try {
        const { createTask } = await import('@tuturuuu/utils/task-helper');
        const taskData: Partial<Task> = {
          name: name.trim(),
          description: descriptionString || '',
          priority: priority,
          start_date: startDate ? startDate.toISOString() : undefined,
          end_date: endDate ? endDate.toISOString() : undefined,
          estimation_points: estimationPoints ?? null,
          // Scheduling fields
          total_duration: totalDuration,
          is_splittable: isSplittable,
          min_split_duration_minutes: minSplitDurationMinutes,
          max_split_duration_minutes: maxSplitDurationMinutes,
          calendar_hours: calendarHours,
          auto_schedule: autoSchedule,
        };
        const newTask = await createTask(supabase, selectedListId, taskData);

        // If this is a subtask, create the parent-child relationship
        if (parentTaskId) {
          try {
            await createTaskRelationship(supabase, {
              source_task_id: parentTaskId,
              target_task_id: newTask.id,
              type: 'parent_child',
            });
          } catch (relationshipError) {
            // Log but don't fail task creation if relationship fails
            console.error(
              'Failed to create parent-child relationship:',
              relationshipError
            );
          }
          // Invalidate relationship caches
          await queryClient.invalidateQueries({
            queryKey: ['task-relationships', parentTaskId],
          });
        }

        // Handle pending relationships (parent, blocking, blocked-by, related)
        if (pendingRelationship) {
          try {
            const { type, relatedTaskId } = pendingRelationship;
            let relationshipData:
              | {
                  source_task_id: string;
                  target_task_id: string;
                  type: 'parent_child' | 'blocks' | 'related';
                }
              | undefined;

            switch (type) {
              case 'parent':
                // New task is the parent of the related task
                relationshipData = {
                  source_task_id: newTask.id,
                  target_task_id: relatedTaskId,
                  type: 'parent_child',
                };
                break;
              case 'blocking':
                // New task blocks the related task (related task is blocked by new task)
                relationshipData = {
                  source_task_id: relatedTaskId,
                  target_task_id: newTask.id,
                  type: 'blocks',
                };
                break;
              case 'blocked-by':
                // New task is blocked by the related task (new task blocks related task)
                relationshipData = {
                  source_task_id: newTask.id,
                  target_task_id: relatedTaskId,
                  type: 'blocks',
                };
                break;
              case 'related':
                relationshipData = {
                  source_task_id: relatedTaskId,
                  target_task_id: newTask.id,
                  type: 'related',
                };
                break;
            }

            if (relationshipData) {
              await createTaskRelationship(supabase, relationshipData);
              // Invalidate relationship caches for both tasks
              await queryClient.invalidateQueries({
                queryKey: ['task-relationships', relatedTaskId],
              });
              await queryClient.invalidateQueries({
                queryKey: ['task-relationships', newTask.id],
              });
            }
          } catch (relationshipError) {
            console.error(
              'Failed to create pending relationship:',
              relationshipError
            );
          }
        }

        if (selectedLabels.length > 0) {
          const { error: labelsError } = await supabase
            .from('task_labels')
            .insert(
              selectedLabels.map((l) => ({
                task_id: newTask.id,
                label_id: l.id,
              }))
            );
          if (labelsError) {
            console.error('Error adding labels:', labelsError);
          }
        }

        // Determine final assignees - auto-assign to self if enabled and no assignees selected
        let finalAssignees = [...selectedAssignees];
        if (
          finalAssignees.length === 0 &&
          userTaskSettings?.task_auto_assign_to_self &&
          user?.id &&
          !isPersonalWorkspace
        ) {
          finalAssignees = [
            {
              id: user.id,
              user_id: user.id,
              display_name: user.display_name,
              avatar_url: user.avatar_url,
            },
          ];
        }

        if (finalAssignees.length > 0) {
          // Use user_id if available, fallback to id for compatibility
          const assigneesToInsert = finalAssignees
            .map((a) => ({
              task_id: newTask.id,
              user_id: a.user_id || a.id,
            }))
            .filter((a) => a.user_id); // Filter out any with null/undefined user_id

          if (assigneesToInsert.length > 0) {
            const { error: assigneesError } = await supabase
              .from('task_assignees')
              .insert(assigneesToInsert);
            if (assigneesError) {
              console.error('Error adding assignees:', assigneesError);
              toast({
                title: 'Warning',
                description:
                  'Task created but some assignees could not be added',
                variant: 'destructive',
              });
            }
          }
        }

        if (selectedProjects.length > 0) {
          const { error: projectsError } = await supabase
            .from('task_project_tasks')
            .insert(
              selectedProjects.map((p) => ({
                task_id: newTask.id,
                project_id: p.id,
              }))
            );
          if (projectsError) {
            console.error('Error adding projects:', projectsError);
          }
        }

        // Note: Auto-scheduling is handled by the Smart Schedule button in Calendar
        // The autoSchedule flag is saved to the task for the unified scheduler to use

        // Add the new task to the cache directly instead of invalidating
        // This avoids full-board refetch flickering and conflicts with realtime sync
        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return [newTask];
            // Check if task already exists (from realtime), if so don't duplicate
            if (old.some((t) => t.id === newTask.id)) return old;
            return [...old, newTask];
          }
        );
        // Only invalidate time tracking data since task availability affects it
        await queryClient.invalidateQueries({
          queryKey: ['time-tracking-data'],
        });
        toast({
          title: parentTaskId ? 'Sub-task created' : 'Task created',
          description: parentTaskId ? 'New sub-task added.' : 'New task added.',
        });
        onUpdate();
        if (createMultiple) {
          setName('');
          setDescription(null);
          setTimeout(() => {
            const input = document.querySelector<HTMLInputElement>(
              'input[placeholder="What needs to be done?"]'
            );
            input?.focus();
          }, 0);
        } else {
          setName('');
          setDescription(null);
          setPriority(null);
          setStartDate(undefined);
          setEndDate(undefined);
          setEstimationPoints(null);
          setSelectedLabels([]);
          setSelectedAssignees([]);
          setSelectedProjects([]);
          onClose();
        }
      } catch (error: any) {
        console.error('Error creating task:', error);
        toast({
          title: 'Error creating task',
          description: error.message || 'Please try again later',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
        setIsSaving(false);
      }
      return;
    }

    // When collaboration is enabled, get description from Yjs for embeddings
    const taskUpdates: any = {
      name: name.trim(),
      priority: priority,
      start_date: startDate ? startDate.toISOString() : null,
      end_date: endDate ? endDate.toISOString() : null,
      list_id: selectedListId,
      estimation_points: estimationPoints ?? null,
      // Scheduling fields
      total_duration: totalDuration,
      is_splittable: isSplittable,
      min_split_duration_minutes: minSplitDurationMinutes,
      max_split_duration_minutes: maxSplitDurationMinutes,
      calendar_hours: calendarHours,
      auto_schedule: autoSchedule,
    };

    // Always update description field for embeddings and calculations
    // In collaboration mode, get the current state from Yjs
    // In non-collaboration mode, use the local description state
    if (collaborationMode && flushEditorPendingRef.current) {
      const yjsDescription = flushEditorPendingRef.current();
      taskUpdates.description = yjsDescription
        ? JSON.stringify(yjsDescription)
        : null;
    } else {
      taskUpdates.description = descriptionString;
    }

    if (task?.id) {
      // Close dialog immediately for better UX
      onClose();

      updateTaskMutation.mutate(
        {
          taskId: task.id,
          updates: taskUpdates,
        },
        {
          onSuccess: async () => {
            // Note: useUpdateTask already has optimistic updates in onMutate
            // and proper cache updates in onSuccess, so no need to invalidate
            // or refetch here. Realtime handles cross-user sync.
            toast({
              title: 'Task updated',
              description: 'The task has been successfully updated.',
            });
            onUpdate();
          },
          onError: (error: any) => {
            console.error('Error updating task:', error);
            toast({
              title: 'Error updating task',
              description: error.message || 'Please try again later',
              variant: 'destructive',
            });
            // Reopen dialog on error so user can retry
            // Note: This won't work well, consider showing error differently
          },
          onSettled: () => {
            setIsLoading(false);
            setIsSaving(false);
          },
        }
      );
    }
  }, [
    name,
    description,
    draftStorageKey,
    isCreateMode,
    priority,
    startDate,
    endDate,
    estimationPoints,
    selectedListId,
    selectedLabels,
    selectedAssignees,
    selectedProjects,
    queryClient,
    boardId,
    toast,
    onUpdate,
    createMultiple,
    onClose,
    task?.id,
    updateTaskMutation,
    collaborationMode,
    setName,
    setDescription,
    setPriority,
    setStartDate,
    setEndDate,
    setEstimationPoints,
    setSelectedLabels,
    setSelectedAssignees,
    setSelectedProjects,
    // Scheduling fields
    totalDuration,
    isSplittable,
    minSplitDurationMinutes,
    maxSplitDurationMinutes,
    calendarHours,
    autoSchedule,
    parentTaskId,
    pendingRelationship,
    isPersonalWorkspace,
    user?.avatar_url,
    user?.display_name,
    user?.id,
    userTaskSettings?.task_auto_assign_to_self,
  ]);

  // Note: Manual scheduling removed - handled by Smart Schedule button in Calendar

  const handleClose = useCallback(async () => {
    // Check if we're in collaboration mode and not synced - show warning
    if (collaborationMode && !isCreateMode && (!synced || !connected)) {
      setShowSyncWarning(true);
      return;
    }

    // Close dialog immediately for instant UX
    onClose();

    // Handle background saves asynchronously (non-blocking)
    const performBackgroundSaves = async () => {
      try {
        // Flush any pending name update
        if (flushNameUpdate) {
          await flushNameUpdate();
        }

        // Save Yjs description to database for embeddings and calculations
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
            context: 'close',
          });
        }

        // Clean up draft storage
        if (!isCreateMode) {
          clearDraft(draftStorageKey);
        }
      } catch (error) {
        console.error('Error during background save on close:', error);
      }
    };

    // Run saves in background without blocking close
    performBackgroundSaves();
  }, [
    flushNameUpdate,
    collaborationMode,
    isCreateMode,
    synced,
    connected,
    draftStorageKey,
    onClose,
    task?.id,
    boardId,
    queryClient,
  ]);

  const handleForceClose = useCallback(async () => {
    setShowSyncWarning(false);

    // Close dialog immediately for instant UX
    onClose();

    // Handle background saves asynchronously (non-blocking)
    const performBackgroundSaves = async () => {
      try {
        // Flush any pending name update
        if (flushNameUpdate) {
          await flushNameUpdate();
        }

        // Save Yjs description to database for embeddings and calculations
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
            context: 'force-close',
          });
        }

        // Clean up draft storage
        if (!isCreateMode) {
          clearDraft(draftStorageKey);
        }
      } catch (error) {
        console.error('Error during background save on force close:', error);
      }
    };

    // Run saves in background without blocking close
    performBackgroundSaves();
  }, [
    isCreateMode,
    draftStorageKey,
    onClose,
    flushNameUpdate,
    collaborationMode,
    task?.id,
    boardId,
    queryClient,
  ]);

  // Navigate back to the related task (for create mode with pending relationship)
  const handleNavigateBack = useCallback(async () => {
    // Get the task ID to navigate back to
    const taskIdToNavigateTo =
      pendingRelationship?.relatedTaskId ?? parentTaskId;

    if (!taskIdToNavigateTo || !onNavigateToTask) {
      // If no related task or navigation function, just close
      onClose();
      return;
    }

    // Navigate to the related task
    await onNavigateToTask(taskIdToNavigateTo);
  }, [
    pendingRelationship?.relatedTaskId,
    parentTaskId,
    onNavigateToTask,
    onClose,
  ]);

  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      if (
        !open &&
        !showCustomDatePicker &&
        !slashState.open &&
        !mentionState.open
      ) {
        handleClose();
      }
    },
    [showCustomDatePicker, slashState.open, mentionState.open, handleClose]
  );

  // ============================================================================
  // EFFECTS - Side effects for data fetching, state synchronization, etc.
  // ============================================================================

  // Auto-close sync warning dialog when sync completes
  useEffect(() => {
    if (showSyncWarning && synced && connected) {
      // Give a brief moment for user to see the success state
      const timer = setTimeout(async () => {
        setShowSyncWarning(false);
        // Flush any pending name update before closing
        await flushNameUpdate();

        // Save Yjs description to database for embeddings and calculations
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

        // Now safe to close - proceed with the actual close
        if (!isCreateMode) {
          clearDraft(draftStorageKey);
        }
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

  // Initialize Yjs state for task description if not present
  useEffect(() => {
    if (!task?.id || !editorInstance?.schema || !description || !doc) return;

    const initializeYjsState = async () => {
      try {
        const { data: taskData, error: taskDataError } = await supabase
          .from('tasks')
          .select('description_yjs_state')
          .eq('id', task.id)
          .single();

        if (taskDataError) throw taskDataError;

        if (!taskData?.description_yjs_state) {
          const yjsState = convertJsonContentToYjsState(
            description,
            editorInstance.schema
          );

          const { error: updateError } = await supabase
            .from('tasks')
            .update({ description_yjs_state: Array.from(yjsState) })
            .eq('id', task.id);

          if (updateError) throw updateError;

          Y.applyUpdate(doc, yjsState);
        }
      } catch (error) {
        console.error('Error initializing Yjs state:', error);
      }
    };
    initializeYjsState();
  }, [doc, description, editorInstance, task?.id]);

  // Event-based sync: Update description field from Yjs for real-time UI updates (checkbox counts, etc.)
  // Listens to Yjs document updates and debounces DB writes to avoid unnecessary operations
  // This ensures task cards show accurate metadata (e.g., checkbox counts) without saving/closing
  useEffect(() => {
    // Only run in collaboration mode when dialog is open and we have a valid task
    if (
      !collaborationMode ||
      isCreateMode ||
      !isOpen ||
      !task?.id ||
      !flushEditorPendingRef.current ||
      !doc
    ) {
      return;
    }

    let lastSyncedContent: string | null = null;

    const syncDescriptionFromYjs = async () => {
      if (!flushEditorPendingRef.current) return;

      const currentDescription = flushEditorPendingRef.current();

      // Convert to string for comparison (null if empty, JSON string if has content)
      const descriptionString = currentDescription
        ? JSON.stringify(currentDescription)
        : null;

      // Only update if content has actually changed (avoids unnecessary DB writes)
      if (descriptionString === lastSyncedContent) {
        return;
      }

      // Save to database using centralized helper
      const success = await saveYjsDescriptionToDatabase({
        taskId: task.id,
        getContent: () => currentDescription,
        boardId,
        queryClient,
        context: 'yjs-update',
      });

      if (success) {
        lastSyncedContent = descriptionString;
      }
    };

    // Debounce the sync function to avoid excessive DB writes
    const debouncedSync = debounce(
      syncDescriptionFromYjs,
      DESCRIPTION_SYNC_DEBOUNCE_MS
    );

    // Listen to Yjs document updates
    const handleYjsUpdate = () => {
      debouncedSync();
    };

    doc.on('update', handleYjsUpdate);

    // Initial sync on mount
    syncDescriptionFromYjs();

    return () => {
      doc.off('update', handleYjsUpdate);
      debouncedSync.cancel(); // Cancel any pending debounced calls
    };
  }, [
    collaborationMode,
    isCreateMode,
    isOpen,
    task?.id,
    boardId,
    queryClient,
    doc,
  ]);

  // Reset state when dialog closes or opens
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    if (!isOpen) {
      // Clear pending name update timer
      if (nameUpdateTimerRef.current) {
        clearTimeout(nameUpdateTimerRef.current);
        nameUpdateTimerRef.current = null;
        pendingNameRef.current = null;
      }
      setSlashState(createInitialSuggestionState());
      setMentionState(createInitialSuggestionState());
      setEditorInstance(null);
      setSlashHighlightIndex(0);
      setMentionHighlightIndex(0);
      previousMentionHighlightRef.current = 0;
      previousSlashHighlightRef.current = 0;
      setShowCustomDatePicker(false);
      setCustomDate(undefined);
      setIncludeTime(false);
      setSelectedHour('11');
      setSelectedMinute('59');
      setSelectedPeriod('PM');
    } else {
      if (isCreateMode && filters) {
        // Apply labels from filters
        if (filters.labels && filters.labels.length > 0) {
          setSelectedLabels(filters.labels);
        }

        // Apply assignees from filters or add current user if includeMyTasks is true
        if (filters.assignees && filters.assignees.length > 0) {
          // Transform filter assignees to include user_id (filters have 'id', save expects 'user_id')
          const transformedAssignees = filters.assignees.map((a) => ({
            ...a,
            user_id: a.id, // Add user_id from id
          }));
          setSelectedAssignees(transformedAssignees);
        } else if (filters.includeMyTasks) {
          // Fetch and add current user
          (async () => {
            try {
              const {
                data: { user },
              } = await supabase.auth.getUser();

              if (!user || !isMountedRef.current) {
                return;
              }

              // Fetch current user's details
              const { data: userData } = await supabase
                .from('users')
                .select('id, display_name, avatar_url')
                .eq('id', user.id)
                .single();

              if (userData && isMountedRef.current) {
                setSelectedAssignees([
                  {
                    user_id: userData.id,
                    id: userData.id,
                    display_name: userData.display_name,
                    avatar_url: userData.avatar_url,
                  },
                ]);
              }
            } catch {
              // Silently fail - user can still manually select assignees
            }
          })();
        }

        // Apply projects from filters
        if (filters.projects && filters.projects.length > 0) {
          setSelectedProjects(filters.projects);
        }

        // Apply priority if only one priority is selected in filters
        if (filters.priorities && filters.priorities.length === 1) {
          setPriority(filters.priorities[0] || null);
        }
      }
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [
    isOpen,
    isCreateMode,
    filters,
    setPriority,
    setSelectedLabels,
    setSelectedAssignees,
    setSelectedProjects,
  ]);

  // Manage slash command highlight index
  useEffect(() => {
    if (!slashState.open) {
      setSlashHighlightIndex(0);
      previousSlashQueryRef.current = '';
      return;
    }

    if (previousSlashQueryRef.current !== slashState.query) {
      previousSlashQueryRef.current = slashState.query;
      setSlashHighlightIndex(0);
      return;
    }

    setSlashHighlightIndex((prev) => {
      if (filteredSlashCommands.length === 0) return 0;
      return Math.min(prev, filteredSlashCommands.length - 1);
    });
  }, [slashState.open, slashState.query, filteredSlashCommands.length]);

  // Scroll slash command menu item into view
  useEffect(() => {
    if (!slashState.open) return;

    if (previousSlashHighlightRef.current === slashHighlightIndex) return;
    previousSlashHighlightRef.current = slashHighlightIndex;

    const timeoutId = setTimeout(() => {
      const container = slashListRef.current;
      if (!container) return;

      const activeItem = container.querySelector<HTMLElement>(
        `[data-slash-item="${slashHighlightIndex}"]`
      );
      if (!activeItem) return;

      const containerRect = container.getBoundingClientRect();
      const itemRect = activeItem.getBoundingClientRect();

      const isVisible =
        itemRect.top >= containerRect.top &&
        itemRect.bottom <= containerRect.bottom;

      if (!isVisible) {
        activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 10);

    return () => clearTimeout(timeoutId);
  }, [slashHighlightIndex, slashState.open]);

  // Manage mention highlight index
  useEffect(() => {
    if (!mentionState.open) {
      setMentionHighlightIndex(0);
      previousMentionQueryRef.current = '';
      return;
    }

    if (previousMentionQueryRef.current !== mentionState.query) {
      previousMentionQueryRef.current = mentionState.query;
      setMentionHighlightIndex(0);
      return;
    }

    setMentionHighlightIndex((prev) => {
      if (filteredMentionOptions.length === 0) return 0;
      return Math.min(prev, filteredMentionOptions.length - 1);
    });
  }, [mentionState.open, mentionState.query, filteredMentionOptions.length]);

  // Scroll mention menu item into view
  useEffect(() => {
    if (!mentionState.open) return;

    if (previousMentionHighlightRef.current === mentionHighlightIndex) return;
    previousMentionHighlightRef.current = mentionHighlightIndex;

    const timeoutId = setTimeout(() => {
      const container = mentionListRef.current;
      if (!container) return;

      const activeItem = container.querySelector<HTMLElement>(
        `[data-mention-item="${mentionHighlightIndex}"]`
      );
      if (!activeItem) return;

      const containerRect = container.getBoundingClientRect();
      const itemRect = activeItem.getBoundingClientRect();

      const isVisible =
        itemRect.top >= containerRect.top &&
        itemRect.bottom <= containerRect.bottom;

      if (!isVisible) {
        activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 10);

    return () => clearTimeout(timeoutId);
  }, [mentionHighlightIndex, mentionState.open]);

  // Update slash and mention suggestions based on editor state
  useEffect(() => {
    if (!editorInstance || !isOpen) {
      closeSlashMenu();
      closeMentionMenu();
      return;
    }

    const computePosition = (fromPos: number) => {
      try {
        const coords = editorInstance.view.coordsAtPos(fromPos);
        if (!coords) return null;
        const viewportWidth =
          typeof window !== 'undefined' ? window.innerWidth : undefined;
        const horizontalPadding = 16;
        let left = coords.left;
        if (viewportWidth) {
          left = Math.min(
            left,
            viewportWidth - suggestionMenuWidth - horizontalPadding
          );
          left = Math.max(left, horizontalPadding);
        }
        return { left, top: coords.bottom + 8 } as SuggestionState['position'];
      } catch {
        return null;
      }
    };

    const updateSuggestions = () => {
      const { state } = editorInstance;
      const { selection } = state;

      if (!selection.empty) {
        closeSlashMenu();
        if (!showCustomDatePicker) {
          closeMentionMenu();
        }
        return;
      }

      const { from } = selection;
      const contextText = state.doc.textBetween(
        Math.max(0, from - 200),
        from,
        '\n',
        ' '
      );

      const slashMatch = contextText.match(/(?:^|\s)(\/([^\s]*))$/);
      if (slashMatch) {
        const matched = slashMatch[1] || '';
        const query = slashMatch[2] || '';
        const rangeFrom = from - matched.length;
        const nextState: SuggestionState = {
          open: true,
          query,
          range: { from: rangeFrom, to: from },
          position: computePosition(rangeFrom),
        };

        setSlashState((prev) =>
          isSameSuggestionState(prev, nextState) ? prev : nextState
        );
      } else {
        closeSlashMenu();
      }

      const mentionMatch = contextText.match(
        /(?:^|\s)(@(?:"([^"]*)"|([^\s]*)))$/
      );
      if (mentionMatch) {
        const matched = mentionMatch[1] || '';
        const query =
          mentionMatch[2] !== undefined
            ? mentionMatch[2]
            : mentionMatch[3] || '';
        const rangeFrom = from - matched.length;
        const nextState: SuggestionState = {
          open: true,
          query,
          range: { from: rangeFrom, to: from },
          position: computePosition(rangeFrom),
        };

        setMentionState((prev) =>
          isSameSuggestionState(prev, nextState) ? prev : nextState
        );
        closeSlashMenu();
      } else {
        if (!showCustomDatePicker) {
          closeMentionMenu();
        }
      }
    };

    const handleBlur = () => {
      if (showCustomDatePicker) {
        closeSlashMenu();
        return;
      }
      closeSlashMenu();
      closeMentionMenu();
    };

    editorInstance.on('transaction', updateSuggestions);
    editorInstance.on('selectionUpdate', updateSuggestions);
    editorInstance.on('blur', handleBlur);

    updateSuggestions();

    return () => {
      editorInstance.off('transaction', updateSuggestions);
      editorInstance.off('selectionUpdate', updateSuggestions);
      editorInstance.off('blur', handleBlur);
    };
  }, [
    editorInstance,
    isOpen,
    closeSlashMenu,
    closeMentionMenu,
    showCustomDatePicker,
    suggestionMenuWidth,
  ]);

  // Blur editor when custom date picker opens
  useEffect(() => {
    if (showCustomDatePicker && editorInstance) {
      editorInstance.commands.blur();
    }
  }, [showCustomDatePicker, editorInstance]);

  // Reset form when task changes or dialog opens
  useEffect(() => {
    const taskIdChanged = previousTaskIdRef.current !== task?.id;

    // Helper to check if filters have any active values
    const hasActiveFilters =
      filters &&
      ((filters.labels && filters.labels.length > 0) ||
        (filters.assignees && filters.assignees.length > 0) ||
        (filters.projects && filters.projects.length > 0) ||
        (filters.priorities && filters.priorities.length > 0) ||
        filters.includeMyTasks);

    if (isOpen && !isCreateMode && taskIdChanged) {
      setName(task?.name || '');
      setDescription(getDescriptionContent(task?.description));
      setPriority(task?.priority || null);
      setStartDate(task?.start_date ? new Date(task?.start_date) : undefined);
      setEndDate(task?.end_date ? new Date(task?.end_date) : undefined);
      setSelectedListId(task?.list_id || '');
      setEstimationPoints(task?.estimation_points ?? null);
      setSelectedLabels(task?.labels || []);
      setSelectedAssignees(task?.assignees || []);
      setSelectedProjects(task?.projects || []);
      if (task?.id) previousTaskIdRef.current = task.id;
    } else if (
      isOpen &&
      (isCreateMode || task?.id === 'new') &&
      taskIdChanged &&
      !hasActiveFilters // Only reset if no active filters
    ) {
      setName(task?.name || '');
      setDescription(getDescriptionContent(task?.description) || null);
      setPriority(task?.priority || null);
      setStartDate(task?.start_date ? new Date(task?.start_date) : undefined);
      setEndDate(task?.end_date ? new Date(task?.end_date) : undefined);
      setSelectedListId(task?.list_id || '');
      setEstimationPoints(task?.estimation_points ?? null);
      setSelectedLabels(task?.labels || []);
      setSelectedAssignees(task?.assignees || []);
      setSelectedProjects(task?.projects || []);
      if (task?.id) previousTaskIdRef.current = task.id;
    }
  }, [
    isCreateMode,
    isOpen,
    task,
    filters,
    setName,
    setDescription,
    setPriority,
    setStartDate,
    setEndDate,
    setSelectedListId,
    setEstimationPoints,
    setSelectedLabels,
    setSelectedAssignees,
    setSelectedProjects,
  ]);

  // Reset transient edits when closing without saving in edit mode
  useEffect(() => {
    if (!isOpen && previousTaskIdRef.current && !isCreateMode) {
      setName(task?.name || '');
      setDescription(getDescriptionContent(task?.description));
      setPriority(task?.priority || null);
      setStartDate(task?.start_date ? new Date(task?.start_date) : undefined);
      setEndDate(task?.end_date ? new Date(task?.end_date) : undefined);
      setSelectedListId(task?.list_id || '');
      setEstimationPoints(task?.estimation_points ?? null);
      setSelectedLabels(task?.labels || []);
      setSelectedAssignees(task?.assignees || []);
      setSelectedProjects(task?.projects || []);
    }
  }, [
    isOpen,
    isCreateMode,
    task,
    setName,
    setDescription,
    setPriority,
    setStartDate,
    setEndDate,
    setSelectedListId,
    setEstimationPoints,
    setSelectedLabels,
    setSelectedAssignees,
    setSelectedProjects,
  ]);

  // Debounced task search when typing in mention menu
  useEffect(() => {
    if (!isOpen || !wsId || !mentionState.open) {
      if (taskSearchQuery) {
        setTaskSearchQuery('');
      }
      return;
    }

    const query = mentionState.query.trim();

    if (taskSearchDebounceRef.current) {
      clearTimeout(taskSearchDebounceRef.current);
    }

    taskSearchDebounceRef.current = setTimeout(() => {
      if (query !== taskSearchQuery) {
        setTaskSearchQuery(query);
        // React Query will automatically refetch when taskSearchQuery changes
      }
    }, 300);

    return () => {
      if (taskSearchDebounceRef.current) {
        clearTimeout(taskSearchDebounceRef.current);
      }
    };
  }, [isOpen, wsId, mentionState.open, mentionState.query, taskSearchQuery]);

  // ============================================================================
  // DRAFT PERSISTENCE - Now handled in useTaskFormState hook
  // ============================================================================
  // Draft loading, saving, and clearing are now managed by the useTaskFormState hook

  // Global keyboard shortcut: Cmd/Ctrl + Enter to save
  // Disabled in edit mode when collaboration is enabled (realtime sync)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        // Don't allow save shortcut in edit mode with collaboration (realtime sync)
        if (!isCreateMode && collaborationMode) {
          return;
        }
        if (canSave) {
          handleSaveRef.current();
        } else if (!hasUnsavedChangesRef.current) {
          handleCloseRef.current();
        }
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, canSave, collaborationMode, isCreateMode]);

  // Keyboard shortcuts for options (Alt-based)
  useEffect(() => {
    if (!isOpen) return;
    const isTypingTarget = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      const editable = (el as any).isContentEditable === true;
      return (
        editable || tag === 'input' || tag === 'textarea' || tag === 'select'
      );
    };

    const handleOptionShortcuts = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (isTypingTarget(e.target)) return;

      if (e.key === '1') {
        e.preventDefault();
        setPriority('critical');
        return;
      }
      if (e.key === '2') {
        e.preventDefault();
        setPriority('high');
        return;
      }
      if (e.key === '3') {
        e.preventDefault();
        setPriority('normal');
        return;
      }
      if (e.key === '4') {
        e.preventDefault();
        setPriority('low');
        return;
      }
      if (e.key === '0') {
        e.preventDefault();
        setPriority(null);
        return;
      }

      const lower = e.key.toLowerCase();
      if (lower === 't') {
        e.preventDefault();
        quickDueRef.current(0);
        return;
      }
      if (lower === 'm') {
        e.preventDefault();
        quickDueRef.current(1);
        return;
      }
      if (lower === 'w') {
        e.preventDefault();
        quickDueRef.current(7);
        return;
      }
      if (lower === 'd') {
        e.preventDefault();
        quickDueRef.current(null);
        return;
      }

      if (lower === 'a') {
        e.preventDefault();
        setShowAdvancedOptions((prev) => !prev);
        return;
      }

      if (e.shiftKey && boardConfig?.estimation_type) {
        if (/^[0-7]$/.test(e.key)) {
          e.preventDefault();
          const idx = Number(e.key);
          updateEstimationRef.current(idx);
          return;
        }
        if (lower === 'x') {
          e.preventDefault();
          updateEstimationRef.current(null);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleOptionShortcuts);
    return () => window.removeEventListener('keydown', handleOptionShortcuts);
  }, [isOpen, boardConfig?.estimation_type, setPriority]);

  // Editor keyboard navigation for slash and mention menus
  useEffect(() => {
    if (!editorInstance || !isOpen) return;

    const editorDom = editorInstance.view.dom as HTMLElement | null;
    if (!editorDom) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (showCustomDatePicker && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setShowCustomDatePicker(false);
        setCustomDate(undefined);
        return;
      }

      if ((slashState.open || mentionState.open) && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeSlashMenu();
        closeMentionMenu();
        return;
      }

      if (slashState.open) {
        if (filteredSlashCommands.length === 0) return;

        if (
          event.key === 'ArrowDown' ||
          (event.key === 'Tab' && !event.shiftKey)
        ) {
          event.preventDefault();
          event.stopPropagation();
          setSlashHighlightIndex(
            (prev) => (prev + 1) % filteredSlashCommands.length
          );
          return;
        }

        if (
          event.key === 'ArrowUp' ||
          (event.key === 'Tab' && event.shiftKey)
        ) {
          event.preventDefault();
          event.stopPropagation();
          setSlashHighlightIndex(
            (prev) =>
              (prev - 1 + filteredSlashCommands.length) %
              filteredSlashCommands.length
          );
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          const command = filteredSlashCommands[slashHighlightIndex];
          if (command) executeSlashCommand(command);
          return;
        }
      }

      if (mentionState.open && !showCustomDatePicker) {
        if (filteredMentionOptions.length === 0) return;

        if (
          event.key === 'ArrowDown' ||
          (event.key === 'Tab' && !event.shiftKey)
        ) {
          event.preventDefault();
          event.stopPropagation();
          setMentionHighlightIndex(
            (prev) => (prev + 1) % filteredMentionOptions.length
          );
          return;
        }

        if (
          event.key === 'ArrowUp' ||
          (event.key === 'Tab' && event.shiftKey)
        ) {
          event.preventDefault();
          event.stopPropagation();
          setMentionHighlightIndex(
            (prev) =>
              (prev - 1 + filteredMentionOptions.length) %
              filteredMentionOptions.length
          );
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          const option = filteredMentionOptions[mentionHighlightIndex];
          if (option) insertMentionOption(option);
          return;
        }
      }
    };

    editorDom.addEventListener('keydown', handleKeyDown, true);
    return () => {
      editorDom.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [
    editorInstance,
    isOpen,
    slashState.open,
    mentionState.open,
    filteredSlashCommands,
    filteredMentionOptions,
    slashHighlightIndex,
    mentionHighlightIndex,
    executeSlashCommand,
    insertMentionOption,
    closeSlashMenu,
    closeMentionMenu,
    showCustomDatePicker,
  ]);

  // Update stable refs
  handleSaveRef.current = handleSave;
  handleCloseRef.current = handleClose;
  hasUnsavedChangesRef.current = hasUnsavedChanges;
  quickDueRef.current = handleQuickDueDate;
  updateEstimationRef.current = updateEstimation;
  handleConvertToTaskRef.current = handleConvertToTask;
  flushNameUpdateRef.current = flushNameUpdate;

  // ============================================================================
  // RENDER HELPERS - JSX fragments and menu components
  // ============================================================================
  const slashCommandMenu = (
    <SlashCommandMenu
      isOpen={slashState.open}
      position={slashState.position}
      commands={filteredSlashCommands}
      highlightIndex={slashHighlightIndex}
      onSelect={executeSlashCommand}
      onHighlightChange={setSlashHighlightIndex}
      listRef={slashListRef}
    />
  );

  const mentionSuggestionMenu = (
    <>
      <MentionMenu
        isOpen={mentionState.open}
        position={mentionState.position}
        options={filteredMentionOptions}
        highlightIndex={mentionHighlightIndex}
        isLoading={workspaceTasksLoading}
        query={mentionState.query}
        onSelect={insertMentionOption}
        onHighlightChange={setMentionHighlightIndex}
        listRef={mentionListRef}
      />
      {showCustomDatePicker &&
        mentionState.position &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="pointer-events-auto"
            style={{
              position: 'fixed',
              top: mentionState.position.top,
              left: mentionState.position.left,
              zIndex: 9999,
            }}
          >
            <CustomDatePickerDialog
              selectedDate={customDate}
              includeTime={includeTime}
              selectedHour={selectedHour}
              selectedMinute={selectedMinute}
              selectedPeriod={selectedPeriod}
              onDateSelect={setCustomDate}
              onIncludeTimeChange={setIncludeTime}
              onHourChange={setSelectedHour}
              onMinuteChange={setSelectedMinute}
              onPeriodChange={setSelectedPeriod}
              onCancel={() => {
                setShowCustomDatePicker(false);
                setCustomDate(undefined);
                setIncludeTime(false);
                setSelectedHour('12');
                setSelectedMinute('00');
                setSelectedPeriod('PM');
              }}
              onInsert={() => {
                if (customDate) {
                  handleCustomDateSelect(customDate);
                }
              }}
            />
          </div>,
          document.body
        )}
    </>
  );

  // ============================================================================
  // JSX RENDER
  // ============================================================================
  return (
    <>
      {slashCommandMenu}
      {mentionSuggestionMenu}
      <Dialog open={isOpen} onOpenChange={handleDialogOpenChange} modal={true}>
        <DialogContent
          showCloseButton={false}
          className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom-2 data-[state=open]:slide-in-from-bottom-2 inset-0! top-0! left-0! flex h-screen max-h-screen w-screen max-w-none! translate-x-0! translate-y-0! gap-0 rounded-none! border-0 p-0"
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onPointerDownOutside={(e) => {
            if (showCustomDatePicker || slashState.open || mentionState.open) {
              e.preventDefault();
            }
          }}
          onInteractOutside={(e) => {
            if (showCustomDatePicker || slashState.open || mentionState.open) {
              e.preventDefault();
            }
          }}
        >
          {/* Main content area - Task title and description */}
          <div className="flex min-w-0 flex-1 flex-col bg-background transition-all duration-300">
            {/* Enhanced Header with gradient */}
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
              hasDraft={hasDraft}
              wsId={wsId}
              boardId={boardId}
              pathname={pathname}
              canSave={canSave}
              isLoading={isLoading}
              setCreateMultiple={setCreateMultiple}
              handleClose={handleClose}
              setShowDeleteConfirm={setShowDeleteConfirm}
              clearDraftState={clearDraftState}
              handleSave={handleSave}
              onNavigateBack={
                isCreateMode && (pendingRelationship || parentTaskId)
                  ? handleNavigateBack
                  : undefined
              }
            />

            {/* Main editing area with improved spacing */}
            <div
              ref={editorContainerRef}
              className="relative flex min-h-0 flex-1 flex-col overflow-y-auto"
            >
              <div className="flex flex-col">
                {/* Task Name - Large and prominent with underline effect */}
                <TaskNameInput
                  name={name}
                  isCreateMode={isCreateMode}
                  titleInputRef={titleInputRef}
                  editorRef={editorRef}
                  lastCursorPositionRef={lastCursorPositionRef}
                  targetEditorCursorRef={targetEditorCursorRef}
                  setName={setName}
                  updateName={updateName}
                  flushNameUpdate={flushNameUpdate}
                />

                {/* Task Properties Section */}
                <TaskPropertiesSection
                  wsId={wsId}
                  taskId={task?.id}
                  priority={priority}
                  startDate={startDate}
                  endDate={endDate}
                  estimationPoints={estimationPoints}
                  selectedLabels={selectedLabels}
                  selectedProjects={selectedProjects}
                  selectedListId={selectedListId}
                  selectedAssignees={selectedAssignees}
                  isLoading={isLoading}
                  isPersonalWorkspace={isPersonalWorkspace}
                  // Scheduling state
                  totalDuration={totalDuration}
                  isSplittable={isSplittable}
                  minSplitDurationMinutes={minSplitDurationMinutes}
                  maxSplitDurationMinutes={maxSplitDurationMinutes}
                  calendarHours={calendarHours}
                  autoSchedule={autoSchedule}
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
                  // Scheduling handlers
                  onTotalDurationChange={setTotalDuration}
                  onIsSplittableChange={setIsSplittable}
                  onMinSplitDurationChange={setMinSplitDurationMinutes}
                  onMaxSplitDurationChange={setMaxSplitDurationMinutes}
                  onCalendarHoursChange={setCalendarHours}
                  onAutoScheduleChange={setAutoSchedule}
                  isCreateMode={isCreateMode}
                  savedSchedulingSettings={
                    task
                      ? {
                          totalDuration: task.total_duration ?? null,
                          isSplittable: task.is_splittable ?? false,
                          minSplitDurationMinutes:
                            task.min_split_duration_minutes ?? null,
                          maxSplitDurationMinutes:
                            task.max_split_duration_minutes ?? null,
                          calendarHours: task.calendar_hours ?? null,
                          autoSchedule: task.auto_schedule ?? false,
                        }
                      : undefined
                  }
                  onSaveSchedulingSettings={saveSchedulingSettings}
                  schedulingSaving={schedulingSaving}
                  scheduledEvents={localCalendarEvents}
                />

                {/* Task Relationships Properties - Parent, Sub-tasks, Dependencies, Related */}
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
                    if (onNavigateToTask) {
                      await onNavigateToTask(taskId);
                    }
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

                {/* Task Description - Full editor experience with subtle border */}
                <div ref={editorRef} className="relative">
                  <div
                    ref={richTextEditorRef}
                    className={cn(
                      'relative transition-opacity duration-300',
                      isYjsSyncing ? 'opacity-50' : 'opacity-100'
                    )}
                  >
                    <RichTextEditor
                      content={description}
                      onChange={setDescription}
                      writePlaceholder="Add a detailed description, attach files, or use markdown..."
                      titlePlaceholder=""
                      className="min-h-[calc(100vh-16rem)] border-0 bg-transparent px-4 focus-visible:outline-0 focus-visible:ring-0 md:px-8"
                      workspaceId={wsId || undefined}
                      onImageUpload={handleImageUpload}
                      flushPendingRef={flushEditorPendingRef}
                      initialCursorOffset={targetEditorCursorRef.current}
                      onEditorReady={handleEditorReady}
                      boardId={boardId}
                      availableLists={availableLists}
                      queryClient={queryClient}
                      onArrowUp={(cursorOffset) => {
                        // Focus the title input when pressing arrow up at the start
                        if (titleInputRef.current) {
                          titleInputRef.current.focus();

                          // Apply smart cursor positioning
                          if (cursorOffset !== undefined) {
                            const textLength =
                              titleInputRef.current.value.length;
                            // Use the stored position from last down arrow, or the offset from editor
                            const targetPosition =
                              lastCursorPositionRef.current ??
                              Math.min(cursorOffset, textLength);
                            titleInputRef.current.setSelectionRange(
                              targetPosition,
                              targetPosition
                            );
                            // Clear the stored position after use
                            lastCursorPositionRef.current = null;
                          }
                        }
                      }}
                      onArrowLeft={() => {
                        // Focus the title input at the end when pressing arrow left at the start
                        if (titleInputRef.current) {
                          titleInputRef.current.focus();
                          // Set cursor to the end of the input
                          const length = titleInputRef.current.value.length;
                          titleInputRef.current.setSelectionRange(
                            length,
                            length
                          );
                        }
                      }}
                      yjsDoc={
                        isOpen && !isCreateMode && collaborationMode
                          ? doc
                          : null
                      }
                      yjsProvider={
                        isOpen && !isCreateMode && collaborationMode
                          ? provider
                          : null
                      }
                      allowCollaboration={
                        isOpen && !isCreateMode && collaborationMode
                      }
                      editable={!isYjsSyncing}
                    />
                    {/* Collaboration sync indicator - shows while Yjs is syncing */}
                    {isYjsSyncing && (
                      <div className="pointer-events-none absolute top-4 right-4 flex items-center gap-2 rounded-lg border bg-background/95 px-3 py-2 shadow-lg backdrop-blur-sm md:right-8">
                        <Loader2 className="h-4 w-4 animate-spin text-dynamic-yellow" />
                        <p className="text-muted-foreground text-xs">
                          Syncing collaboration state...
                        </p>
                      </div>
                    )}
                    {isOpen && !isCreateMode && collaborationMode && (
                      <CursorOverlayWrapper
                        channelName={`editor-cursor-${task?.id}`}
                        containerRef={richTextEditorRef}
                      />
                    )}
                  </div>
                </div>

                {/* Task Activity Section - Only show in edit mode */}
                {!isCreateMode && task && (
                  <TaskActivitySection
                    wsId={wsId}
                    taskId={task.id}
                    boardId={boardId}
                    currentTask={{
                      id: task.id,
                      name: name || task.name || '',
                      description: description,
                      priority: priority,
                      start_date: startDate?.toISOString() || null,
                      end_date: endDate?.toISOString() || null,
                      estimation_points: estimationPoints ?? null,
                      list_id: selectedListId || task.list_id || '',
                      list_name:
                        availableLists?.find((l) => l.id === selectedListId)
                          ?.name || null,
                      completed: !!task.completed_at,
                      assignees: selectedAssignees.map((a) => ({
                        id: a.id,
                        user_id: a.id,
                      })),
                      labels: selectedLabels.map((l) => ({ id: l.id })),
                      projects: selectedProjects.map((p) => ({ id: p.id })),
                    }}
                    // NOTE: Snapshot reversion is disabled as the feature is not stable yet.
                    // Set to false when the feature is ready.
                    revertDisabled={true}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Mobile floating save button - hidden in edit mode when collaboration is enabled */}
          <MobileFloatingSaveButton
            isCreateMode={isCreateMode}
            collaborationMode={collaborationMode}
            isLoading={isLoading}
            canSave={canSave}
            handleSave={handleSave}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <TaskDeleteDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        taskId={task?.id}
        boardId={boardId}
        isLoading={isLoading}
        onSuccess={onUpdate}
        onClose={onClose}
      />

      {/* Sync warning dialog */}
      <SyncWarningDialog
        open={showSyncWarning}
        onOpenChange={setShowSyncWarning}
        synced={synced}
        connected={connected}
        onForceClose={handleForceClose}
      />

      {/* New Label Dialog */}
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

      {/* New Project Dialog */}
      <TaskNewProjectDialog
        open={showNewProjectDialog}
        newProjectName={newProjectName}
        creatingProject={creatingProject}
        onOpenChange={setShowNewProjectDialog}
        onNameChange={setNewProjectName}
        onConfirm={handleCreateProject}
      />

      {/* Board Estimation Config Dialog */}
      {boardConfig && wsId && (
        <BoardEstimationConfigDialog
          open={showEstimationConfigDialog}
          wsId={wsId}
          boardId={boardId}
          boardName={(boardConfig as any).name || 'Board'}
          currentEstimationType={boardConfig.estimation_type || null}
          currentExtendedEstimation={boardConfig.extended_estimation || false}
          currentAllowZeroEstimates={boardConfig.allow_zero_estimates ?? true}
          currentCountUnestimatedIssues={
            (boardConfig as any).count_unestimated_issues || false
          }
          onOpenChange={setShowEstimationConfigDialog}
          onSuccess={handleEstimationConfigSuccess}
        />
      )}
    </>
  );
}
