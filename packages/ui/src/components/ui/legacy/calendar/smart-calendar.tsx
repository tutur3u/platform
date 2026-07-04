'use client';

import type {
  Workspace,
  WorkspaceCalendarGoogleTokenClient,
} from '@tuturuuu/types';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import {
  type CalendarEventAdapter,
  CalendarProvider,
} from '@tuturuuu/ui/hooks/use-calendar';
import { CalendarSyncProvider } from '@tuturuuu/ui/hooks/use-calendar-sync';
import type { CalendarView } from '../../../../hooks/use-view-transition';
import CalendarConnectionsUnified from '../../calendar-app/components/calendar-connections-unified';
import { CalendarContent } from './calendar-content';
import {
  type CalendarSettings,
  CalendarSettingsProvider,
} from './settings/settings-context';

export const SmartCalendar = ({
  t,
  locale,
  useQuery,
  useQueryClient,
  workspace,
  disabled,
  enableHeader = true,
  experimentalGoogleToken,
  externalState,
  extras,
  overlay,
  initialSettings,
  onSaveSettings,
  showConnectionsManager = true,
  eventAdapter,
  externalEvents,
  externalEventsLoading,
  externalEventsRefresh,
}: {
  t: any;
  locale: string;
  useQuery: any;
  useQueryClient: any;
  workspace?: Workspace;
  disabled?: boolean;
  enableHeader?: boolean;
  experimentalGoogleToken?: WorkspaceCalendarGoogleTokenClient | null;
  externalState?: {
    date: Date;
    setDate: React.Dispatch<React.SetStateAction<Date>>;
    view: CalendarView;
    setView: React.Dispatch<React.SetStateAction<CalendarView>>;
    availableViews: { value: string; label: string; disabled?: boolean }[];
  };
  extras?: React.ReactNode;
  overlay?: React.ReactNode;
  initialSettings?: Partial<CalendarSettings>;
  onSaveSettings?: (settings: CalendarSettings) => Promise<void>;
  showConnectionsManager?: boolean;
  eventAdapter?: CalendarEventAdapter;
  externalEvents?: CalendarEvent[];
  externalEventsLoading?: boolean;
  externalEventsRefresh?: () => void;
}) => {
  const handleSaveSettings = async (newSettings: CalendarSettings) => {
    if (onSaveSettings) {
      await onSaveSettings(newSettings);
    }
  };
  const headerExtras =
    showConnectionsManager && workspace?.id ? (
      <>
        <CalendarConnectionsUnified wsId={workspace.id} />
        {extras}
      </>
    ) : (
      extras
    );

  const calendar = (
    <CalendarProvider
      ws={workspace}
      useQuery={useQuery}
      useQueryClient={useQueryClient}
      experimentalGoogleToken={experimentalGoogleToken}
      eventAdapter={eventAdapter}
      readOnly={disabled}
    >
      <CalendarSettingsProvider
        initialSettings={initialSettings}
        onSave={handleSaveSettings}
      >
        <CalendarContent
          t={t}
          locale={locale}
          disabled={disabled}
          workspace={workspace}
          enableHeader={enableHeader}
          experimentalGoogleToken={experimentalGoogleToken}
          externalState={externalState}
          extras={headerExtras}
          overlay={overlay}
          disableBuiltInEventUi={eventAdapter?.disableBuiltInEventUi}
        />
      </CalendarSettingsProvider>
    </CalendarProvider>
  );

  if (externalEvents) {
    return (
      <CalendarSyncProvider
        wsId={workspace?.id ?? 'external'}
        externalEvents={externalEvents}
        externalEventsLoading={externalEventsLoading}
        externalRefresh={externalEventsRefresh}
      >
        {calendar}
      </CalendarSyncProvider>
    );
  }

  return calendar;
};
