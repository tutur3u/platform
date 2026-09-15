import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withMailApiBaseUrl,
} from './client';
import type { BulkUpdateMailThreadsPayload } from './mail-types';

function mailboxPath(workspaceId: string, mailboxId: string, suffix: string) {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/mail/mailboxes/${encodePathSegment(mailboxId)}${suffix}`;
}
function jsonHeaders() {
  return { 'Content-Type': 'application/json' };
}
export async function bulkUpdateMailThreads(
  workspaceId: string,
  mailboxId: string,
  payload: BulkUpdateMailThreadsPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<{ updated: number }>(
    mailboxPath(workspaceId, mailboxId, '/threads/bulk'),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'include',
      headers: jsonHeaders(),
      method: 'POST',
    }
  );
}

/** Marks one bounded batch; continue with nextCursor to include unloaded messages. */
export async function markMailFolderRead(
  workspaceId: string,
  mailboxId: string,
  payload: { folder: 'inbox' | 'archive'; cursor?: string; before?: string },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<{
    updated: number;
    before: string;
    nextCursor: string | null;
  }>(mailboxPath(workspaceId, mailboxId, '/read-all'), {
    body: JSON.stringify(payload),
    cache: 'no-store',
    credentials: 'include',
    headers: jsonHeaders(),
    method: 'POST',
  });
}
