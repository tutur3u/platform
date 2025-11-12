'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Workspace, WorkspaceCalendarGoogleToken } from '@tuturuuu/types';
import { SmartCalendar } from '@tuturuuu/ui/legacy/calendar/smart-calendar';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import AddEventDialog from './components/add-event-dialog';
import CalendarConnectionsManager from './components/calendar-connections-manager';
import QuickCalendarToggle from './components/quick-calendar-toggle';
import SyncDebugPanel from './components/sync-debug-panel';

interface CalendarConnection {
  id: string;
  ws_id: string;
  calendar_id: string;
  calendar_name: string;
  is_enabled: boolean;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export default function CalendarClientPage({
  experimentalGoogleToken,
  calendarConnections,
  workspace,
}: {
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken | null;
  calendarConnections: CalendarConnection[];
  workspace: Workspace;
}) {
  const t = useTranslations('calendar');
  const locale = useLocale();
  const [isAddEventDialogOpen, setIsAddEventDialogOpen] = useState(false);

  const extras = (
    <div className="grid w-full items-center gap-2 md:flex md:w-auto">
      {experimentalGoogleToken && (
        <>
          <QuickCalendarToggle />
          <CalendarConnectionsManager
            wsId={workspace.id}
            initialConnections={calendarConnections}
            hasGoogleAuth={!!experimentalGoogleToken}
          />
        </>
      )}
      {/* <AddEventButton onOpenDialog={() => setIsAddEventDialogOpen(true)} /> */}
      {/* {DEV_MODE && <TestEventGeneratorButton wsId={workspace.id} />} */}
      {/* {DEV_MODE && (
        <AutoScheduleComprehensiveDialog wsId={workspace.id}>
          <Button
            variant="default"
            size="sm"
            className="w-full bg-linear-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 md:w-fit"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Auto-Schedule
          </Button>
        </AutoScheduleComprehensiveDialog>
      )} */}
    </div>
  );

  return (
    <>
      <SmartCalendar
        t={t}
        locale={locale}
        workspace={workspace}
        useQuery={useQuery}
        useQueryClient={useQueryClient}
        experimentalGoogleToken={
          experimentalGoogleToken?.ws_id === workspace.id
            ? experimentalGoogleToken
            : null
        }
        extras={extras}
      />
      <AddEventDialog
        wsId={workspace.id}
        isOpen={isAddEventDialogOpen}
        onClose={() => setIsAddEventDialogOpen(false)}
      />
      <SyncDebugPanel />
    </>
  );
}
