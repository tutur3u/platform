import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withMailApiBaseUrl,
} from './client';
import type { MailBootstrapResponse } from './mail-types';

export async function getMailBootstrap(
  workspaceId: string,
  options?: InternalApiClientOptions,
  includeUnreadCounts = true
) {
  return getInternalApiClient(
    withMailApiBaseUrl(options)
  ).json<MailBootstrapResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/mail/bootstrap`,
    {
      cache: 'no-store',
      credentials: 'include',
      query: includeUnreadCounts ? undefined : { view: 'mailboxes' },
    }
  );
}

export async function getMailUnreadCounts(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(withMailApiBaseUrl(options)).json<
    Record<string, number | null>
  >(`/api/v1/workspaces/${encodePathSegment(workspaceId)}/mail/bootstrap`, {
    cache: 'no-store',
    credentials: 'include',
    query: { view: 'counts' },
  });
}
