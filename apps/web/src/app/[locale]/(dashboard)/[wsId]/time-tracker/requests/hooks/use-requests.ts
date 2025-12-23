import { useQuery } from '@tanstack/react-query';
import type { ExtendedTimeTrackingRequest } from '../page';

interface UseRequestsParams {
  wsId: string;
  status?: 'all' | 'pending' | 'approved' | 'rejected';
  userId?: string;
  page?: number;
  limit?: number;
  initialData?: RequestsResponse;
}

interface RequestsResponse {
  requests: ExtendedTimeTrackingRequest[];
  totalCount: number;
  totalPages: number;
}

export function useRequests({
  wsId,
  status = 'pending',
  userId,
  page = 1,
  limit = 10,
  initialData,
}: UseRequestsParams) {
  return useQuery<RequestsResponse>({
    queryKey: ['time-tracking-requests', wsId, status, userId, page, limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('status', status);
      params.set('page', page.toString());
      params.set('limit', limit.toString());
      if (userId) {
        params.set('userId', userId);
      }

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/requests?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch requests');
      }

      return response.json();
    },
    staleTime: 30000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    initialData,
  });
}

interface UseAvailableUsersParams {
  wsId: string;
  /** If false, skip fetching. Default is true. */
  enabled?: boolean;
}

interface User {
  id: string;
  display_name: string;
}

export function useAvailableUsers({ wsId, enabled = true }: UseAvailableUsersParams) {
  return useQuery<User[]>({
    queryKey: ['time-tracking-requests-users', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/requests/users`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch available users');
      }

      return response.json();
    },
    enabled,
    staleTime: 60000, // 1 minute
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

interface UseRequestDetailParams {
  wsId: string;
  requestId: string;
  enabled?: boolean;
}

export function useRequestDetail({
  wsId,
  requestId,
  enabled = true,
}: UseRequestDetailParams) {
  return useQuery<ExtendedTimeTrackingRequest>({
    queryKey: ['time-tracking-request', wsId, requestId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/requests/${requestId}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch request details');
      }

      return response.json();
    },
    enabled,
    staleTime: 30000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}
