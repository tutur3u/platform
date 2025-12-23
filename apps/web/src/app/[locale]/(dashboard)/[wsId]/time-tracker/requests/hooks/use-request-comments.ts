import { useQuery } from '@tanstack/react-query';

export interface TimeTrackingRequestComment {
  id: string;
  request_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export function useRequestComments(
  wsId: string,
  requestId: string,
  enabled: boolean
) {
  return useQuery<TimeTrackingRequestComment[]>({
    queryKey: ['time-tracking-request-comments', requestId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/requests/${requestId}/comments`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch comments');
      }
      const data = await response.json();
      return data.comments || [];
    },
    enabled,
    staleTime: 0, // Comments can change frequently, fetch fresh data
  });
}
