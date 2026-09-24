'use client';
import { useQuery } from '@tanstack/react-query';
import { getMeetFollowupContext } from '@tuturuuu/internal-api';
export function useFollowupContext(wsId: string, meetingId: string) {
  const query = useQuery({
    queryKey: ['meet-followup-context', wsId, meetingId],
    queryFn: () => getMeetFollowupContext(wsId, meetingId),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  return {
    profile: { ...query, data: query.data?.user },
    workspaces: { ...query, data: query.data?.workspaces },
    settings: {
      ...query,
      data: query.data ? { timezone: query.data.timezone } : undefined,
    },
  };
}
