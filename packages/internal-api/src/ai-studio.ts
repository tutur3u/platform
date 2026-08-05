import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export {
  type AiStudioPlaygroundEndpoint,
  AiStudioPlaygroundError,
  type AiStudioPlaygroundResult,
  type AiStudioPlaygroundStep,
  type AiStudioPlaygroundTool,
  type AiStudioPublicModel,
  getAiStudioPublicModels,
  getAiStudioSavedKeyModels,
  runAiStudioPlayground,
  runAiStudioSavedKeyPlayground,
} from './ai-studio-playground';

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
  nextCursor: string | null;
}

export type AiStudioCatalogResource = 'agents' | 'datasets' | 'prompts';

export interface AiStudioCatalogItem {
  description: string | null;
  id: string;
  name: string;
  slug: string | null;
  updatedAt: string;
  version: number | null;
}

export interface AiStudioCatalogResponse {
  items: AiStudioCatalogItem[];
  nextCursor: string | null;
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

export type AiStudioExecutionMode = 'background' | 'interactive';

export interface AiStudioUsageRow {
  abortedCount: number;
  averageLatencyMs: number;
  billedCredits: number;
  bucketDate: string;
  embeddingUnits: number;
  /** Whether a user was waiting on this work or a machine credential ran it. */
  executionMode: AiStudioExecutionMode;
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
  /**
   * Credits this usage would have cost had it been metered. Distinct from
   * `billedCredits` (what was actually charged, zero here) and from
   * `providerCostUsd` (what the provider charged us). An external app running
   * unmetered shows zero billed, a real provider cost, and this as the size of
   * the allocation it consumed.
   */
  unmeteredCredits: number;
}

export interface AiStudioUsageResponse {
  from: string;
  rows: AiStudioUsageRow[];
  to: string;
  totals: Omit<
    AiStudioUsageRow,
    | 'bucketDate'
    | 'executionMode'
    | 'feature'
    | 'modelId'
    | 'sourceId'
    | 'sourceType'
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
  executionMode: AiStudioExecutionMode;
  requestId: string;
  searchUnits: number;
  sourceId: string;
  sourceType: 'api_key' | 'external_app' | 'session' | 'workspace_credit';
  status: 'aborted' | 'failed' | 'reserved' | 'running' | 'succeeded';
  unmeteredCredits: number;
  stepCount: number;
  toolCallCount: number;
}

export interface AiStudioRunsResponse {
  nextCursor: string | null;
  runs: AiStudioRun[];
}

export interface AiStudioRunStep {
  billedCredits: number;
  completedAt: string | null;
  errorClass: string | null;
  inputTokens: number;
  kind: 'grader' | 'model' | 'system' | 'tool';
  latencyMs: number | null;
  modelId: string | null;
  name: string;
  outputTokens: number;
  providerCostUsd: number;
  sequence: number;
  startedAt: string;
  status: 'aborted' | 'failed' | 'running' | 'succeeded';
}

export interface AiStudioRunDetailResponse {
  runId: string;
  steps: AiStudioRunStep[];
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

export interface AiStudioGlobalSettings {
  capture_default_enabled: boolean;
  content_retention_days: number;
  default_models: string[];
  globally_enabled: boolean;
  metadata_retention_days: number;
  workspace_default_enabled: boolean;
}

export interface AiStudioPolicy {
  allowed_models: string[];
  api_key_creation_approved: boolean;
  capture_enabled: boolean | null;
  content_retention_days: number | null;
  denied_models: string[];
  metadata_retention_days: number | null;
  monthly_credit_budget: number | null;
  no_training_enforced: boolean;
  requests_per_minute: number | null;
  updated_at: string;
}

export interface AiStudioPolicyResponse {
  global: AiStudioGlobalSettings | null;
  policy: AiStudioPolicy | null;
}

export interface UpdateAiStudioPolicyInput {
  allowedModels: string[];
  captureEnabled: boolean | null;
  contentRetentionDays: number | null;
  deniedModels: string[];
  metadataRetentionDays: number | null;
  monthlyCreditBudget: number | null;
  noTrainingEnforced: boolean;
  requestsPerMinute: number | null;
}

function workspaceAiPath(workspaceId: string, suffix: string) {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/ai/${suffix}`;
}

export function getAiStudioKeys(
  workspaceId: string,
  query?: { cursor?: string; limit?: number },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<AiStudioKeysResponse>(
    workspaceAiPath(workspaceId, 'keys'),
    { cache: 'no-store', query }
  );
}

export function getAiStudioCatalog(
  workspaceId: string,
  resource: AiStudioCatalogResource,
  query?: { cursor?: string; limit?: number },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<AiStudioCatalogResponse>(
    workspaceAiPath(workspaceId, `catalog/${resource}`),
    { cache: 'no-store', query }
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

export function getAiStudioRunDetail(
  workspaceId: string,
  runId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<AiStudioRunDetailResponse>(
    `${workspaceAiPath(workspaceId, 'runs')}/${encodePathSegment(runId)}`,
    { cache: 'no-store' }
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

export function getAiStudioPolicy(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<AiStudioPolicyResponse>(
    workspaceAiPath(workspaceId, 'policy'),
    { cache: 'no-store' }
  );
}

export function updateAiStudioPolicy(
  workspaceId: string,
  payload: UpdateAiStudioPolicyInput,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ policy: AiStudioPolicy }>(
    workspaceAiPath(workspaceId, 'policy'),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }
  );
}
