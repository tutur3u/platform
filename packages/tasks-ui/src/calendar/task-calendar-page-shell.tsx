'use client';

import { CalendarPageShell } from '@tuturuuu/ui/calendar-app/calendar-page-shell';
import type { ComponentProps } from 'react';
import { TaskDialogWrapper } from '../tu-do/shared/task-dialog-wrapper';
import { useTasksRoutePrefix } from '../tu-do/tasks-route-context';
import { CalendarHeaderActions } from './components/calendar-header-actions';
import TasksSidebar from './components/tasks-sidebar';

interface TaskCalendarPageShellProps extends Omit<
  ComponentProps<typeof CalendarPageShell>,
  'HeaderActions' | 'TasksSidebar'
> {
  isPersonalWorkspace: boolean;
  manageTaskDialog?: boolean;
  /**
   * Header actions rendered inside the calendar providers. Defaults to the
   * standard New/Plan actions; hosts wrap them to add entry behavior.
   */
  HeaderActions?: ComponentProps<typeof CalendarPageShell>['HeaderActions'];
}

export function TaskCalendarPageShell({
  isPersonalWorkspace,
  workspace,
  manageTaskDialog = true,
  HeaderActions = CalendarHeaderActions,
  ...props
}: TaskCalendarPageShellProps) {
  const routePrefix = useTasksRoutePrefix();
  const content = (
    <CalendarPageShell
      {...props}
      workspace={workspace}
      HeaderActions={HeaderActions}
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
