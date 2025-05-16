'use client';

import { CalendarProvider } from '../../../../hooks/use-calendar';
import { CalendarContent } from './calendar-content';
import { CalendarSettings } from './settings/CalendarSettingsContext';
import type { WorkspaceCalendarGoogleToken } from '@tuturuuu/types/db';
import { Workspace } from '@tuturuuu/types/primitives/Workspace';

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
}: {
  t: any;
  locale: string;
  useQuery: any;
  useQueryClient: any;
  workspace?: Workspace;
  disabled?: boolean;
  initialSettings?: Partial<CalendarSettings>;
  enableHeader?: boolean;
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken;
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
      />
    </CalendarProvider>
  );
};
