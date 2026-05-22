'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Workspace, WorkspaceCalendarGoogleToken } from '@tuturuuu/types';
import { SmartCalendar } from '@tuturuuu/ui/legacy/calendar/smart-calendar';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { CalendarHeaderActions } from './components/calendar-header-actions';
import { RequireWorkspaceTimezoneDialog } from './components/require-workspace-timezone-dialog';
import { useCalendarSettings } from './hooks';

interface CalendarClientPageProps {
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken | null;
  workspace: Workspace;
  enableSmartScheduling: boolean;
}

export function CalendarClientPage({
  experimentalGoogleToken,
  workspace,
  enableSmartScheduling,
}: CalendarClientPageProps) {
  const t = useTranslations('calendar');
  const locale = useLocale();

  const [calendarGateCompleted, setCalendarGateCompleted] = useState(false);

  const { initialSettings, needsCalendarGate: settingsNeedGate } =
    useCalendarSettings(workspace, locale);

  const needsCalendarGate = !calendarGateCompleted && settingsNeedGate;

  const extras = (
    <CalendarHeaderActions
      workspaceId={workspace.id}
      enableSmartScheduling={enableSmartScheduling}
    />
  );

  return (
    <div className="w-full min-w-0 overflow-hidden">
      {needsCalendarGate && (
        <RequireWorkspaceTimezoneDialog
          wsId={workspace.id}
          onCompleted={() => setCalendarGateCompleted(true)}
        />
      )}
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
    </div>
  );
}

export default CalendarClientPage;
