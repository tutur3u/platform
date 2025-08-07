'use client';

import { CalendarProvider } from '../../../../hooks/use-calendar';
import { CalendarContent } from './calendar-content';
import type { CalendarSettings } from './settings/settings-context';
import type {
  Workspace,
  WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types/db';

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
  onSidebarToggle,
  sidebarToggleButton,
}: {
  t: (key: string, values?: Record<string, unknown>) => string;
  locale: string;
  useQuery: typeof import('@tanstack/react-query').useQuery;
  useQueryClient: () => {
    invalidateQueries: (options: { queryKey: string[]; refetchType?: string } | string[]) => Promise<void>;
    setQueryData: (queryKey: string[], data: unknown) => void;
  };
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
  onSidebarToggle?: () => void;
  sidebarToggleButton?: React.ReactNode;
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
        onSidebarToggle={onSidebarToggle}
        sidebarToggleButton={sidebarToggleButton}
      />
    </CalendarProvider>
  );
};
