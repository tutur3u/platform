import { useQuery } from '@tanstack/react-query';
import type { CalendarSourceOption } from '@tuturuuu/internal-api';
import { getCalendarInvitationCapabilities } from '@tuturuuu/internal-api/calendar-invitation-capabilities';

export function useCalendarInvitationCapabilities(
  workspaceId?: string,
  source?: CalendarSourceOption
) {
  const selected =
    source?.writable &&
    (source.provider === 'google' || source.provider === 'microsoft')
      ? source
      : undefined;
  const query = useQuery({
    queryKey: [
      'calendar-invitation-capabilities',
      workspaceId,
      selected?.provider,
      selected?.connectionId,
      selected?.externalCalendarId,
    ],
    enabled: Boolean(workspaceId && selected),
    retry: false,
    staleTime: 30_000,
    queryFn: () => {
      if (!workspaceId || !selected)
        throw new Error('Invitation source unavailable');
      return getCalendarInvitationCapabilities(workspaceId, selected);
    },
  });
  const capabilities =
    Boolean(workspaceId && selected) &&
    query.isSuccess &&
    !query.isFetching &&
    !query.isStale
      ? query.data
      : undefined;
  return {
    capabilities,
    refresh: query.refetch,
    isRefreshing: query.isFetching,
  };
}
