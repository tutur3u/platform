'use client';

import { TaskDialogProvider } from '@tuturuuu/ui/tu-do/providers/task-dialog-provider';
import { TaskDialogManager } from '@tuturuuu/ui/tu-do/shared/task-dialog-manager';
import type { ReactNode } from 'react';

interface TaskDialogWrapperProps {
  children: ReactNode;
  isPersonalWorkspace: boolean;
}

/**
 * Client-side wrapper that provides the centralized task dialog
 * and task viewer tracking to all components in the workspace
 */
export function TaskDialogWrapper({
  children,
  isPersonalWorkspace,
}: TaskDialogWrapperProps) {
  return (
    <TaskDialogProvider isPersonalWorkspace={isPersonalWorkspace}>
      {children}
      <TaskDialogManager />
    </TaskDialogProvider>
  );
}
