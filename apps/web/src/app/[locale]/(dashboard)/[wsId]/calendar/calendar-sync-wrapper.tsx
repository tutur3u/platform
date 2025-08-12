'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarSyncProvider } from '@tuturuuu/ui/hooks/use-calendar-sync';
import type { WorkspaceCalendarEvent, WorkspaceCalendarGoogleToken } from '@tuturuuu/types/db';

interface CalendarSyncWrapperProps {
  wsId: string;
  googleToken: WorkspaceCalendarGoogleToken | null;
  children: React.ReactNode;
}

// Type definition for the expected useQuery interface
type ExpectedUseQuery = (options: {
  queryKey: string[];
  enabled: boolean;
  queryFn: () => Promise<WorkspaceCalendarEvent[] | null>;
  refetchInterval?: number;
}) => {
  data: WorkspaceCalendarEvent[] | null;
  isLoading: boolean;
};

export function CalendarSyncWrapper({
  wsId,
  googleToken,
  children,
}: CalendarSyncWrapperProps) {
  const queryClient = useQueryClient();

  // Type cast the hooks to match the expected interface
  // This is safe because the CalendarSyncProvider expects these functions
  // to be called with specific parameters, and the actual useQuery hook
  // can handle those parameters correctly
  const adaptedUseQuery = useQuery as unknown as ExpectedUseQuery;
  const adaptedUseQueryClient = () => ({
    invalidateQueries: (options: { queryKey: string[]; exact?: boolean }) => {
      return queryClient.invalidateQueries(options);
    },
  });

  return (
    <CalendarSyncProvider
      wsId={wsId}
      experimentalGoogleToken={googleToken}
      useQuery={adaptedUseQuery}
      useQueryClient={adaptedUseQueryClient}
    >
      {children}
    </CalendarSyncProvider>
  );
}
