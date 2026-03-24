import { getInternalApiClient, type InternalApiClientOptions } from './client';

export async function getCurrentUserNovaTeam(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ teamId: string | null }>('/api/v1/nova/me/team', {
    cache: 'no-store',
  });
}
