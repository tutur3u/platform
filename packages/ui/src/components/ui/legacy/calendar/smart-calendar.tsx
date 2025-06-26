'use client';

import type {
  Workspace,
  WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types/db';
import { CalendarProvider } from '../../../../hooks/use-calendar';
import { CalendarContent } from './calendar-content';
import type { CalendarSettings } from './settings/settings-context';

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
}: {
  t: (key: string) => string;
  locale: string;
  useQuery: unknown;
  useQueryClient: unknown;
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
      />
    </CalendarProvider>
  );
};
