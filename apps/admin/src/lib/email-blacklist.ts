import type { Database } from '@tuturuuu/types/db';

const EMAIL_BLOCK_STATUS_CHUNK_SIZE = 500;

type EmailBlockStatusRow =
  Database['public']['CompositeTypes']['email_block_status'];

type EmailBlockStatusRpcArgs = {
  p_emails: string[];
};

type EmailBlockStatusRpcResponse = {
  data: EmailBlockStatusRow[] | null;
  error: unknown | null;
};

type RpcCapableClient = {
  rpc?: unknown;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function chunkValues<T>(
  values: T[],
  chunkSize = EMAIL_BLOCK_STATUS_CHUNK_SIZE
): T[][] {
  if (values.length === 0) {
    return [];
  }

  const safeChunkSize = Math.max(1, chunkSize);
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += safeChunkSize) {
    chunks.push(values.slice(index, index + safeChunkSize));
  }

  return chunks;
}

function callGetEmailBlockStatusesRpc(
  client: RpcCapableClient,
  args: EmailBlockStatusRpcArgs
): Promise<EmailBlockStatusRpcResponse> {
  return (
    client.rpc as unknown as (
      fn: string,
      rpcArgs: EmailBlockStatusRpcArgs
    ) => Promise<EmailBlockStatusRpcResponse>
  )('get_email_block_statuses', args);
}

export function normalizeEmailForBlacklistLookup(
  email?: string | null
): string | null {
  if (!email) {
    return null;
  }

  const normalized = normalizeEmail(email);
  return normalized.length > 0 ? normalized : null;
}

export async function preloadBlockedEmailCache(
  client: RpcCapableClient,
  emails: Array<string | null | undefined>,
  cache = new Map<string, boolean>()
): Promise<Map<string, boolean>> {
  if (typeof client.rpc !== 'function') {
    return cache;
  }

  const normalizedEmails = [
    ...new Set(
      emails
        .map((email) => normalizeEmailForBlacklistLookup(email))
        .filter((email): email is string => Boolean(email))
    ),
  ].filter((email) => !cache.has(email));

  if (normalizedEmails.length === 0) {
    return cache;
  }

  for (const emailChunk of chunkValues(normalizedEmails)) {
    const { data, error } = await callGetEmailBlockStatusesRpc(client, {
      p_emails: emailChunk,
    });

    if (error) {
      console.error(
        '[EmailBlacklist] Failed to preload blocked email statuses',
        error
      );
      for (const email of emailChunk) {
        cache.set(email, false);
      }
      continue;
    }

    const matchedEmails = new Set<string>();
    for (const row of data ?? []) {
      const email = normalizeEmailForBlacklistLookup(row.email);
      if (!email) {
        continue;
      }

      matchedEmails.add(email);
      cache.set(email, Boolean(row.is_blocked));
    }

    for (const email of emailChunk) {
      if (!matchedEmails.has(email)) {
        cache.set(email, false);
      }
    }
  }

  return cache;
}

export async function isEmailBlacklisted(
  client: RpcCapableClient,
  email?: string | null,
  cache?: Map<string, boolean>
): Promise<boolean> {
  const normalizedEmail = normalizeEmailForBlacklistLookup(email);
  if (!normalizedEmail) {
    return false;
  }

  if (cache?.has(normalizedEmail)) {
    return cache.get(normalizedEmail) === true;
  }

  const warmedCache = await preloadBlockedEmailCache(
    client,
    [normalizedEmail],
    cache ?? new Map<string, boolean>()
  );

  return warmedCache.get(normalizedEmail) === true;
}
