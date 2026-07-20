'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Workspace,
  WorkspaceCalendarGoogleTokenClient,
} from '@tuturuuu/types';
import type { CalendarView } from '@tuturuuu/ui/hooks/use-view-transition';
import { SmartCalendar } from '@tuturuuu/ui/legacy/calendar/smart-calendar';
import { useLocale, useTranslations } from 'next-intl';
import {
  type ComponentType,
  type Dispatch,
  type SetStateAction,
  useState,
} from 'react';
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
  externalState?: {
    availableViews: { value: string; label: string; disabled?: boolean }[];
    date: Date;
    setDate: Dispatch<SetStateAction<Date>>;
    setView: Dispatch<SetStateAction<CalendarView>>;
    view: CalendarView;
  };
  showConnectionsManager?: boolean;
}

export function CalendarClientPage({
  experimentalGoogleToken,
  workspace,
  enableSmartScheduling,
  externalState,
  HeaderActions,
  showConnectionsManager,
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
        externalState={externalState}
        initialSettings={initialSettings}
        showConnectionsManager={showConnectionsManager}
      />
    </div>
  );
}

export default CalendarClientPage;
