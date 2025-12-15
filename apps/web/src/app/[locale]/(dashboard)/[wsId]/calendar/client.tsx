'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CalendarConnection,
  Workspace,
  WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types';
import { SmartCalendar } from '@tuturuuu/ui/legacy/calendar/smart-calendar';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { CalendarHeaderActions } from './components/calendar-header-actions';
import { RequireWorkspaceTimezoneDialog } from './components/require-workspace-timezone-dialog';
import { useCalendarSettings, useE2EE } from './hooks';

interface CalendarClientPageProps {
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken | null;
  calendarConnections: CalendarConnection[];
  workspace: Workspace;
  enableSmartScheduling: boolean;
}

export default function CalendarClientPage({
  experimentalGoogleToken,
  calendarConnections,
  workspace,
  enableSmartScheduling,
}: CalendarClientPageProps) {
  const t = useTranslations('calendar');
  const locale = useLocale();

  const [calendarGateCompleted, setCalendarGateCompleted] = useState(false);

  // Custom hooks for E2EE and calendar settings
  const e2ee = useE2EE(workspace.id);
  const { initialSettings, needsCalendarGate: settingsNeedGate } =
    useCalendarSettings(workspace, locale);

  const needsCalendarGate = !calendarGateCompleted && settingsNeedGate;

  const extras = (
    <CalendarHeaderActions
      workspaceId={workspace.id}
      e2eeStatus={e2ee.status}
      e2eeLoading={e2ee.isLoading}
      isVerifying={e2ee.isVerifying}
      isFixing={e2ee.isFixing}
      isMigrating={e2ee.isMigrating}
      isEnabling={e2ee.isEnabling}
      fixProgress={e2ee.fixProgress}
      hasUnencryptedEvents={e2ee.hasUnencryptedEvents ?? false}
      onVerify={e2ee.verify}
      onMigrate={e2ee.migrate}
      onEnable={e2ee.enable}
      enableSmartScheduling={enableSmartScheduling}
      experimentalGoogleToken={experimentalGoogleToken}
      calendarConnections={calendarConnections}
    />
  );

  return (
    <>
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
    </>
  );
}
