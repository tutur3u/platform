import {
  getInternalApiClient,
  type InternalApiClientOptions,
  withMailApiBaseUrl,
} from './client';
import { mailboxPath } from './mail-paths';

export type MailCorrespondent = {
  email: string;
  name: string | null;
  score: number;
  lastAt: string;
  /** Direction of the most recent exchange with this address. */
  direction: 'inbound' | 'outbound';
};

export type ListMailCorrespondentsParams = {
  query?: string;
  limit?: number;
};

/** Ranks addresses the mailbox exchanged mail with in the last 180 days. */
export async function listMailCorrespondents(
  workspaceId: string,
  mailboxId: string,
  { query, limit }: ListMailCorrespondentsParams = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  const search: Record<string, string> = {};
  if (query?.trim()) search.q = query.trim();
  if (limit !== undefined) search.limit = String(limit);
  return client.json<{ data: MailCorrespondent[] }>(
    mailboxPath(workspaceId, mailboxId, '/correspondents'),
    {
      cache: 'no-store',
      credentials: 'include',
      query: search,
    }
  );
}
