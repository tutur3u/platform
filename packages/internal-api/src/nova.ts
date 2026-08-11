import { getInternalApiClient, type InternalApiClientOptions } from './client';

export interface NovaSubmissionUser {
  display_name: string | null;
  email: string | null;
  id: string;
}

export interface NovaSubmissionUserSearchResponse {
  data: NovaSubmissionUser[];
  selected: NovaSubmissionUser | null;
}

export async function searchNovaSubmissionUsers(
  {
    q,
    selectedUserId,
  }: {
    q?: string;
    selectedUserId?: string;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<NovaSubmissionUserSearchResponse>(
    '/api/v1/nova/challenge-management/users/search',
    {
      cache: 'no-store',
      query: { q, selectedUserId },
    }
  );
}

export async function getCurrentUserNovaTeam(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ teamId: string | null }>('/api/v1/nova/me/team', {
    cache: 'no-store',
  });
}
