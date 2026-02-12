'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { TaskFilters } from '@tuturuuu/ui/tu-do/boards/boardId/task-filter';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  PendingRelationship,
  PendingRelationshipType,
} from '../shared/task-edit-dialog/types/pending-relationship';
import { useOptionalWorkspacePresenceContext } from './workspace-presence-provider';
export type { PendingRelationship, PendingRelationshipType };

// Type definitions for Supabase join row responses
// Note: Supabase uses null for optional fields, not undefined
interface TaskAssigneeJoinRow {
  user_id: string;
  users?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface TaskLabelJoinRow {
  label_id: string;
  workspace_task_labels?: {
    id: string;
    name: string;
    color: string | null;
    created_at: string | null;
  } | null;
}

interface TaskProjectJoinRow {
  project_id: string;
  task_projects?: {
    id: string;
    name: string;
    status: string | null;
  } | null;
}

interface TaskDialogState {
  isOpen: boolean;
  task?: Task;
  boardId?: string;
  mode?: 'edit' | 'create';
  availableLists?: TaskList[];
  collaborationMode?: boolean;
  /** Whether realtime features (Yjs sync, presence avatars) are enabled - true for all tiers */
  realtimeEnabled?: boolean;
  originalPathname?: string;
  filters?: TaskFilters;
  fakeTaskUrl?: boolean;
  parentTaskId?: string; // For creating subtasks (legacy, kept for backward compatibility)
  parentTaskName?: string; // Name of parent task for subtasks (legacy)
  pendingRelationship?: PendingRelationship; // Generic relationship for new tasks
  draftId?: string; // When editing an existing draft
  /** The task's actual workspace ID for correct URL routing (may differ from current wsId) */
  taskWsId?: string;
}

interface TaskDialogContextValue {
  // Current dialog state
  state: TaskDialogState;

  // Whether the current workspace is personal
  isPersonalWorkspace: boolean;

  // Open dialog for editing existing task
  openTask: (
    task: Task,
    boardId: string,
    availableLists?: TaskList[],
    fakeTaskUrl?: boolean,
    options?: {
      preserveUrl?: boolean;
      /** The task's actual workspace ID for correct URL routing */
      taskWsId?: string;
      /** Whether the task's workspace is personal (affects realtime features) */
      taskWorkspacePersonal?: boolean;
    }
  ) => void;

  // Open task by ID (fetches task data first)
  openTaskById: (taskId: string) => Promise<void>;

  // Open dialog for creating new task
  createTask: (
    boardId: string,
    listId: string,
    availableLists?: TaskList[],
    filters?: TaskFilters
  ) => void;

  // Open dialog for creating a subtask (child of existing task)
  createSubtask: (
    parentTaskId: string,
    parentTaskName: string,
    boardId: string,
    listId: string,
    availableLists?: TaskList[]
  ) => void;

  // Open dialog for creating a task with a pending relationship
  createTaskWithRelationship: (
    relationshipType: PendingRelationshipType,
    relatedTaskId: string,
    relatedTaskName: string,
    boardId: string,
    listId: string,
    availableLists?: TaskList[]
  ) => void;

  // Open dialog for editing an existing draft (reuses full TaskEditDialog)
  editDraft: (draft: {
    id: string;
    name: string;
    description?: string | null;
    priority?: string | null;
    board_id?: string | null;
    list_id?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    estimation_points?: number | null;
    label_ids?: string[];
    assignee_ids?: string[];
    project_ids?: string[];
  }) => Promise<void>;

  // Close dialog
  closeDialog: () => void;

  // Register callback for when task is updated (returns cleanup function)
  onUpdate: (callback: () => void) => () => void;

  // Register callback for when dialog is closed
  onClose: (callback: () => void) => void;

  // Trigger the registered update callback (internal use)
  triggerUpdate: () => void;

  // Trigger the registered close callback (internal use)
  triggerClose: () => void;
}

const TaskDialogContext = createContext<TaskDialogContextValue | null>(null);

export function useTaskDialogContext() {
  const context = useContext(TaskDialogContext);
  if (!context) {
    throw new Error(
      'useTaskDialogContext must be used within TaskDialogProvider'
    );
  }
  return context;
}

interface TaskDialogProviderProps {
  children: ReactNode;
  onUpdate?: () => void;
  isPersonalWorkspace?: boolean;
}

export function TaskDialogProvider({
  children,
  onUpdate: externalOnUpdate,
  isPersonalWorkspace = false,
}: TaskDialogProviderProps) {
  const [state, setState] = useState<TaskDialogState>({
    isOpen: false,
  });

  // Read cursorsEnabled and realtimeEnabled from workspace presence context
  // (always true in DEV_MODE via the provider)
  const wsPresence = useOptionalWorkspacePresenceContext();
  const cursorsEnabled = wsPresence?.cursorsEnabled ?? false;
  const realtimeEnabled = wsPresence?.realtimeEnabled ?? false;

  // Store all update callbacks in a ref set for multiple registrations
  const updateCallbacksRef = useRef<Set<() => void>>(new Set());
  // Store the close callback in a ref for dynamic registration
  const closeCallbackRef = useRef<(() => void) | null>(null);

  const openTask = useCallback(
    (
      task: Task,
      boardId: string,
      availableLists?: TaskList[],
      fakeTaskUrl?: boolean,
      options?: {
        preserveUrl?: boolean;
        taskWsId?: string;
        taskWorkspacePersonal?: boolean;
      }
    ) => {
      // Use task's workspace personal flag if provided, otherwise fall back to current workspace
      const isTaskWorkspacePersonal =
        options?.taskWorkspacePersonal ?? isPersonalWorkspace;

      setState({
        isOpen: true,
        task,
        boardId,
        mode: 'edit',
        availableLists,
        // Determine realtime features based on task's workspace, not current navigation context
        collaborationMode: !isTaskWorkspacePersonal && cursorsEnabled,
        realtimeEnabled: !isTaskWorkspacePersonal && realtimeEnabled,
        fakeTaskUrl,
        taskWsId: options?.taskWsId,
      });
    },
    [isPersonalWorkspace, cursorsEnabled, realtimeEnabled]
  );

  const openTaskById = useCallback(
    async (taskId: string) => {
      try {
        const supabase = createClient();

        // Fetch task with all related data including board's workspace info
        const { data: task, error } = await supabase
          .from('tasks')
          .select(
            `
          *,
          list:task_lists!inner(
            id,
            name,
            board_id,
            board:workspace_boards(
              id,
              ws_id,
              workspace:workspaces(personal)
            )
          ),
          assignees:task_assignees(
            user_id,
            users(id, display_name, avatar_url)
          ),
          labels:task_labels(
            label_id,
            workspace_task_labels(id, name, color, created_at)
          ),
          projects:task_project_tasks(
            project_id,
            task_projects(id, name, status)
          )
        `
          )
          .eq('id', taskId)
          .single();

        if (error || !task) {
          console.error('Failed to fetch task:', error);
          return;
        }

        // Fetch available lists for this board
        const { data: lists } = await supabase
          .from('task_lists')
          .select('*')
          .eq('board_id', task.list?.board_id)
          .eq('deleted', false)
          .order('position')
          .order('created_at');

        // Transform the data to match expected structure
        // Type narrowing: Supabase returns join rows; extract nested data
        const transformedTask = {
          ...task,
          assignees: task.assignees?.map((a: TaskAssigneeJoinRow) => ({
            id: a.users?.id || a.user_id,
            user_id: a.user_id,
            display_name: a.users?.display_name,
            avatar_url: a.users?.avatar_url,
          })),
          labels: task.labels
            ?.map((l: TaskLabelJoinRow) => l.workspace_task_labels)
            .filter(Boolean),
          projects: task.projects
            ?.map((p: TaskProjectJoinRow) => p.task_projects)
            .filter(Boolean),
        };

        // Extract task's workspace info for proper realtime and routing
        const taskWsId = (task.list?.board as any)?.ws_id as string | undefined;
        const taskWorkspacePersonal =
          ((task.list?.board as any)?.workspace?.personal as boolean) ?? false;
        const isTaskWorkspacePersonal =
          taskWorkspacePersonal ?? isPersonalWorkspace;

        // Open the task in edit mode
        setState({
          isOpen: true,
          task: transformedTask as Task,
          boardId: task.list?.board_id,
          mode: 'edit',
          availableLists: (lists as TaskList[]) || undefined,
          collaborationMode: !isTaskWorkspacePersonal && cursorsEnabled,
          realtimeEnabled: !isTaskWorkspacePersonal && realtimeEnabled,
          taskWsId,
        });
      } catch (error) {
        console.error('Failed to open task:', error);
      }
    },
    [isPersonalWorkspace, cursorsEnabled, realtimeEnabled]
  );

  const createTask = useCallback(
    (
      boardId: string,
      listId: string,
      availableLists?: TaskList[],
      filters?: TaskFilters
    ) => {
      setState({
        isOpen: true,
        task: {
          id: 'new',
          name: '',
          list_id: listId,
          display_number: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted: false,
          archived: false,
        } as Task,
        boardId,
        mode: 'create',
        availableLists,
        collaborationMode: false,
        filters,
      });
    },
    []
  );

  const createSubtask = useCallback(
    (
      parentTaskId: string,
      parentTaskName: string,
      boardId: string,
      listId: string,
      availableLists?: TaskList[]
    ) => {
      setState({
        isOpen: true,
        task: {
          id: 'new',
          name: '',
          list_id: listId,
          display_number: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted: false,
          archived: false,
        } as Task,
        boardId,
        mode: 'create',
        availableLists,
        collaborationMode: false,
        parentTaskId,
        parentTaskName,
      });
    },
    []
  );

  const createTaskWithRelationship = useCallback(
    (
      relationshipType: PendingRelationshipType,
      relatedTaskId: string,
      relatedTaskName: string,
      boardId: string,
      listId: string,
      availableLists?: TaskList[]
    ) => {
      setState({
        isOpen: true,
        task: {
          id: 'new',
          name: '',
          list_id: listId,
          display_number: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted: false,
          archived: false,
        } as Task,
        boardId,
        mode: 'create',
        availableLists,
        collaborationMode: false,
        pendingRelationship: {
          type: relationshipType,
          relatedTaskId,
          relatedTaskName,
        },
      });
    },
    []
  );

  const editDraft = useCallback(
    async (draft: {
      id: string;
      name: string;
      description?: string | null;
      priority?: string | null;
      board_id?: string | null;
      list_id?: string | null;
      start_date?: string | null;
      end_date?: string | null;
      estimation_points?: number | null;
      label_ids?: string[];
      assignee_ids?: string[];
      project_ids?: string[];
    }) => {
      const supabase = createClient();

      // Fetch label metadata so names/colors render correctly
      let labels: Array<{
        id: string;
        name: string;
        color: string;
        created_at: string;
      }> = [];
      if (draft.label_ids && draft.label_ids.length > 0) {
        const { data } = await supabase
          .from('workspace_task_labels')
          .select('id, name, color, created_at')
          .in('id', draft.label_ids);
        labels = (data || []).map((l) => ({
          id: l.id,
          name: l.name ?? '',
          color: l.color ?? '',
          created_at: l.created_at ?? '',
        }));
      }

      // Fetch assignee metadata so display names/avatars render correctly
      let assignees: Array<{
        id: string;
        user_id: string;
        display_name?: string | null;
        avatar_url?: string | null;
      }> = [];
      if (draft.assignee_ids && draft.assignee_ids.length > 0) {
        const { data } = await supabase
          .from('users')
          .select('id, display_name, avatar_url')
          .in('id', draft.assignee_ids);
        assignees = (data || []).map((u) => ({
          id: u.id,
          user_id: u.id,
          display_name: u.display_name,
          avatar_url: u.avatar_url,
        }));
      }

      // Fetch project metadata so names render correctly
      let projects: Array<{
        id: string;
        name: string;
        status: string | null;
      }> = [];
      if (draft.project_ids && draft.project_ids.length > 0) {
        const { data } = await supabase
          .from('task_projects')
          .select('id, name, status')
          .in('id', draft.project_ids);
        projects = (data || []).map((p) => ({
          id: p.id,
          name: p.name ?? '',
          status: p.status,
        }));
      }

      // Create a fake Task pre-populated with draft data + resolved metadata
      const fakeTask: Task = {
        id: `draft-${draft.id}`,
        name: draft.name,
        description: draft.description || '',
        priority: (draft.priority as Task['priority']) || null,
        list_id: draft.list_id || '',
        start_date: draft.start_date || undefined,
        end_date: draft.end_date || undefined,
        estimation_points: draft.estimation_points ?? null,
        display_number: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted: false,
        archived: false,
        labels,
        assignees,
        projects,
      } as Task;

      setState({
        isOpen: true,
        task: fakeTask,
        boardId: draft.board_id || '',
        mode: 'create',
        collaborationMode: false,
        draftId: draft.id,
      });
    },
    []
  );

  const closeDialog = useCallback(() => {
    setState({
      isOpen: false,
    });
  }, []);

  // Register an update callback (returns cleanup function)
  const onUpdate = useCallback((callback: () => void) => {
    console.log('📝 TaskDialogProvider: Registering update callback');
    updateCallbacksRef.current.add(callback);

    // Return cleanup function to remove this callback
    return () => {
      console.log('📝 TaskDialogProvider: Unregistering update callback');
      updateCallbacksRef.current.delete(callback);
    };
  }, []);

  // Register a close callback
  const onClose = useCallback((callback: () => void) => {
    console.log('📝 TaskDialogProvider: Registering close callback');
    closeCallbackRef.current = callback;
  }, []);

  // Call all registered update callbacks (used internally by TaskEditDialog)
  const triggerUpdate = useCallback(() => {
    console.log('🔔 TaskDialogProvider: Triggering update callbacks', {
      callbackCount: updateCallbacksRef.current.size,
      hasExternalCallback: !!externalOnUpdate,
    });
    // Call all registered callbacks
    updateCallbacksRef.current.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.error('Error in update callback:', error);
      }
    });
    externalOnUpdate?.();
  }, [externalOnUpdate]);

  // Call the registered close callback (used internally by TaskEditDialog)
  const triggerClose = useCallback(() => {
    console.log('🔔 TaskDialogProvider: Triggering close callback', {
      hasCallback: !!closeCallbackRef.current,
    });

    // Always close the dialog first for immediate UI feedback
    closeDialog();

    // Then call any registered callback (e.g., for navigation)
    // The loading state in the calling component will prevent blank screen
    if (closeCallbackRef.current) {
      closeCallbackRef.current();
    }
  }, [closeDialog]);

  const contextValue = useMemo<TaskDialogContextValue>(
    () => ({
      state,
      isPersonalWorkspace,
      openTask,
      openTaskById,
      createTask,
      createSubtask,
      createTaskWithRelationship,
      editDraft,
      closeDialog,
      onUpdate,
      onClose,
      triggerUpdate,
      triggerClose,
    }),
    [
      state,
      isPersonalWorkspace,
      openTask,
      openTaskById,
      createTask,
      createSubtask,
      createTaskWithRelationship,
      editDraft,
      closeDialog,
      onUpdate,
      onClose,
      triggerUpdate,
      triggerClose,
    ]
  );

  return (
    <TaskDialogContext.Provider value={contextValue}>
      {children}
    </TaskDialogContext.Provider>
  );
}
