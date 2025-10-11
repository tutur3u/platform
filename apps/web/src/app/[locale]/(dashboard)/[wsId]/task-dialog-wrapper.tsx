'use client';

import { TaskDialogProvider } from '@tuturuuu/ui/tu-do/providers/task-dialog-provider';
import { TaskDialogManager } from '@tuturuuu/ui/tu-do/shared/task-dialog-manager';
import type { ReactNode } from 'react';

interface TaskDialogWrapperProps {
  children: ReactNode;
}

/**
 * Client-side wrapper that provides the centralized task dialog
 * to all components in the workspace
 */
export function TaskDialogWrapper({ children }: TaskDialogWrapperProps) {
  return (
    <TaskDialogProvider>
      {children}
      <TaskDialogManager />
    </TaskDialogProvider>
  );
}
