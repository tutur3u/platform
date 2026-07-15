'use client';

import { CalendarPageShell } from '@tuturuuu/ui/calendar-app/calendar-page-shell';
import type { ComponentProps } from 'react';
import { TaskDialogWrapper } from '../tu-do/shared/task-dialog-wrapper';
import { CalendarHeaderActions } from './components/calendar-header-actions';
import TasksSidebar from './components/tasks-sidebar';

interface TaskCalendarPageShellProps
  extends Omit<
    ComponentProps<typeof CalendarPageShell>,
    'HeaderActions' | 'TasksSidebar'
  > {
  isPersonalWorkspace: boolean;
}

export function TaskCalendarPageShell({
  isPersonalWorkspace,
  workspace,
  ...props
}: TaskCalendarPageShellProps) {
  return (
    <TaskDialogWrapper
      isPersonalWorkspace={isPersonalWorkspace}
      wsId={workspace.id}
    >
      <CalendarPageShell
        {...props}
        workspace={workspace}
        HeaderActions={CalendarHeaderActions}
        TasksSidebar={TasksSidebar}
      />
    </TaskDialogWrapper>
  );
}

export default TaskCalendarPageShell;
