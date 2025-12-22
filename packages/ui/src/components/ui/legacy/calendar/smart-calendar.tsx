'use client';

import type { Workspace, WorkspaceCalendarGoogleToken } from '@tuturuuu/types';
import { CalendarProvider } from '@tuturuuu/ui/hooks/use-calendar';
import type { CalendarView } from '../../../../hooks/use-view-transition';
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
  initialSettings,
  onSaveSettings,
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
    view: CalendarView;
    setView: React.Dispatch<React.SetStateAction<CalendarView>>;
    availableViews: { value: string; label: string; disabled?: boolean }[];
  };
  extras?: React.ReactNode;
  initialSettings?: Partial<CalendarSettings>;
  onSaveSettings?: (settings: CalendarSettings) => Promise<void>;
}) => {
  const handleSaveSettings = async (newSettings: CalendarSettings) => {
    if (onSaveSettings) {
      await onSaveSettings(newSettings);
    }
  };

  return (
    <CalendarProvider
      ws={workspace}
      useQuery={useQuery}
      useQueryClient={useQueryClient}
      experimentalGoogleToken={experimentalGoogleToken}
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
          extras={extras}
        />
      </CalendarSettingsProvider>
    </CalendarProvider>
  );
};
