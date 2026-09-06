'use client';

import { CalendarPageShell } from '@tuturuuu/ui/calendar-app/calendar-page-shell';
import type { ComponentProps } from 'react';
import { TaskDialogWrapper } from '../tu-do/shared/task-dialog-wrapper';
import { useTasksRoutePrefix } from '../tu-do/tasks-route-context';
import { CalendarHeaderActions } from './components/calendar-header-actions';
import TasksSidebar from './components/tasks-sidebar';

interface TaskCalendarPageShellProps
  extends Omit<
    ComponentProps<typeof CalendarPageShell>,
    'HeaderActions' | 'TasksSidebar'
  > {
  isPersonalWorkspace: boolean;
  manageTaskDialog?: boolean;
}

export function TaskCalendarPageShell({
  isPersonalWorkspace,
  workspace,
  manageTaskDialog = true,
  ...props
}: TaskCalendarPageShellProps) {
  const routePrefix = useTasksRoutePrefix();
  const content = (
    <CalendarPageShell
      {...props}
      workspace={workspace}
      HeaderActions={CalendarHeaderActions}
      TasksSidebar={TasksSidebar}
    />
  );

  if (!manageTaskDialog) return content;

  return (
    <TaskDialogWrapper
      isPersonalWorkspace={isPersonalWorkspace}
      routePrefix={routePrefix}
      wsId={workspace.id}
    >
      {content}
    </TaskDialogWrapper>
  );
}

export default TaskCalendarPageShell;
