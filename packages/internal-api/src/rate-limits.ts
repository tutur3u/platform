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

export interface RateLimitAbuseProtectionControls {
  ipBlockingEnabled: boolean;
  rateLimitsEnabled: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export type RateLimitResolvedSubjectKind =
  | 'api_key'
  | 'cidr'
  | 'ip'
  | 'session'
  | 'unknown'
  | 'user'
  | 'user_location'
  | 'workspace';

export type RateLimitSubjectConfidence = 'parsed' | 'unknown' | 'verified';

export interface RateLimitSubjectResolution {
  confidence: RateLimitSubjectConfidence;
  detail: string | null;
  id: string | null;
  ip: string | null;
  kind: RateLimitResolvedSubjectKind;
  label: string;
  subjectKey: string;
  technicalKey: string;
  userId: string | null;
  verified: boolean;
  workspaceId: string | null;
}

export interface RateLimitWorkspaceSummary {
  avatarUrl: string | null;
  handle: string | null;
  id: string;
  name: string | null;
  personal: boolean | null;
}

export interface RateLimitUserSummary {
  avatarUrl: string | null;
  displayName: string | null;
  email: string | null;
  handle: string | null;
  id: string;
}

export type RateLimitActionPresetKey =
  | 'clear_ip_only'
  | 'custom'
  | 'event_or_classroom'
  | 'extended_trusted'
  | 'trusted_workspace';

export interface RateLimitRecommendedAction {
  createWorkspaceRule: boolean;
  description: string;
  disabledReason: string | null;
  expiresInDays: number | null;
  key: RateLimitActionPresetKey;
  label: string;
  recommended: boolean;
  requiresAdvancedOverride: boolean;
  trustMultiplier: number | null;
}

export interface RateLimitUsageDisplay {
  action: string;
  subtitle: string | null;
  technicalKey: string;
  title: string;
}

export type RateLimitRule = AbuseTrustOverride & {
  subject?: RateLimitSubjectResolution;
};

export interface RateLimitRulesResponse {
  abuseProtectionControls: RateLimitAbuseProtectionControls;
  /** Subject keys whose rule is currently live in the edge trust cache. */
  edgeCachedSubjectKeys: string[];
  rules: RateLimitRule[];
  summary: RateLimitRulesSummary;
  writeBaseLimits: RateLimitWriteBaseLimits;
}

export interface RateLimitWriteCounter {
  bucket: string;
  current_count: number;
  display?: RateLimitUsageDisplay;
  subject?: RateLimitSubjectResolution;
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
  subjectResolution?: RateLimitSubjectResolution;
  trustSuffix: string | null;
  window: 'minute' | 'hour' | 'day' | null;
  display?: RateLimitUsageDisplay;
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
  presetKey?: RateLimitActionPresetKey;
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

export interface UpdateRateLimitAbuseProtectionControlsPayload {
  ipBlockingEnabled?: boolean;
  rateLimitsEnabled?: boolean;
}

export type RateLimitSubjectSearchKind = 'ip' | 'user' | 'workspace';

export interface RateLimitSubjectSearchResult {
  detail: string | null;
  kind: RateLimitSubjectSearchKind;
  label: string;
  subjectKey: string;
  subjectType: AbuseReputationSubjectType;
  value: string;
}

export interface RateLimitSubjectSearchResponse {
  results: RateLimitSubjectSearchResult[];
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

export async function updateRateLimitAbuseProtectionControls(
  payload: UpdateRateLimitAbuseProtectionControlsPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    abuseProtectionControls: RateLimitAbuseProtectionControls;
    message: string;
  }>(BASE_PATH, {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    method: 'PATCH',
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

export async function searchRateLimitSubjects(
  params: {
    kind: RateLimitSubjectSearchKind;
    limit?: number;
    q?: string;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<RateLimitSubjectSearchResponse>(
    '/api/v1/infrastructure/rate-limit-subjects',
    {
      cache: 'no-store',
      query: {
        kind: params.kind,
        limit: params.limit,
        q: params.q,
      },
    }
  );
}
