import { getInternalApiClient, type InternalApiClientOptions } from './client';
import type { RateLimitAbsoluteLimits } from './infrastructure';
import type { RateLimitRule } from './rate-limits';

export type RateLimitAppealStatus =
  | 'approved'
  | 'closed'
  | 'pending'
  | 'rejected';

export interface RateLimitAppealDiagnostics {
  capturedAt?: string;
  environment?: {
    timezone?: string;
    userAgent?: string;
  };
  headers?: Record<string, string>;
  identity?: {
    clientIp?: string;
    userEmail?: string;
    userId?: string;
  };
  limit?: {
    callerClass?: string;
    debugBypass?: string;
    limit?: string;
    policy?: string;
    proxyBlockReason?: string;
    remaining?: string;
    reset?: string;
    retryAfterSeconds?: number;
    retryAttempt?: number;
    warning?: string;
    willRetry?: boolean;
    window?: string;
  };
  request?: {
    maxRetries?: number;
    method?: string;
    originalStatus?: number;
    pagePath?: string;
    requestPath?: string;
    responseStatus?: number;
  };
}

export interface RateLimitAppeal {
  cleared_blocked_ip_id: string | null;
  client_ip: string;
  created_at: string;
  created_rate_limit_rule_id: string | null;
  creator_id: string;
  diagnostics: RateLimitAppealDiagnostics;
  id: string;
  message: string | null;
  page_path: string | null;
  proxy_block_reason: string | null;
  rate_limit_policy: string | null;
  rate_limit_window: string | null;
  request_method: string | null;
  request_path: string | null;
  response_status: number | null;
  review_note: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  retry_after_seconds: number | null;
  status: RateLimitAppealStatus;
  temporary_relief_expires_at: string | null;
  temporary_relief_granted_at: string | null;
  timezone: string | null;
  turnstile_verified_at: string | null;
  updated_at: string;
  user_agent: string | null;
  user_email: string | null;
  workspace_id: string | null;
}

export interface SubmitRateLimitAppealPayload {
  diagnostics: RateLimitAppealDiagnostics;
  message?: string;
  turnstileToken?: string;
}

export interface SubmitRateLimitAppealResponse {
  appeal: RateLimitAppeal;
  coalesced: boolean;
  temporaryReliefExpiresAt: string;
}

export interface ListRateLimitAppealsParams {
  limit?: number;
  q?: string;
  status?: RateLimitAppealStatus | 'all';
}

export interface ListRateLimitAppealsResponse {
  appeals: RateLimitAppeal[];
  summary: Record<RateLimitAppealStatus, number> & { total: number };
}

export interface GetRateLimitAppealResponse {
  appeal: RateLimitAppeal;
}

export interface ApproveRateLimitAppealPayload {
  absoluteLimits?: RateLimitAbsoluteLimits | null;
  createWorkspaceRule?: boolean;
  expiresInDays?: number;
  reviewNote?: string;
  trustMultiplier?: number;
  workspaceId?: string | null;
}

export interface RejectRateLimitAppealPayload {
  reviewNote?: string;
}

export interface CloseRateLimitAppealPayload {
  reviewNote?: string;
}

export interface RateLimitAppealActionResponse {
  appeal: RateLimitAppeal;
  rule?: RateLimitRule | null;
  unblocked: boolean;
}

const USER_BASE_PATH = '/api/v1/rate-limit-appeals';
const ADMIN_BASE_PATH = '/api/v1/infrastructure/rate-limit-appeals';

export async function submitRateLimitAppeal(
  payload: SubmitRateLimitAppealPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<SubmitRateLimitAppealResponse>(USER_BASE_PATH, {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}

export async function listRateLimitAppeals(
  params: ListRateLimitAppealsParams = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ListRateLimitAppealsResponse>(ADMIN_BASE_PATH, {
    cache: 'no-store',
    query: {
      limit: params.limit,
      q: params.q,
      status: params.status,
    },
  });
}

export async function getRateLimitAppeal(
  appealId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<GetRateLimitAppealResponse>(
    `${ADMIN_BASE_PATH}/${encodeURIComponent(appealId)}`,
    { cache: 'no-store' }
  );
}

export async function approveRateLimitAppeal(
  appealId: string,
  payload: ApproveRateLimitAppealPayload = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<RateLimitAppealActionResponse>(
    `${ADMIN_BASE_PATH}/${encodeURIComponent(appealId)}`,
    {
      body: JSON.stringify({ action: 'approve', ...payload }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }
  );
}

export async function rejectRateLimitAppeal(
  appealId: string,
  payload: RejectRateLimitAppealPayload = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<RateLimitAppealActionResponse>(
    `${ADMIN_BASE_PATH}/${encodeURIComponent(appealId)}`,
    {
      body: JSON.stringify({ action: 'reject', ...payload }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }
  );
}

export async function closeRateLimitAppeal(
  appealId: string,
  payload: CloseRateLimitAppealPayload = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<RateLimitAppealActionResponse>(
    `${ADMIN_BASE_PATH}/${encodeURIComponent(appealId)}`,
    {
      body: JSON.stringify({ action: 'close', ...payload }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }
  );
}
