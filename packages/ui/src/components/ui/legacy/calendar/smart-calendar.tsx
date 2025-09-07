'use client';

import { CalendarContent } from './calendar-content';
import {
  type CalendarSettings,
  CalendarSettingsProvider,
} from './settings/settings-context';
import type {
  Workspace,
  WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types/db';
import { CalendarProvider } from '@tuturuuu/ui/hooks/use-calendar';

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
        />
      </CalendarSettingsProvider>
    </CalendarProvider>
  );
};
