'use client';

import { CalendarProvider } from '../../../../hooks/use-calendar';
import { CalendarContent } from './calendar-content';
import type { CalendarSettings } from './settings/settings-context';
import type {
  Workspace,
  WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types/db';
import type { WorkspaceScheduledEventWithAttendees } from '@tuturuuu/types/primitives/RSVP';

export const SmartCalendar = ({
  t,
  locale,
  useQuery,
  useQueryClient,
  workspace,
  disabled,
  initialSettings,
  enableHeader = true,
  experimentalGoogleToken,
  onSaveSettings,
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
  initialSettings?: Partial<CalendarSettings>;
  enableHeader?: boolean;
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken | null;
  onSaveSettings?: (settings: CalendarSettings) => Promise<void>;
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
  onOpenEventDetails?: (
    eventId: string,
    scheduledEvent?: WorkspaceScheduledEventWithAttendees
  ) => void;
}) => {
  return (
    <CalendarProvider
      ws={workspace}
      useQuery={useQuery}
      useQueryClient={useQueryClient}
      initialSettings={initialSettings}
      experimentalGoogleToken={experimentalGoogleToken}
    >
      <CalendarContent
        t={t}
        locale={locale}
        disabled={disabled}
        workspace={workspace}
        initialSettings={initialSettings}
        enableHeader={enableHeader}
        experimentalGoogleToken={experimentalGoogleToken}
        onSaveSettings={onSaveSettings}
        externalState={externalState}
        extras={extras}
        onOpenEventDetails={onOpenEventDetails}
      />
    </CalendarProvider>
  );
};
