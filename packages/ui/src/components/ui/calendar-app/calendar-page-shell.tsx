import type {
  CalendarConnection,
  Workspace,
  WorkspaceCalendarGoogleTokenClient,
} from '@tuturuuu/types';
import { CalendarSyncProvider } from '@tuturuuu/ui/hooks/use-calendar-sync';
import type { ComponentType } from 'react';
import type { CalendarView } from '../../../hooks/use-view-transition';
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
  externalState?: {
    availableViews: { value: string; label: string; disabled?: boolean }[];
    date: Date;
    setDate: React.Dispatch<React.SetStateAction<Date>>;
    setView: React.Dispatch<React.SetStateAction<CalendarView>>;
    view: CalendarView;
  };
  manageCalendarSyncProvider?: boolean;
  showConnectionsManager?: boolean;
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
  externalState,
  manageCalendarSyncProvider = true,
  showConnectionsManager = true,
}: CalendarPageShellProps) {
  const content = (
    <div className="flex h-[calc(100vh-2rem)]">
      <CalendarClientPage
        experimentalGoogleToken={experimentalGoogleToken}
        workspace={workspace}
        enableSmartScheduling={enableSmartScheduling}
        externalState={externalState}
        HeaderActions={HeaderActions}
        showConnectionsManager={showConnectionsManager}
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
  );

  if (!manageCalendarSyncProvider) return content;

  return (
    <CalendarSyncProvider
      wsId={workspace.id}
      experimentalGoogleToken={experimentalGoogleToken}
      initialCalendarConnections={calendarConnections || []}
    >
      {content}
    </CalendarSyncProvider>
  );
}

export default CalendarPageShell;
