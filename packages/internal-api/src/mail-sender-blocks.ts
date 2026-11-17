import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withMailApiBaseUrl,
} from './client';
import { jsonHeaders, mailboxPath } from './mail-paths';

export type MailSenderBlockKind = 'address' | 'domain';

export type MailSenderBlock = {
  id: string;
  kind: MailSenderBlockKind;
  value: string;
  createdAt: string;
  createdBy: string | null;
};

const blocksPath = (wsId: string, mailboxId: string, suffix = '') =>
  mailboxPath(wsId, mailboxId, `/sender-blocks${suffix}`);

export function listMailSenderBlocks(
  wsId: string,
  mailboxId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(withMailApiBaseUrl(options)).json<{
    blocks: MailSenderBlock[];
  }>(blocksPath(wsId, mailboxId), {
    cache: 'no-store',
    credentials: 'include',
  });
}

export function addMailSenderBlock(
  wsId: string,
  mailboxId: string,
  input: { kind: MailSenderBlockKind; value: string; moveExisting?: boolean },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(withMailApiBaseUrl(options)).json<{
    block: MailSenderBlock;
    moved: number;
  }>(blocksPath(wsId, mailboxId), {
    method: 'POST',
    cache: 'no-store',
    credentials: 'include',
    headers: jsonHeaders(),
    body: JSON.stringify(input),
  });
}

export function removeMailSenderBlock(
  wsId: string,
  mailboxId: string,
  blockId: string,
  { restoreToInbox = false }: { restoreToInbox?: boolean } = {},
  options?: InternalApiClientOptions
) {
  const query = restoreToInbox ? '?restoreToInbox=true' : '';
  return getInternalApiClient(withMailApiBaseUrl(options)).json<{
    moved: number;
  }>(blocksPath(wsId, mailboxId, `/${encodePathSegment(blockId)}${query}`), {
    method: 'DELETE',
    cache: 'no-store',
    credentials: 'include',
  });
}
