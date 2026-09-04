'use client';

import {
  DropdownMenuContent,
  DropdownMenuSub,
} from '@tuturuuu/ui/dropdown-menu';
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { TaskCardHotkeyAction } from '../../../shared/task-card-hotkeys';

export type TaskSubmenuId =
  | TaskCardHotkeyAction
  | 'dependencies'
  | 'parent'
  | 'related'
  | 'scheduling';

interface TaskSubmenuController {
  activeId: TaskSubmenuId | null;
  isSubmenuOpen: (id: TaskSubmenuId) => boolean;
  setSubmenuOpen: (id: TaskSubmenuId, open: boolean) => void;
}

const TaskSubmenuContext = createContext<TaskSubmenuController | null>(null);

export function TaskSubmenuProvider({
  children,
  onActiveIdChange,
  requestedId,
}: {
  children: ReactNode;
  onActiveIdChange?: (id: TaskSubmenuId | null) => void;
  requestedId?: TaskSubmenuId | null;
}) {
  const [activeId, setActiveId] = useState<TaskSubmenuId | null>(
    requestedId ?? null
  );

  useEffect(() => {
    if (requestedId) setActiveId(requestedId);
  }, [requestedId]);

  useEffect(() => {
    onActiveIdChange?.(activeId);
  }, [activeId, onActiveIdChange]);

  const setSubmenuOpen = useCallback((id: TaskSubmenuId, open: boolean) => {
    setActiveId((current) => (open ? id : current === id ? null : current));
  }, []);

  const value = useMemo<TaskSubmenuController>(
    () => ({
      activeId,
      isSubmenuOpen: (id) => activeId === id,
      setSubmenuOpen,
    }),
    [activeId, setSubmenuOpen]
  );

  return (
    <TaskSubmenuContext.Provider value={value}>
      {children}
    </TaskSubmenuContext.Provider>
  );
}

export function useOptionalTaskSubmenuController() {
  return useContext(TaskSubmenuContext);
}

export function useTaskSubmenuController() {
  const controller = useOptionalTaskSubmenuController();
  if (!controller) {
    throw new Error(
      'useTaskSubmenuController must be used within TaskSubmenuProvider'
    );
  }
  return controller;
}

export function TaskControlledSubmenu({
  children,
  forceOpen,
  onOpenChange,
  submenuId,
}: {
  children: ReactNode;
  forceOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  submenuId: TaskSubmenuId;
}) {
  const controller = useOptionalTaskSubmenuController();
  const handleOpenChange = (open: boolean) => {
    controller?.setSubmenuOpen(submenuId, open);
    onOpenChange?.(open);
  };

  return (
    <DropdownMenuSub
      open={
        controller
          ? controller.isSubmenuOpen(submenuId)
          : forceOpen || undefined
      }
      onOpenChange={handleOpenChange}
    >
      {children}
    </DropdownMenuSub>
  );
}

export function TaskSubmenuContent({
  children,
  requestedId,
  ...contentProps
}: ComponentProps<typeof DropdownMenuContent> & {
  requestedId?: TaskSubmenuId | null;
}) {
  return (
    <DropdownMenuContent {...contentProps}>
      <TaskSubmenuProvider requestedId={requestedId}>
        {children}
      </TaskSubmenuProvider>
    </DropdownMenuContent>
  );
}
