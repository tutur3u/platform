import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export type AiStudioKeyEnvironment = 'development' | 'staging' | 'production';

export interface AiStudioKeyApproval {
  approved: boolean;
  decidedAt: string | null;
  decidedBy: string | null;
}

export interface AiStudioApiKey {
  allowed_models: string[];
  created_at: string;
  credit_budget: number | null;
  credits_used: number;
  environment: AiStudioKeyEnvironment;
  expires_at: string | null;
  id: string;
  last_used_at: string | null;
  name: string;
  prefix: string;
  requests_per_minute: number | null;
  revoked_at: string | null;
  rotated_to: string | null;
}

export interface AiStudioKeysResponse {
  approval: AiStudioKeyApproval;
  keys: AiStudioApiKey[];
}

export interface CreateAiStudioKeyInput {
  allowedModels?: string[];
  creditBudget?: number;
  environment?: AiStudioKeyEnvironment;
  expiresAt?: string;
  name: string;
  requestsPerMinute?: number;
}

export interface AiStudioKeySecretResponse {
  key: Partial<AiStudioApiKey> & { id: string; name: string; prefix: string };
  secret: string;
  warning: string;
}

export interface AiStudioUsageRow {
  abortedCount: number;
  averageLatencyMs: number;
  billedCredits: number;
  bucketDate: string;
  embeddingUnits: number;
  failedCount: number;
  feature: string;
  imageUnits: number;
  inputTokens: number;
  latencySampleCount: number;
  modelId: string;
  outputTokens: number;
  providerCostUsd: number;
  reasoningTokens: number;
  requestCount: number;
  searchUnits: number;
  sourceId: string;
  sourceType: 'api_key' | 'external_app' | 'session' | 'workspace_credit';
  succeededCount: number;
}

export interface AiStudioUsageResponse {
  from: string;
  rows: AiStudioUsageRow[];
  to: string;
  totals: Omit<
    AiStudioUsageRow,
    'bucketDate' | 'feature' | 'modelId' | 'sourceId' | 'sourceType'
  >;
}

export interface AiStudioRun {
  billedCredits: number;
  completedAt: string | null;
  createdAt: string;
  embeddingUnits: number;
  errorClass: string | null;
  feature: string;
  firstTokenLatencyMs: number | null;
  id: string;
  imageUnits: number;
  inputTokens: number;
  latencyMs: number | null;
  modelId: string;
  outputTokens: number;
  providerCostUsd: number;
  reasoningTokens: number;
  requestId: string;
  searchUnits: number;
  sourceType: 'api_key' | 'external_app' | 'session' | 'workspace_credit';
  status: 'aborted' | 'failed' | 'reserved' | 'running' | 'succeeded';
}

export interface AiStudioRunsResponse {
  nextCursor: string | null;
  runs: AiStudioRun[];
}

export interface AiStudioCreditStatus {
  allowedFeatures: string[];
  allowedModels: string[];
  balanceScope: 'user' | 'workspace';
  bonusCredits: number;
  dailyLimit: number | null;
  dailyUsed: number;
  defaultImageModel: string;
  defaultLanguageModel: string;
  included: {
    bonusCredits: number;
    remaining: number;
    totalAllocated: number;
    totalUsed: number;
  };
  maxOutputTokens: number | null;
  payg: {
    nextExpiry: string | null;
    remaining: number;
    totalGranted: number;
    totalUsed: number;
  };
  percentUsed: number;
  periodEnd: string;
  periodStart: string;
  remaining: number;
  seatCount: number | null;
  tier: string;
  totalAllocated: number;
  totalUsed: number;
}

function workspaceAiPath(workspaceId: string, suffix: string) {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/ai/${suffix}`;
}

export function getAiStudioKeys(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<AiStudioKeysResponse>(
    workspaceAiPath(workspaceId, 'keys'),
    { cache: 'no-store' }
  );
}

export function createAiStudioKey(
  workspaceId: string,
  payload: CreateAiStudioKeyInput,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<AiStudioKeySecretResponse>(
    workspaceAiPath(workspaceId, 'keys'),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export function updateAiStudioKey(
  workspaceId: string,
  keyId: string,
  action: 'revoke' | 'rotate',
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<
    AiStudioKeySecretResponse | { revoked: true }
  >(`${workspaceAiPath(workspaceId, 'keys')}/${encodePathSegment(keyId)}`, {
    body: JSON.stringify({ action }),
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    method: 'PATCH',
  });
}

export function getAiStudioUsage(
  workspaceId: string,
  range: { from: string; to: string },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<AiStudioUsageResponse>(
    workspaceAiPath(workspaceId, 'usage'),
    { cache: 'no-store', query: range }
  );
}

export function getAiStudioRuns(
  workspaceId: string,
  query: {
    cursor?: string;
    feature?: string;
    from: string;
    limit?: number;
    model?: string;
    status?: string;
    to: string;
  },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<AiStudioRunsResponse>(
    workspaceAiPath(workspaceId, 'runs'),
    { cache: 'no-store', query }
  );
}

export function getAiStudioCredits(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<AiStudioCreditStatus>(
    workspaceAiPath(workspaceId, 'credits'),
    { cache: 'no-store' }
  );
}
