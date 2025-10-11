'use client';

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
      createTask,
      closeDialog,
      onUpdate,
      triggerUpdate,
    }),
    [state, openTask, createTask, closeDialog, onUpdate, triggerUpdate]
  );

  return (
    <TaskDialogContext.Provider value={contextValue}>
      {children}
    </TaskDialogContext.Provider>
  );
}
