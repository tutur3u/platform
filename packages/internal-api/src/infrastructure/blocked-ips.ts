import { getInternalApiClient, type InternalApiClientOptions } from '../client';

export type BlockedIpReason =
  | 'api_abuse'
  | 'api_auth_failed'
  | 'api_rate_limited'
  | 'manual'
  | 'mfa_challenge'
  | 'mfa_verify_failed'
  | 'otp_limit_reset'
  | 'otp_send'
  | 'otp_verify_failed'
  | 'password_login_failed'
  | 'reauth_send'
  | 'reauth_verify_failed';

export type BlockedIpBlockReason =
  | 'manual'
  | 'mfa_challenge'
  | 'mfa_verify_failed'
  | 'otp_send'
  | 'otp_verify_failed'
  | 'password_login_failed'
  | 'reauth_send'
  | 'reauth_verify_failed';

export type BlockedIpBlockLevel = 0 | 1 | 2 | 3 | 4;

export type BlockedIpStatus = 'active' | 'expired' | 'manually_unblocked';

export type BlockedIpMetadataValue =
  | BlockedIpMetadataValue[]
  | boolean
  | null
  | number
  | string
  | { [key: string]: BlockedIpMetadataValue };

export interface BlockedIpUser {
  display_name: string | null;
  id: string;
}

export interface BlockedIpEntry {
  block_level: number;
  blocked_at: string;
  created_at: string;
  expires_at: string;
  id: string;
  ip_address: string;
  metadata: { [key: string]: BlockedIpMetadataValue } | null;
  reason: BlockedIpReason;
  status: BlockedIpStatus;
  unblock_reason: string | null;
  unblocked_at: string | null;
  unblocked_by: string | null;
  unblocked_by_user: BlockedIpUser | null;
  updated_at: string;
}

export interface ListBlockedIpsParams {
  ip?: string;
  page?: number;
  pageSize?: number;
  q?: string;
  status?: BlockedIpStatus | 'all' | '';
}

export interface ListBlockedIpsResponse {
  count: number;
  data: BlockedIpEntry[];
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface BlockBlockedIpPayload {
  blockLevel?: BlockedIpBlockLevel;
  ipAddress: string;
  notes?: string;
  reason: BlockedIpBlockReason;
}

export interface BlockBlockedIpResponse {
  data: BlockedIpEntry;
  message: string;
}

export interface UnblockBlockedIpPayload {
  ipAddress: string;
  reason?: string;
}

export interface UnblockBlockedIpResponse {
  message: string;
}

function normalizeBlockedIpStatus(status?: ListBlockedIpsParams['status']) {
  return status ? status : 'all';
}

function normalizeBlockedIpFilter(params: ListBlockedIpsParams) {
  const filter = params.ip ?? params.q;
  const normalizedFilter = filter?.trim();

  return normalizedFilter ? normalizedFilter : undefined;
}

export async function listBlockedIps(
  params: ListBlockedIpsParams = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<ListBlockedIpsResponse>(
    '/api/v1/infrastructure/blocked-ips',
    {
      cache: 'no-store',
      query: {
        ip: normalizeBlockedIpFilter(params),
        page: params.page,
        pageSize: params.pageSize,
        status: normalizeBlockedIpStatus(params.status),
      },
    }
  );
}

export async function blockBlockedIp(
  payload: BlockBlockedIpPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<BlockBlockedIpResponse>(
    '/api/v1/infrastructure/blocked-ips',
    {
      body: JSON.stringify({
        block_level: payload.blockLevel,
        ip_address: payload.ipAddress,
        notes: payload.notes,
        reason: payload.reason,
      }),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function unblockBlockedIp(
  payload: UnblockBlockedIpPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<UnblockBlockedIpResponse>(
    '/api/v1/infrastructure/blocked-ips',
    {
      body: JSON.stringify({
        ip_address: payload.ipAddress,
        reason: payload.reason,
      }),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'DELETE',
    }
  );
}
