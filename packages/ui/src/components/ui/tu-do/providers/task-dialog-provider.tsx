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
  originalPathname?: string;
  filters?: TaskFilters;
  fakeTaskUrl?: boolean;
  parentTaskId?: string; // For creating subtasks
  parentTaskName?: string; // Name of parent task for subtasks
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
    options?: { preserveUrl?: boolean }
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

  // Close dialog
  closeDialog: () => void;

  // Register callback for when task is updated
  onUpdate: (callback: () => void) => void;

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

  // Store the update callback in a ref for dynamic registration
  const updateCallbackRef = useRef<(() => void) | null>(null);
  // Store the close callback in a ref for dynamic registration
  const closeCallbackRef = useRef<(() => void) | null>(null);

  const openTask = useCallback(
    (
      task: Task,
      boardId: string,
      availableLists?: TaskList[],
      fakeTaskUrl?: boolean
    ) => {
      setState({
        isOpen: true,
        task,
        boardId,
        mode: 'edit',
        availableLists,
        collaborationMode: !isPersonalWorkspace,
        fakeTaskUrl,
      });
    },
    [isPersonalWorkspace]
  );

  const openTaskById = useCallback(
    async (taskId: string) => {
      try {
        const supabase = createClient();

        // Fetch task with all related data
        const { data: task, error } = await supabase
          .from('tasks')
          .select(
            `
          *,
          list:task_lists!inner(id, name, board_id),
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

        // Open the task in edit mode
        setState({
          isOpen: true,
          task: transformedTask as Task,
          boardId: task.list?.board_id,
          mode: 'edit',
          availableLists: (lists as TaskList[]) || undefined,
          collaborationMode: !isPersonalWorkspace,
        });
      } catch (error) {
        console.error('Failed to open task:', error);
      }
    },
    [isPersonalWorkspace]
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

  const closeDialog = useCallback(() => {
    setState({
      isOpen: false,
    });
  }, []);

  // Register an update callback
  const onUpdate = useCallback((callback: () => void) => {
    console.log('📝 TaskDialogProvider: Registering update callback');
    updateCallbackRef.current = callback;
  }, []);

  // Register a close callback
  const onClose = useCallback((callback: () => void) => {
    console.log('📝 TaskDialogProvider: Registering close callback');
    closeCallbackRef.current = callback;
  }, []);

  // Call the registered update callback (used internally by TaskEditDialog)
  const triggerUpdate = useCallback(() => {
    console.log('🔔 TaskDialogProvider: Triggering update callback', {
      hasCallback: !!updateCallbackRef.current,
      hasExternalCallback: !!externalOnUpdate,
    });
    updateCallbackRef.current?.();
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
