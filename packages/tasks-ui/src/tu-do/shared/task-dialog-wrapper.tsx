'use client';

import { TaskDialogProvider } from '@tuturuuu/tasks-ui/tu-do/providers/task-dialog-provider';
import { TaskDialogManager } from '@tuturuuu/tasks-ui/tu-do/shared/task-dialog-manager';
import type { ReactNode } from 'react';

interface TaskDialogWrapperProps {
  children: ReactNode;
  isPersonalWorkspace: boolean;
  routePrefix?: string;
  wsId: string;
}

/**
 * Client-side wrapper that provides the centralized task dialog
 * and task viewer tracking to all components in the workspace
 */
export function TaskDialogWrapper({
  children,
  isPersonalWorkspace,
  routePrefix = '/tasks',
  wsId,
}: TaskDialogWrapperProps) {
  return (
    <TaskDialogProvider isPersonalWorkspace={isPersonalWorkspace}>
      {children}
      <TaskDialogManager routePrefix={routePrefix} wsId={wsId} />
    </TaskDialogProvider>
  );
}
