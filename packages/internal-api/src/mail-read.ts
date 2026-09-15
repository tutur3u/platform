import {
  getInternalApiClient,
  type InternalApiClientOptions,
  withMailApiBaseUrl,
} from './client';
import { jsonHeaders, mailboxPath } from './mail-paths';
import type { BulkUpdateMailThreadsPayload } from './mail-types';

export async function bulkUpdateMailThreads(
  workspaceId: string,
  mailboxId: string,
  payload: BulkUpdateMailThreadsPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  let updated = 0;
  for (let start = 0; start < payload.threadIds.length; start += 100) {
    const result = await client.json<{ updated: number }>(
      mailboxPath(workspaceId, mailboxId, '/threads/bulk'),
      {
        body: JSON.stringify({
          ...payload,
          threadIds: payload.threadIds.slice(start, start + 100),
        }),
        cache: 'no-store',
        credentials: 'include',
        headers: jsonHeaders(),
        method: 'POST',
      }
    );
    updated += result.updated;
  }
  return { updated };
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
