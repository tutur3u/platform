import type { InternalEmail } from '@tuturuuu/types';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export async function listWorkspaceEmails(
  workspaceId: string,
  query?: { page?: number; pageSize?: number },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ emails: InternalEmail[] }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/mail`,
    {
      query,
      cache: 'no-store',
    }
  );

  return payload.emails ?? [];
}
