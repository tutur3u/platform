import { getInternalApiClient, type InternalApiClientOptions } from './client';
import type {
  AbuseReputationSubjectType,
  AbuseRiskTier,
  AbuseTrustOverride,
  RateLimitAbsoluteLimits,
  RateLimitMode,
} from './infrastructure';

export type {
  RateLimitAbsoluteLimits,
  RateLimitMode,
} from './infrastructure';

/** A rate-limit rule is an abuse_trust_override row with mode/absolute fields. */
export type RateLimitRule = AbuseTrustOverride;

export interface RateLimitWindowTriple {
  day: number;
  hour: number;
  minute: number;
}

export interface RateLimitWriteBaseLimits {
  anonymous: RateLimitWindowTriple;
  userBackstop: RateLimitWindowTriple;
  userIp: RateLimitWindowTriple;
}

export interface RateLimitRulesSummary {
  blockedCount: number;
  byMode: Record<string, number>;
  bySubjectType: Record<string, number>;
  total: number;
  unlimitedCount: number;
}

export interface RateLimitRulesResponse {
  /** Subject keys whose rule is currently live in the edge trust cache. */
  edgeCachedSubjectKeys: string[];
  rules: RateLimitRule[];
  summary: RateLimitRulesSummary;
  writeBaseLimits: RateLimitWriteBaseLimits;
}

export interface RateLimitWriteCounter {
  bucket: string;
  current_count: number;
  window_seconds: number;
  window_started_at: string;
}

export interface RateLimitEdgeBucket {
  callerClass: string | null;
  key: string;
  operation: 'get' | 'mutate' | null;
  policy: string | null;
  subject: string | null;
  subjectKind: string | null;
  trustSuffix: string | null;
  window: 'minute' | 'hour' | 'day' | null;
}

export interface RateLimitEdgeBucketGroup {
  available: boolean;
  buckets: RateLimitEdgeBucket[];
  cursor: string;
  keys: string[];
}

export interface RateLimitLiveUsageResponse {
  mutateBuckets: RateLimitEdgeBucketGroup;
  readBuckets: RateLimitEdgeBucketGroup;
  writeCounters: RateLimitWriteCounter[];
}

export interface GetRateLimitRulesParams {
  includeRevoked?: boolean;
  limit?: number;
  q?: string;
  subjectType?: AbuseReputationSubjectType;
}

export interface CreateRateLimitRulePayload {
  absoluteLimits?: RateLimitAbsoluteLimits | null;
  expiresAt?: string | null;
  limitMode?: RateLimitMode;
  metadata?: Record<string, unknown>;
  reason: string;
  subjectKey: string;
  subjectType: AbuseReputationSubjectType;
  tier: AbuseRiskTier;
  trustMultiplier?: number;
}

export interface UpdateRateLimitRulePayload {
  absoluteLimits?: RateLimitAbsoluteLimits | null;
  expiresAt?: string | null;
  limitMode?: RateLimitMode;
  reason?: string;
  tier?: AbuseRiskTier;
  trustMultiplier?: number;
}

export interface RevokeRateLimitRulePayload {
  reason: string;
}

export interface RateLimitRuleResponse {
  rule: RateLimitRule;
}

export interface WorkspaceRateLimitSecretsResponse {
  managedNames: string[];
  secrets: Record<string, string>;
  wsId: string;
}

export interface SaveWorkspaceRateLimitSecretsPayload {
  secrets: Record<string, string | null>;
  wsId: string;
}

const BASE_PATH = '/api/v1/infrastructure/rate-limits';

export async function getRateLimitRules(
  params?: GetRateLimitRulesParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const searchParams = new URLSearchParams();

  if (params?.limit != null) {
    searchParams.set('limit', String(params.limit));
  }
  if (params?.subjectType) {
    searchParams.set('subjectType', params.subjectType);
  }
  if (params?.q) {
    searchParams.set('q', params.q);
  }
  if (params?.includeRevoked) {
    searchParams.set('includeRevoked', 'true');
  }

  return client.json<RateLimitRulesResponse>(
    `${BASE_PATH}${searchParams.size > 0 ? `?${searchParams.toString()}` : ''}`,
    { cache: 'no-store' }
  );
}

export async function createRateLimitRule(
  payload: CreateRateLimitRulePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<RateLimitRuleResponse>(BASE_PATH, {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}

export async function updateRateLimitRule(
  ruleId: string,
  payload: UpdateRateLimitRulePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<RateLimitRuleResponse>(
    `${BASE_PATH}/rules/${encodeURIComponent(ruleId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }
  );
}

export async function revokeRateLimitRule(
  ruleId: string,
  payload: RevokeRateLimitRulePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<RateLimitRuleResponse>(
    `${BASE_PATH}/rules/${encodeURIComponent(ruleId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'DELETE',
    }
  );
}

export async function getRateLimitLiveUsage(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<RateLimitLiveUsageResponse>(`${BASE_PATH}/live-usage`, {
    cache: 'no-store',
  });
}

export async function getWorkspaceRateLimitSecrets(
  wsId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceRateLimitSecretsResponse>(
    `${BASE_PATH}/workspace-secrets?wsId=${encodeURIComponent(wsId)}`,
    { cache: 'no-store' }
  );
}

export async function saveWorkspaceRateLimitSecrets(
  payload: SaveWorkspaceRateLimitSecretsPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ ok: boolean; wsId: string }>(
    `${BASE_PATH}/workspace-secrets`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    }
  );
}
