import type {
  CalendarConnection,
  Workspace,
  WorkspaceCalendarGoogleTokenClient,
} from '@tuturuuu/types';
import { CalendarSyncProvider } from '@tuturuuu/ui/hooks/use-calendar-sync';
import type { ComponentType } from 'react';
import type { ExtendedWorkspaceTask } from '../time-tracker/types';
import {
  CalendarClientPage,
  type CalendarHeaderActionsComponent,
} from './calendar-client-page';

export interface CalendarTasksSidebarProps {
  locale: string;
  resolvedWsId: string;
  tasks?: ExtendedWorkspaceTask[];
  userId: string;
}

export type CalendarTasksSidebarComponent =
  ComponentType<CalendarTasksSidebarProps>;

interface CalendarPageShellProps {
  calendarConnections: CalendarConnection[] | null;
  enableSmartScheduling: boolean;
  experimentalGoogleToken?: WorkspaceCalendarGoogleTokenClient | null;
  HeaderActions: CalendarHeaderActionsComponent;
  locale: string;
  smartSchedulingTasks?: ExtendedWorkspaceTask[];
  userId: string;
  workspace: Workspace;
  TasksSidebar: CalendarTasksSidebarComponent;
}

export function CalendarPageShell({
  calendarConnections,
  enableSmartScheduling,
  experimentalGoogleToken,
  HeaderActions,
  locale,
  smartSchedulingTasks = [],
  userId,
  workspace,
  TasksSidebar,
}: CalendarPageShellProps) {
  return (
    <CalendarSyncProvider
      wsId={workspace.id}
      experimentalGoogleToken={experimentalGoogleToken}
      initialCalendarConnections={calendarConnections || []}
    >
      <div className="flex h-[calc(100vh-2rem)]">
        <CalendarClientPage
          experimentalGoogleToken={experimentalGoogleToken}
          workspace={workspace}
          enableSmartScheduling={enableSmartScheduling}
          HeaderActions={HeaderActions}
        />
        {enableSmartScheduling && (
          <TasksSidebar
            resolvedWsId={workspace.id}
            locale={locale}
            userId={userId}
            tasks={smartSchedulingTasks}
          />
        )}
      </div>
    </CalendarSyncProvider>
  );
}

export default CalendarPageShell;
