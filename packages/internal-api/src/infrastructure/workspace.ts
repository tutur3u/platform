import { getInternalApiClient, type InternalApiClientOptions } from '../client';
import type { ResolveInfrastructureWorkspaceIdResponse } from './types';

export async function resolveInfrastructureWorkspaceId(
  wsId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ResolveInfrastructureWorkspaceIdResponse>(
    '/api/v1/infrastructure/resolve-workspace-id',
    {
      body: JSON.stringify({ wsId }),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export type * from './types';
