'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

interface TaskDialogState {
  isOpen: boolean;
  task?: Task;
  boardId?: string;
  mode?: 'edit' | 'create';
  availableLists?: TaskList[];
  showUserPresence?: boolean;
  originalPathname?: string;
}

interface TaskDialogContextValue {
  // Current dialog state
  state: TaskDialogState;

  // Open dialog for editing existing task
  openTask: (task: Task, boardId: string, availableLists?: TaskList[]) => void;

  // Open task by ID (fetches task data first)
  openTaskById: (taskId: string) => Promise<void>;

  // Open dialog for creating new task
  createTask: (
    boardId: string,
    listId: string,
    availableLists?: TaskList[]
  ) => void;

  // Close dialog
  closeDialog: () => void;

  // Register callback for when task is updated
  onUpdate: (callback: () => void) => void;

  // Trigger the registered update callback (internal use)
  triggerUpdate: () => void;
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
}

export function TaskDialogProvider({
  children,
  onUpdate: externalOnUpdate,
}: TaskDialogProviderProps) {
  const [state, setState] = useState<TaskDialogState>({
    isOpen: false,
  });

  // Store the update callback in a ref for dynamic registration
  const updateCallbackRef = useRef<(() => void) | null>(null);

  const openTask = useCallback(
    (task: Task, boardId: string, availableLists?: TaskList[]) => {
      setState({
        isOpen: true,
        task,
        boardId,
        mode: 'edit',
        availableLists,
        showUserPresence: true,
      });
    },
    []
  );

  const openTaskById = useCallback(async (taskId: string) => {
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
      const transformedTask = {
        ...task,
        assignees: task.assignees?.map((a: any) => ({
          id: a.users?.id || a.user_id,
          user_id: a.user_id,
          display_name: a.users?.display_name,
          avatar_url: a.users?.avatar_url,
        })),
        labels: task.labels?.map((l: any) => l.workspace_task_labels).filter(Boolean),
        projects: task.projects?.map((p: any) => p.task_projects).filter(Boolean),
      };

      // Open the task in edit mode
      setState({
        isOpen: true,
        task: transformedTask as Task,
        boardId: task.list?.board_id,
        mode: 'edit',
        availableLists: (lists as TaskList[]) || undefined,
        showUserPresence: true,
      });
    } catch (error) {
      console.error('Failed to open task:', error);
    }
  }, []);

  const createTask = useCallback(
    (boardId: string, listId: string, availableLists?: TaskList[]) => {
      setState({
        isOpen: true,
        task: {
          id: 'new',
          name: '',
          list_id: listId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted: false,
          archived: false,
        } as Task,
        boardId,
        mode: 'create',
        availableLists,
        showUserPresence: false,
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

  // Call the registered callback (used internally by TaskEditDialog)
  const triggerUpdate = useCallback(() => {
    console.log('🔔 TaskDialogProvider: Triggering update callback', {
      hasCallback: !!updateCallbackRef.current,
      hasExternalCallback: !!externalOnUpdate,
    });
    updateCallbackRef.current?.();
    externalOnUpdate?.();
  }, [externalOnUpdate]);

  const contextValue = useMemo<TaskDialogContextValue>(
    () => ({
      state,
      openTask,
      openTaskById,
      createTask,
      closeDialog,
      onUpdate,
      triggerUpdate,
    }),
    [state, openTask, openTaskById, createTask, closeDialog, onUpdate, triggerUpdate]
  );

  return (
    <TaskDialogContext.Provider value={contextValue}>
      {children}
    </TaskDialogContext.Provider>
  );
}
