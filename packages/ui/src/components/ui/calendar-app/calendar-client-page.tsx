'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Workspace,
  WorkspaceCalendarGoogleTokenClient,
} from '@tuturuuu/types';
import { SmartCalendar } from '@tuturuuu/ui/legacy/calendar/smart-calendar';
import { useLocale, useTranslations } from 'next-intl';
import { type ComponentType, useState } from 'react';
import { RequireWorkspaceTimezoneDialog } from './components/require-workspace-timezone-dialog';
import { useCalendarSettings } from './hooks';

export interface CalendarHeaderActionsProps {
  enableSmartScheduling: boolean;
  workspaceId: string;
}

export type CalendarHeaderActionsComponent =
  ComponentType<CalendarHeaderActionsProps>;

interface CalendarClientPageProps {
  HeaderActions: CalendarHeaderActionsComponent;
  experimentalGoogleToken?: WorkspaceCalendarGoogleTokenClient | null;
  workspace: Workspace;
  enableSmartScheduling: boolean;
}

export function CalendarClientPage({
  experimentalGoogleToken,
  workspace,
  enableSmartScheduling,
  HeaderActions,
}: CalendarClientPageProps) {
  const t = useTranslations('calendar');
  const locale = useLocale();

  const [calendarGateCompleted, setCalendarGateCompleted] = useState(false);

  const { initialSettings, needsCalendarGate: settingsNeedGate } =
    useCalendarSettings(workspace, locale);

  const needsCalendarGate = !calendarGateCompleted && settingsNeedGate;

  const extras = (
    <HeaderActions
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
