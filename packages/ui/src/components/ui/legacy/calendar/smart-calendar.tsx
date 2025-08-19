'use client';

import { CalendarContent } from './calendar-content';
import {
  CalendarSettings,
  CalendarSettingsProvider,
} from './settings/settings-context';
import type {
  Workspace,
  WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types/db';
import { CalendarProvider } from '@tuturuuu/ui/hooks/use-calendar';
import type { WorkspaceScheduledEventWithAttendees } from '@tuturuuu/types/primitives/RSVP';

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
  onOpenEventDetails,
}: {
  t: any;
  locale: string;
  useQuery: any;
  useQueryClient: any;
  workspace?: Workspace;
  disabled?: boolean;
  enableHeader?: boolean;
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken | null;
  externalState?: {
    date: Date;
    setDate: React.Dispatch<React.SetStateAction<Date>>;
    view: 'day' | '4-days' | 'week' | 'month';
    setView: React.Dispatch<
      React.SetStateAction<'day' | '4-days' | 'week' | 'month'>
    >;
    availableViews: { value: string; label: string; disabled?: boolean }[];
  };
  extras?: React.ReactNode;
  /**
   * Invoked to open the event details UI.
   * - eventId: the ID to open.
   * - scheduledEvent: optionally pass a prefetched event payload to avoid an extra fetch.
   */
  onOpenEventDetails?: (
    eventId: string,
    scheduledEvent?: WorkspaceScheduledEventWithAttendees
  ) => void;
}) => {
  const handleSaveSettings = async (newSettings: CalendarSettings) => {
    console.log('Saving settings:', newSettings);
  };

  return (
    <CalendarProvider
      ws={workspace}
      useQuery={useQuery}
      useQueryClient={useQueryClient}
      experimentalGoogleToken={experimentalGoogleToken}
    >
      <CalendarSettingsProvider onSave={handleSaveSettings}>
        <CalendarContent
          t={t}
          locale={locale}
          disabled={disabled}
          workspace={workspace}
          enableHeader={enableHeader}
          experimentalGoogleToken={experimentalGoogleToken}
          externalState={externalState}
          extras={extras}
          onOpenEventDetails={onOpenEventDetails}
        />
      </CalendarSettingsProvider>
    </CalendarProvider>
  );
};
