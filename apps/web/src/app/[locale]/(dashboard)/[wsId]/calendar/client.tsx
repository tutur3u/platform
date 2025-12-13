'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CalendarConnection,
  Workspace,
  WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types';
import type { CalendarSettings } from '@tuturuuu/ui/legacy/calendar/settings/settings-context';
import { SmartCalendar } from '@tuturuuu/ui/legacy/calendar/smart-calendar';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  resolveFirstDayOfWeek,
  resolveTimeFormat,
  resolveTimezone,
} from '../../../../../lib/calendar-settings-resolver';
import AddEventDialog from './components/add-event-dialog';
import CalendarConnectionsManager from './components/calendar-connections-manager';
import QuickCalendarToggle from './components/quick-calendar-toggle';
import { RequireWorkspaceTimezoneDialog } from './components/require-workspace-timezone-dialog';
import { SmartScheduleButton } from './components/smart-schedule-button';
import SyncDebugPanel from './components/sync-debug-panel';

export default function CalendarClientPage({
  experimentalGoogleToken,
  calendarConnections,
  workspace,
  hasValidTuturuuuEmail,
}: {
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken | null;
  calendarConnections: CalendarConnection[];
  workspace: Workspace;
  hasValidTuturuuuEmail: boolean;
}) {
  const t = useTranslations('calendar');
  const locale = useLocale();
  const [isAddEventDialogOpen, setIsAddEventDialogOpen] = useState(false);

  const [calendarGateCompleted, setCalendarGateCompleted] = useState(false);

  const needsCalendarGate =
    !calendarGateCompleted &&
    (!workspace.timezone ||
      workspace.timezone === 'auto' ||
      !workspace.first_day_of_week ||
      workspace.first_day_of_week === 'auto');

  // Fetch user calendar settings to resolve effective settings
  const { data: userSettings } = useQuery({
    queryKey: ['user-calendar-settings'],
    queryFn: async () => {
      const res = await fetch('/api/v1/users/calendar-settings');
      if (!res.ok) return null;
      return res.json() as Promise<{
        timezone: string;
        first_day_of_week: string;
        time_format: string;
      }>;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Build initial settings using resolved values (user > workspace > auto)
  const initialSettings = useMemo((): Partial<CalendarSettings> => {
    const effectiveFirstDay = resolveFirstDayOfWeek(
      { first_day_of_week: userSettings?.first_day_of_week },
      { first_day_of_week: workspace.first_day_of_week },
      locale
    );

    const effectiveTimezone = resolveTimezone(
      { timezone: userSettings?.timezone },
      { timezone: workspace.timezone }
    );

    const effectiveTimeFormat = resolveTimeFormat(
      { time_format: userSettings?.time_format },
      locale
    );

    return {
      appearance: {
        firstDayOfWeek: effectiveFirstDay,
        showWeekends: true,
        theme: 'system',
        timeFormat: effectiveTimeFormat,
        defaultView: 'week',
        showWeekNumbers: false,
        showDeclinedEvents: false,
        compactView: false,
      },
      timezone: {
        timezone: effectiveTimezone,
        showSecondaryTimezone: false,
      },
    };
  }, [
    userSettings?.first_day_of_week,
    userSettings?.timezone,
    userSettings?.time_format,
    workspace.first_day_of_week,
    workspace.timezone,
    locale,
  ]);

  const extras = (
    <div className="grid w-full items-center gap-2 md:flex md:w-auto">
      {hasValidTuturuuuEmail && <SmartScheduleButton wsId={workspace.id} />}
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
      {needsCalendarGate && (
        <RequireWorkspaceTimezoneDialog
          wsId={workspace.id}
          onCompleted={() => setCalendarGateCompleted(true)}
        />
      )}
      {!needsCalendarGate && (
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
          initialSettings={initialSettings}
        />
      )}
      <AddEventDialog
        wsId={workspace.id}
        isOpen={isAddEventDialogOpen}
        onClose={() => setIsAddEventDialogOpen(false)}
      />
      {DEV_MODE && <SyncDebugPanel />}
    </>
  );
}
