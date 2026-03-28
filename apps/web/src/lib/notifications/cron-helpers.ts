import type { SendEmailResult } from '@tuturuuu/email-service';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import { isEmailBlacklisted } from '@/lib/email-blacklist';

export const NOTIFICATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const NOTIFICATION_QUERY_CHUNK_SIZE = 500;
export const NOTIFICATION_SELECT_PAGE_SIZE = 1000;

export const NOTIFICATION_OLDER_THAN_ONE_DAY_SKIP_REASON =
  'skipped: older_than_1_day';
export const NOTIFICATION_STALE_WORKSPACE_MEMBERSHIP_SKIP_REASON =
  'skipped: stale_workspace_membership';
export const NOTIFICATION_UNDELIVERABLE_EMAIL_SKIP_REASON_PREFIX =
  'skipped: undeliverable_email';

type SupabaseLike = {
  from: (table: string) => any;
  rpc?: unknown;
};

export type NotificationSkipCandidate = {
  created_at: string;
  id: string;
  scope?: string | null;
  user_id?: string | null;
  ws_id?: string | null;
};

export type NotificationSkipReasonOptions = {
  blockedEmailCache?: Map<string, boolean>;
  errorMessage?: string | null;
  membershipCache?: Map<string, boolean>;
  notification: NotificationSkipCandidate;
  recipientEmail?: string | null;
  sendResult?: Pick<SendEmailResult, 'blockedRecipients' | 'error'> | null;
};

function normalizeSkipDetail(detail: string): string {
  const normalized = detail
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || 'unknown';
}

function getAgeSkipReason(createdAtValue: string): string | null {
  const createdAt = new Date(createdAtValue);
  if (Number.isNaN(createdAt.getTime())) {
    return null;
  }

  return Date.now() - createdAt.getTime() > NOTIFICATION_MAX_AGE_MS
    ? NOTIFICATION_OLDER_THAN_ONE_DAY_SKIP_REASON
    : null;
}

function getRecipientSkipReason(recipientEmail?: string | null): string | null {
  if (recipientEmail === undefined) {
    return null;
  }

  if (!recipientEmail) {
    return buildNotificationUndeliverableSkipReason('missing_recipient_email');
  }

  return isValidTuturuuuEmail(recipientEmail)
    ? null
    : buildNotificationUndeliverableSkipReason('external_recipient_domain');
}

function getProviderSkipReason({
  errorMessage,
  sendResult,
}: Pick<NotificationSkipReasonOptions, 'errorMessage' | 'sendResult'>):
  | string
  | null {
  const blockedRecipient = sendResult?.blockedRecipients?.[0];
  if (blockedRecipient) {
    const blockedReason = normalizeSkipDetail(
      blockedRecipient.reason || blockedRecipient.details || 'blocked_recipient'
    );
    return buildNotificationUndeliverableSkipReason(
      `blocked_recipient_${blockedReason}`
    );
  }

  const combinedError = [sendResult?.error, errorMessage]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    combinedError.includes('sender domain not verified') ||
    combinedError.includes('domain not verified') ||
    combinedError.includes('mailfromdomainnotverifiedexception')
  ) {
    return buildNotificationUndeliverableSkipReason(
      'sender_domain_not_verified'
    );
  }

  return null;
}

async function hasWorkspaceMembership(
  sbAdmin: SupabaseLike,
  notification: NotificationSkipCandidate,
  membershipCache?: Map<string, boolean>
): Promise<boolean> {
  if (
    notification.scope !== 'workspace' ||
    !notification.user_id ||
    !notification.ws_id
  ) {
    return true;
  }

  const cacheKey = `${notification.ws_id}:${notification.user_id}`;
  const cachedMembership = membershipCache?.get(cacheKey);
  if (cachedMembership !== undefined) {
    return cachedMembership;
  }

  const { data: membership, error } = await sbAdmin
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', notification.ws_id)
    .eq('user_id', notification.user_id)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to verify workspace membership for notification ${notification.id}: ${error.message}`
    );
  }

  const isMember = Boolean(membership);
  membershipCache?.set(cacheKey, isMember);
  return isMember;
}

async function getBlacklistSkipReason(
  sbAdmin: SupabaseLike,
  recipientEmail?: string | null,
  blockedEmailCache?: Map<string, boolean>
): Promise<string | null> {
  if (!recipientEmail || !isValidTuturuuuEmail(recipientEmail)) {
    return null;
  }

  const isBlocked = await isEmailBlacklisted(
    sbAdmin,
    recipientEmail,
    blockedEmailCache
  );

  return isBlocked
    ? buildNotificationUndeliverableSkipReason('blocked_recipient_blacklist')
    : null;
}

export function buildNotificationUndeliverableSkipReason(
  detail?: string
): string {
  if (!detail) {
    return NOTIFICATION_UNDELIVERABLE_EMAIL_SKIP_REASON_PREFIX;
  }

  return `${NOTIFICATION_UNDELIVERABLE_EMAIL_SKIP_REASON_PREFIX}:${normalizeSkipDetail(detail)}`;
}

export async function getNotificationSkipReason(
  sbAdmin: SupabaseLike,
  {
    blockedEmailCache,
    errorMessage,
    membershipCache,
    notification,
    recipientEmail,
    sendResult,
  }: NotificationSkipReasonOptions
): Promise<string | null> {
  const ageReason = getAgeSkipReason(notification.created_at);
  if (ageReason) {
    return ageReason;
  }

  const isMember = await hasWorkspaceMembership(
    sbAdmin,
    notification,
    membershipCache
  );
  if (!isMember) {
    return NOTIFICATION_STALE_WORKSPACE_MEMBERSHIP_SKIP_REASON;
  }

  const recipientReason = getRecipientSkipReason(recipientEmail);
  if (recipientReason) {
    return recipientReason;
  }

  const blacklistReason = await getBlacklistSkipReason(
    sbAdmin,
    recipientEmail,
    blockedEmailCache
  );
  if (blacklistReason) {
    return blacklistReason;
  }

  return getProviderSkipReason({ errorMessage, sendResult });
}

export function chunkValues<T>(
  values: T[],
  chunkSize = NOTIFICATION_QUERY_CHUNK_SIZE
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

export async function fetchAllPaginatedRows<T>(
  fetchPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: unknown | null }>,
  pageSize = NOTIFICATION_SELECT_PAGE_SIZE
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);

    if (error) {
      throw error;
    }

    const pageRows = data ?? [];
    rows.push(...pageRows);

    if (pageRows.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

export async function fetchAllChunkedPaginatedRows<T, TValue>(
  values: TValue[],
  fetchPage: (
    chunk: TValue[],
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: unknown | null }>,
  {
    chunkSize = NOTIFICATION_QUERY_CHUNK_SIZE,
    pageSize = NOTIFICATION_SELECT_PAGE_SIZE,
  }: {
    chunkSize?: number;
    pageSize?: number;
  } = {}
): Promise<T[]> {
  const rows: T[] = [];

  for (const chunk of chunkValues(values, chunkSize)) {
    const chunkRows = await fetchAllPaginatedRows<T>(
      (from, to) => fetchPage(chunk, from, to),
      pageSize
    );
    rows.push(...chunkRows);
  }

  return rows;
}
