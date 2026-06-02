import type {
  AIModelUI,
  AIWhitelistDomain,
  AIWhitelistEmail,
} from '@tuturuuu/types';
import type { ChatMessage } from './chat-types';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export interface MobilePlatformVersionPolicyPayload {
  effectiveVersion: string | null;
  minimumVersion: string | null;
  otpEnabled: boolean;
  storeUrl: string | null;
}

export interface MobileVersionPoliciesPayload {
  android: MobilePlatformVersionPolicyPayload;
  ios: MobilePlatformVersionPolicyPayload;
  webOtpEnabled: boolean;
}

export interface ExternalAppRegistration {
  allowedScopes: string[];
  createdAt: string | null;
  createdBy: string | null;
  displayName: string;
  enabled: boolean;
  id: string;
  origins: string[];
  secretIssuedAt: string | null;
  secretLastFour: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface ExternalAppsResponse {
  apps: ExternalAppRegistration[];
}

export type AiAgentAdapter = 'discord' | 'zalo';

export type AiAgentChannelStatus = 'draft' | 'deployed' | 'error' | 'paused';

export interface AiAgentSecretDescriptor {
  configured: boolean;
  lastFour: string | null;
  name: string;
}

export interface AiAgentChannelConfig {
  adapter: AiAgentAdapter;
  displayName: string;
  enabled: boolean;
  id: string;
  lastDeployedAt: string | null;
  lastError: string | null;
  lastEventAt: string | null;
  mentionRoleIds: string[];
  secrets: AiAgentSecretDescriptor[];
  status: AiAgentChannelStatus;
  webhookUrl: string | null;
  workspaceId: string;
  autoRespond?: boolean;
  discordGuildId?: string | null;
  externalChannelId?: string | null;
  historySyncEnabled?: boolean;
  zaloOfficialAccountId?: string | null;
}

export interface AiAgentDefinition {
  channels: AiAgentChannelConfig[];
  createdAt: string | null;
  enabled: boolean;
  id: string;
  instructions: string;
  modelId: string;
  name: string;
  temperature: number | null;
  tools: string[];
  updatedAt: string | null;
}

export interface AiAgentIdentityLink {
  externalUserId: string;
  platformUserId: string;
  provider: 'zalo';
  providerAccountId: string;
  workspaceId: string;
}

export interface AiAgentsResponse {
  agents: AiAgentDefinition[];
  identities: AiAgentIdentityLink[];
}

export interface AiAgentExternalThread {
  adapter: AiAgentAdapter;
  agentId: string;
  channelId: string;
  conversationId: string;
  createdAt: string;
  externalChannelId: string | null;
  externalThreadId: string;
  id: string;
  lastEventAt: string | null;
  lastSyncedAt: string | null;
  latestMessage: ChatMessage | null;
  messageCount: number;
  metadata: Record<string, unknown>;
  title: string | null;
  updatedAt: string;
  wsId: string;
}

export interface AiAgentExternalThreadsResponse {
  threads: AiAgentExternalThread[];
}

export interface AiAgentExternalMessagesResponse {
  messages: ChatMessage[];
}

export interface AiAgentExternalSyncResponse {
  message: string | null;
  ok: boolean;
  synced: number;
}

export interface AiAgentExternalDraftResponse {
  draft: string;
  sourceMessages: number;
}

export interface InternalAppSessionPolicyOverride {
  internalAppAccessTtlSeconds?: number;
  internalAppRefreshEarlySeconds?: number;
  internalAppRefreshTtlSeconds?: number;
}

export interface AppCoordinationSessionPolicy {
  browserRefreshReplayGraceSeconds: number;
  cliAccessTtlSeconds: number;
  cliRefreshTtlSeconds: number;
  externalAppBearerTtlSeconds: number;
  internalAppAccessTtlSeconds: number;
  internalAppOverrides: Record<string, InternalAppSessionPolicyOverride>;
  internalAppRefreshEarlySeconds: number;
  internalAppRefreshTtlSeconds: number;
}

export interface AppCoordinationSessionPolicyResponse {
  policy: AppCoordinationSessionPolicy;
  source: 'default' | 'environment' | 'secret';
}

export interface AIWhitelistDomainsResponse {
  count: number;
  data: AIWhitelistDomain[];
}

export interface AIWhitelistDomainResponse {
  data: AIWhitelistDomain;
}

export interface AIWhitelistEmailsResponse {
  count: number;
  data: AIWhitelistEmail[];
}

export interface AIWhitelistEmailResponse {
  data: AIWhitelistEmail;
}

type GatewayModelRow = {
  context_window: number | null;
  description: string | null;
  id: string;
  is_enabled: boolean | null;
  name: string;
  provider: string;
  tags: string[] | null;
};

export interface ListAiGatewayModelsParams {
  enabled?: boolean;
  ids?: string[];
  q?: string;
  provider?: string;
  tag?: string;
  type?: 'all' | 'embedding' | 'image' | 'language';
}

export interface ListAiGatewayModelsPageParams
  extends ListAiGatewayModelsParams {
  limit?: number | string;
  page?: number | string;
}

export interface AiGatewayModelsPage {
  data: AIModelUI[];
  pagination: {
    limit: number;
    page: number;
    total: number;
  };
}

export interface ResolveInfrastructureWorkspaceIdResponse {
  workspaceId: string | null;
}

export interface ListAIWhitelistDomainsParams {
  page?: number | string;
  pageSize?: number | string;
  q?: string;
}

export interface ListAIWhitelistEmailsParams {
  page?: number | string;
  pageSize?: number | string;
  q?: string;
}

export type CreateAIWhitelistDomainPayload = Pick<
  AIWhitelistDomain,
  'description' | 'domain'
> &
  Partial<Pick<AIWhitelistDomain, 'enabled'>>;

export type UpdateAIWhitelistDomainPayload = Pick<AIWhitelistDomain, 'enabled'>;

export type CreateAIWhitelistEmailPayload = Pick<AIWhitelistEmail, 'email'> &
  Partial<Pick<AIWhitelistEmail, 'enabled'>>;

export type UpdateAIWhitelistEmailPayload = Pick<AIWhitelistEmail, 'enabled'>;

export interface SaveExternalAppPayload {
  allowedScopes?: string[];
  displayName: string;
  enabled: boolean;
  id: string;
  issueSecret?: boolean;
  origins: string[];
}

export interface SaveExternalAppResponse {
  app: ExternalAppRegistration;
  secret: string | null;
}

export interface SaveAiAgentPayload {
  channels?: Array<{
    adapter: AiAgentAdapter;
    displayName?: string;
    enabled?: boolean;
    id: string;
    mentionRoleIds?: string[];
    secrets?: Record<string, string | null | undefined>;
    status?: AiAgentChannelStatus;
    workspaceId: string;
    autoRespond?: boolean;
    discordGuildId?: string | null;
    externalChannelId?: string | null;
    historySyncEnabled?: boolean;
    zaloOfficialAccountId?: string | null;
  }>;
  enabled?: boolean;
  id: string;
  instructions?: string;
  modelId?: string;
  name: string;
  temperature?: number | null;
  tools?: string[];
}

export interface SaveAiAgentResponse {
  agent: AiAgentDefinition;
}

export interface AiAgentDeployResponse {
  agent: AiAgentDefinition;
  channel: AiAgentChannelConfig;
  missing: string[];
  ok: boolean;
  webhookUrl: string;
}

export interface AiAgentDiagnosticCheck {
  detail?: string | null;
  id: string;
  label: string;
  ok: boolean;
}

export interface AiAgentTestResponse {
  checks?: AiAgentDiagnosticCheck[];
  ok: boolean;
  response: string;
}

export interface RotateAiAgentChannelSecretResponse {
  secret: {
    lastFour: string;
    name: string;
    value: string;
  };
}

export interface SaveAiAgentIdentityResponse {
  identity: AiAgentIdentityLink;
}

function mapGatewayModel(model: GatewayModelRow): AIModelUI {
  return {
    context: model.context_window ?? undefined,
    description: model.description ?? undefined,
    disabled: !model.is_enabled,
    label: model.name,
    provider: model.provider,
    tags: model.tags ?? undefined,
    value: model.id,
  };
}

export type AbuseRiskTier =
  | 'challenge_required'
  | 'restricted'
  | 'standard'
  | 'trusted'
  | 'watch';

export type AbuseReputationSubjectType =
  | 'api_key'
  | 'cidr'
  | 'ip'
  | 'session'
  | 'user'
  | 'user_location';

export type AbuseSignalType =
  | 'auth_failure'
  | 'automation_client'
  | 'challenge_failed'
  | 'challenge_issued'
  | 'challenge_passed'
  | 'client_error'
  | 'manual_override'
  | 'missing_user_agent'
  | 'organic_activity'
  | 'payload_abuse'
  | 'rate_limit_hit'
  | 'scripted_client';

export type AbuseChallengeStatus = 'expired' | 'failed' | 'issued' | 'passed';

export interface AbuseReputationSubject {
  api_key_id: string | null;
  cidr: string | null;
  confidence_score: number;
  created_at: string;
  id: string;
  ip_address: string | null;
  last_negative_signal_at: string | null;
  last_positive_signal_at: string | null;
  last_seen_at: string;
  metadata: Record<string, unknown>;
  negative_signal_count: number;
  positive_signal_count: number;
  reputation_score: number;
  subject_key: string;
  subject_type: AbuseReputationSubjectType;
  tier: AbuseRiskTier;
  trust_multiplier: number;
  updated_at: string;
  user_id: string | null;
  workspace_id: string | null;
}

export interface AbuseActivitySignal {
  api_key_id: string | null;
  confidence_delta: number;
  created_at: string;
  id: string;
  ip_address: string | null;
  metadata: Record<string, unknown>;
  method: string | null;
  reason_code: string | null;
  risk_tier: AbuseRiskTier;
  route: string | null;
  score_delta: number;
  signal_type: AbuseSignalType;
  subject_key: string;
  subject_type: AbuseReputationSubjectType;
  user_id: string | null;
  workspace_id: string | null;
}

export interface AbuseStepUpChallenge {
  challenge_type: string;
  completed_at: string | null;
  created_at: string;
  expires_at: string;
  id: string;
  ip_address: string | null;
  metadata: Record<string, unknown>;
  risk_tier: AbuseRiskTier;
  route: string | null;
  status: AbuseChallengeStatus;
  subject_key: string;
  updated_at: string;
  user_id: string | null;
}

export interface AbuseTrustOverride {
  created_at: string;
  created_by: string | null;
  expires_at: string | null;
  id: string;
  metadata: Record<string, unknown>;
  reason: string;
  revoke_reason: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  subject_key: string;
  subject_type: AbuseReputationSubjectType;
  tier: AbuseRiskTier;
  trust_multiplier: number;
  updated_at: string;
}

export interface AbuseIntelligenceSummary {
  activeOverrideCount: number;
  challengePassRate: number | null;
  recentSignalCount: number;
  restrictedSubjectCount: number;
  tierCounts: Record<string, number>;
  totalSubjectCount: number;
  trustedSubjectCount: number;
  watchedSubjectCount: number;
}

export interface AbuseIntelligenceSnapshot {
  challenges: AbuseStepUpChallenge[];
  overrides: AbuseTrustOverride[];
  signals: AbuseActivitySignal[];
  subjects: AbuseReputationSubject[];
  summary: AbuseIntelligenceSummary;
  topRiskySubjects: AbuseReputationSubject[];
}

export interface GetAbuseIntelligenceSnapshotParams {
  limit?: number;
  signalLimit?: number;
}

export interface CreateAbuseTrustOverridePayload {
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
  reason: string;
  subjectKey: string;
  subjectType: AbuseReputationSubjectType;
  tier: AbuseRiskTier;
  trustMultiplier?: number;
}

export interface AbuseTrustOverrideResponse {
  override: AbuseTrustOverride;
}

export interface RevokeAbuseTrustOverridePayload {
  reason: string;
}

export type InfrastructurePushAppFlavor =
  | 'development'
  | 'production'
  | 'staging';

export type InfrastructurePushDeliveryKind = 'data_only' | 'notification';

export type InfrastructurePushPlatform = 'all' | 'android' | 'ios';

export type BlueGreenMonitoringWatcherHealth =
  | 'live'
  | 'missing'
  | 'offline'
  | 'stale';

export type BlueGreenMonitoringStatus = 'degraded' | 'healthy' | 'offline';

export type BlueGreenMonitoringDockerHealth =
  | 'healthy'
  | 'none'
  | 'starting'
  | 'unknown'
  | 'unhealthy';

export interface BlueGreenMonitoringEvent {
  level: string;
  message: string;
  time: number;
}

export interface BlueGreenMonitoringContainerResource {
  color: string;
  containerId: string;
  cpuPercent: number | null;
  label: string;
  memoryBytes: number | null;
  rxBytes: number | null;
  serviceName: string;
  txBytes: number | null;
}

export interface BlueGreenMonitoringDockerContainer {
  containerId: string;
  cpuPercent: number | null;
  health: BlueGreenMonitoringDockerHealth;
  image: string | null;
  isMonitored: boolean;
  memoryBytes: number | null;
  name: string;
  ports: string | null;
  projectName: string | null;
  runningFor: string | null;
  rxBytes: number | null;
  serviceName: string | null;
  status: string | null;
  txBytes: number | null;
}

export interface BlueGreenMonitoringServiceHealth {
  containerId: string;
  health: BlueGreenMonitoringDockerHealth;
  name: string;
  projectName: string | null;
  serviceName: string;
  status: string | null;
}

export type BlueGreenDeploymentStageStatus =
  | 'failed'
  | 'queued'
  | 'running'
  | 'skipped'
  | 'succeeded';

export type BlueGreenDeploymentTarget = 'hive' | 'proxy' | 'support' | 'web';

export interface BlueGreenDeploymentStage {
  buildServices: string[];
  color: string | null;
  durationMs: number | null;
  failureReason: string | null;
  finishedAt: number | null;
  id: string;
  serviceNames: string[];
  skippedReason: string | null;
  startedAt: number | null;
  status: BlueGreenDeploymentStageStatus;
  target: BlueGreenDeploymentTarget;
}

export interface BlueGreenTargetRuntime {
  activeColor: string | null;
  commitHash: string | null;
  commitShortHash: string | null;
  deploymentStamp: string | null;
  health: string;
  lastPromotedAt: number | null;
  standbyColor: string | null;
}

export interface BlueGreenMonitoringDeployment {
  activatedAt?: number | null;
  averageLatencyMs?: number | null;
  activeColor?: string | null;
  averageRequestsPerMinute?: number | null;
  buildDurationMs?: number | null;
  cancellationReason?: string | null;
  commitHash?: string | null;
  commitShortHash?: string | null;
  commitSubject?: string | null;
  dailyAverageRequests?: number | null;
  dailyPeakRequests?: number | null;
  dailyRequestCount?: number | null;
  deploymentKind?: string | null;
  deploymentStamp?: string | null;
  endedAt?: number | null;
  errorCount?: number | null;
  failureReason?: string | null;
  finishedAt?: number | null;
  firstRequestAt?: number | null;
  imageTag?: string | null;
  lastRequestAt?: number | null;
  lifetimeMs?: number | null;
  peakRequestsPerMinute?: number | null;
  requestCount?: number | null;
  runtimeState?: 'active' | 'standby' | null;
  startedAt?: number | null;
  status?: string | null;
  stages?: BlueGreenDeploymentStage[];
}

export interface BlueGreenBuildCacheHistoryEntry {
  buildServices: string[];
  commitHash: string | null;
  commitShortHash: string | null;
  commitSubject: string | null;
  deploymentKind: string | null;
  deploymentStamp: string | null;
  serviceHashes: Record<string, string>;
  targetColor: string | null;
  updatedAt: string | null;
}

export interface BlueGreenBuildCache {
  current: Record<string, string>;
  history: BlueGreenBuildCacheHistoryEntry[];
  total: number;
}

export interface BlueGreenDeploymentPin {
  activeColor: string | null;
  commitHash: string;
  commitShortHash: string | null;
  commitSubject: string | null;
  deploymentStamp: string | null;
  kind: 'deployment-pin';
  requestedAt: string;
  requestedBy: string;
  requestedByEmail: string | null;
}

export interface BlueGreenInstantRolloutRequest {
  kind: 'sync-standby';
  requestedAt: string;
  requestedBy: string;
  requestedByEmail: string | null;
}

export interface BlueGreenWatcherRecoveryRequest {
  kind: 'watcher-recovery';
  projectBranch: string | null;
  projectId: string;
  reason: string;
  requestedAt: string;
  requestedBy: string;
  requestedByEmail: string | null;
  watcherBranch: string | null;
  watcherHealth: string | null;
}

export interface BlueGreenDockerRecoveryCommand {
  args: string[];
  command: string;
  cwd: string | null;
}

export interface BlueGreenDockerRecoverySettings {
  dockerRecoveryPollMs: number;
  dockerRecoveryTimeoutMs: number | null;
  dockerRestartAfterMs: number | null;
  dockerRestartCommand: string[] | null;
  dockerRestartCooldownMs: number;
  dockerRestartDisabled: boolean;
  emailAlertCooldownMs: number;
  emailAlertRecipients: string[];
  emailAlertsEnabled: boolean;
  kind: 'docker-recovery-settings';
  postRestartCommandTimeoutMs: number;
  postRestartCommands: BlueGreenDockerRecoveryCommand[];
  updatedAt: string | null;
  updatedBy: string | null;
  updatedByEmail: string | null;
}

export interface BlueGreenMonitoringPeriodMetric {
  averageLatencyMs: number | null;
  bucketLabel: string;
  bucketStart: number;
  deploymentCount: number;
  errorCount: number;
  errorRate: number;
  peakRequestsPerMinute: number;
  requestCount: number;
  statusCounts: {
    clientError: number;
    informational: number;
    redirect: number;
    serverError: number;
    success: number;
  };
}

export interface BlueGreenMonitoringRequestLog {
  consoleLogs?: BlueGreenMonitoringRequestConsoleLog[];
  deploymentColor: string | null;
  deploymentKey: string | null;
  deploymentStamp: string | null;
  host: string | null;
  isInternal: boolean;
  method: string | null;
  path: string;
  requestTimeMs: number | null;
  relatedLogs?: BlueGreenMonitoringWatcherLog[];
  status: number | null;
  time: number;
}

export interface BlueGreenMonitoringRequestConsoleLog {
  containerId: string | null;
  deploymentColor: string | null;
  level: string;
  message: string;
  source: string;
  time: number;
}

export interface BlueGreenMonitoringRouteSummary {
  averageLatencyMs: number | null;
  errorCount: number;
  firstRequestAt: number | null;
  hostnames: string[];
  internalCount: number;
  isServerComponentRoute: boolean;
  lastRequestAt: number | null;
  methods: string[];
  pathname: string;
  querySignatures: string[];
  requestCount: number;
  rscCount: number;
  statusCounts: {
    clientError: number;
    informational: number;
    redirect: number;
    serverError: number;
    success: number;
    unknown: number;
  };
}

export interface BlueGreenMonitoringWatcherLog {
  activeColor: string | null;
  commitHash: string | null;
  commitShortHash: string | null;
  deploymentKey: string | null;
  deploymentKind: string | null;
  deploymentStamp: string | null;
  deploymentStatus: string | null;
  eventId?: string | null;
  eventType?: string | null;
  incidentId?: string | null;
  metadata?: Record<string, unknown>;
  level: string;
  message: string;
  time: number;
}

export type CronExecutionStatus = 'failed' | 'skipped' | 'success' | 'timeout';

export type CronExecutionSource = 'manual' | 'scheduled';

export type CronMonitoringStatus = 'live' | 'missing' | 'stale';

export type CronRunStatus =
  | 'failed'
  | 'processing'
  | 'queued'
  | 'skipped'
  | 'success'
  | 'timeout';

export interface CronExecutionConsoleLog {
  containerId: string | null;
  deploymentColor: string | null;
  level: string;
  message: string;
  source: string;
  time: number;
}

export interface CronExecutionRecord {
  consoleLogs: CronExecutionConsoleLog[];
  description: string;
  durationMs: number;
  endedAt: number;
  error: string | null;
  httpStatus: number | null;
  id: string;
  jobId: string;
  path: string;
  response: string | null;
  schedule: string;
  scheduledAt: number | null;
  source: CronExecutionSource;
  startedAt: number;
  status: CronExecutionStatus;
  triggerId: string | null;
}

export interface CronRunRecord {
  consoleLogs: CronExecutionConsoleLog[];
  description: string;
  durationMs: number | null;
  endedAt: number | null;
  error: string | null;
  executionId: string | null;
  httpStatus: number | null;
  id: string;
  jobId: string;
  path: string;
  requestedAt: number;
  requestedBy: string | null;
  requestedByEmail: string | null;
  response: string | null;
  schedule: string;
  source: CronExecutionSource;
  startedAt: number | null;
  status: CronRunStatus;
  updatedAt: number;
}

export interface CronMonitoringJob {
  configuredEnabled: boolean;
  controlEnabled: boolean | null;
  description: string;
  enabled: boolean;
  failureStreak: number;
  id: string;
  lastExecution: CronExecutionRecord | null;
  lastScheduledAt: number | null;
  nextRunAt: number | null;
  path: string;
  schedule: string;
}

export interface CronMonitoringControl {
  enabled: boolean;
  jobs: Record<
    string,
    {
      enabled: boolean;
      updatedAt: number;
      updatedBy: string | null;
      updatedByEmail: string | null;
    }
  >;
  updatedAt: number | null;
  updatedBy: string | null;
  updatedByEmail: string | null;
}

export interface CronMonitoringSnapshot {
  control: CronMonitoringControl;
  enabled: boolean;
  jobs: CronMonitoringJob[];
  lastExecution: CronExecutionRecord | null;
  nextRunAt: number | null;
  overview: {
    enabledJobs: number;
    failedExecutions: number;
    failedJobs: number;
    processingRuns: number;
    queuedRuns: number;
    retainedExecutions: number;
    totalJobs: number;
  };
  retainedExecutionCount: number;
  runs: CronRunRecord[];
  source: {
    configAvailable: boolean;
    controlAvailable: boolean;
    runtimeDirAvailable: boolean;
    statusAvailable: boolean;
  };
  status: CronMonitoringStatus;
  updatedAt: number | null;
}

export interface BlueGreenMonitoringArchiveWindow {
  newestAt: number | null;
  oldestAt: number | null;
}

export interface BlueGreenMonitoringPaginatedResult<T> {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  items: T[];
  limit: number;
  offset: number;
  page: number;
  pageCount: number;
  total: number;
  window: BlueGreenMonitoringArchiveWindow;
}

export interface BlueGreenMonitoringRequestArchive
  extends BlueGreenMonitoringPaginatedResult<BlueGreenMonitoringRequestLog> {
  analytics: {
    averageLatencyMs: number | null;
    distinctRoutes: number;
    errorRequestCount: number;
    externalRequestCount: number;
    internalRequestCount: number;
    requestCount: number;
    retainedRequestCount: number;
    rscRequestCount: number;
    statusCodes: number[];
    timeframe: {
      days: number | null;
      endAt: number;
      startAt: number | null;
    };
    topRoutes: BlueGreenMonitoringRouteSummary[];
  };
}

export interface BlueGreenMonitoringSnapshot {
  analytics: {
    current: {
      daily: BlueGreenMonitoringPeriodMetric | null;
      monthly: BlueGreenMonitoringPeriodMetric | null;
      weekly: BlueGreenMonitoringPeriodMetric | null;
      yearly: BlueGreenMonitoringPeriodMetric | null;
    };
    recentRequests: BlueGreenMonitoringRequestLog[];
    totalPersistedLogs: number;
    trends: {
      daily: BlueGreenMonitoringPeriodMetric[];
      monthly: BlueGreenMonitoringPeriodMetric[];
      weekly: BlueGreenMonitoringPeriodMetric[];
      yearly: BlueGreenMonitoringPeriodMetric[];
    };
  };
  control: {
    deploymentPin: BlueGreenDeploymentPin | null;
    dockerRecoverySettings: BlueGreenDockerRecoverySettings;
    instantRolloutRequest: BlueGreenInstantRolloutRequest | null;
  };
  deployments: BlueGreenMonitoringDeployment[];
  buildCache: BlueGreenBuildCache;
  recoveryCache: {
    deployments: BlueGreenMonitoringDeployment[];
    limit: number;
    total: number;
  };
  dockerResources: {
    allContainers: BlueGreenMonitoringDockerContainer[];
    containers: BlueGreenMonitoringContainerResource[];
    message: string | null;
    serviceHealth: BlueGreenMonitoringServiceHealth[];
    state: string;
    totalCpuPercent: number;
    totalMemoryBytes: number;
    totalRxBytes: number;
    totalTxBytes: number;
  };
  overview: {
    averageBuildDurationMs: number | null;
    currentAverageRequestsPerMinute: number | null;
    currentPeakRequestsPerMinute: number | null;
    currentRequestCount: number | null;
    failedDeployments: number;
    successfulDeployments: number;
    totalDeployments: number;
    totalPersistedLogs: number;
    totalRequestsServed: number;
  };
  runtime: {
    activatedAt: number | null;
    activeColor: string | null;
    averageRequestsPerMinute: number | null;
    dailyAverageRequests: number | null;
    dailyPeakRequests: number | null;
    dailyRequestCount: number | null;
    deploymentStamp: string | null;
    lifetimeMs: number | null;
    liveColors: string[];
    peakRequestsPerMinute: number | null;
    requestCount: number | null;
    serviceContainers: Record<string, string>;
    standbyColor: string | null;
    state: string;
    targets: Record<'hive' | 'web', BlueGreenTargetRuntime>;
  };
  source: {
    historyAvailable: boolean;
    monitoringDirAvailable: boolean;
    statusAvailable: boolean;
  };
  watcher: {
    args: string[];
    events: BlueGreenMonitoringEvent[];
    health: BlueGreenMonitoringWatcherHealth;
    intervalMs: number | null;
    lastCheckAt: number | null;
    lastDeployAt: number | null;
    lastDeployStatus: string | null;
    logs: BlueGreenMonitoringWatcherLog[];
    lastResult: Record<string, unknown> | null;
    latestCommit: {
      committedAt: string | null;
      hash: string | null;
      shortHash: string | null;
      subject: string | null;
    } | null;
    lock: {
      branch: string | null;
      createdAt: string | null;
      upstreamRef: string | null;
    } | null;
    nextCheckAt: number | null;
    status: BlueGreenMonitoringStatus;
    target: {
      branch: string | null;
      upstreamRef: string | null;
    } | null;
    updatedAt: number | null;
  };
}

export interface RequestBlueGreenInstantRolloutResponse {
  message: string;
  request: BlueGreenInstantRolloutRequest;
}

export interface RequestBlueGreenWatcherRecoveryPayload {
  projectBranch?: string | null;
  projectId: string;
  reason: string;
  watcherBranch?: string | null;
  watcherHealth?: string | null;
}

export interface RequestBlueGreenWatcherRecoveryResponse {
  message: string;
  request: BlueGreenWatcherRecoveryRequest;
}

export type UpdateBlueGreenDockerRecoverySettingsPayload = Omit<
  BlueGreenDockerRecoverySettings,
  | 'dockerRestartCommand'
  | 'kind'
  | 'postRestartCommands'
  | 'updatedAt'
  | 'updatedBy'
  | 'updatedByEmail'
>;

export interface UpdateBlueGreenDockerRecoverySettingsResponse {
  message: string;
  settings: BlueGreenDockerRecoverySettings;
}

export interface PinBlueGreenDeploymentPayload {
  commitHash: string;
}

export interface PinBlueGreenDeploymentResponse {
  message: string;
  pin: BlueGreenDeploymentPin;
}

export interface ClearBlueGreenDeploymentPinResponse {
  message: string;
}

export interface SendInfrastructurePushTestPayload {
  appFlavor: InfrastructurePushAppFlavor;
  body: string;
  data?: Record<string, string>;
  deliveryKind: InfrastructurePushDeliveryKind;
  deviceId?: string;
  platform: InfrastructurePushPlatform;
  sendToAll: boolean;
  title: string;
  token?: string;
  userId?: string;
}

export interface SendInfrastructurePushTestResponse {
  deliveredCount: number;
  invalidTokens: string[];
  invalidTokensRemoved: number;
  matchedDevices: number;
  message: string;
  success: true;
  truncated: boolean;
}

export interface GetBlueGreenMonitoringSnapshotParams {
  requestPreviewLimit?: number;
  watcherLogLimit?: number;
}

export interface GetBlueGreenMonitoringArchiveParams {
  page?: number;
  pageSize?: number;
  timeframeDays?: number;
}

export interface GetCronMonitoringExecutionArchiveParams {
  jobId?: string;
  page?: number;
  pageSize?: number;
}

export interface QueueCronRunPayload {
  jobId: string;
}

export interface QueueCronRunResponse {
  message: string;
  request: {
    id: string;
    jobId: string;
    requestedAt: number;
    requestedBy: string;
    requestedByEmail: string | null;
  };
}

export interface UpdateCronMonitoringControlPayload {
  enabled: boolean;
  jobId?: string;
}

export interface UpdateCronMonitoringControlResponse {
  control: CronMonitoringControl;
  message: string;
}

export type ObservabilityLogLevel = 'debug' | 'error' | 'info' | 'warn';
export type ObservabilitySource = 'api' | 'cron' | 'server';
export type ObservabilityDashboardMode =
  | 'analytics'
  | 'cron'
  | 'deployments'
  | 'logs'
  | 'observability'
  | 'overview'
  | 'projects'
  | 'requests'
  | 'resources';

export interface InfrastructureProjectBranch {
  commitHash: string | null;
  commitShortHash: string | null;
  commitSubject: string | null;
  committedAt: number | null;
  defaultBranch: boolean;
  lastSyncedAt: number;
  name: string;
  protected: boolean;
}

export interface InfrastructureProject {
  addons: {
    cron: boolean;
    logDrain: boolean;
    nginx: boolean;
    redis: boolean;
  };
  appRoot: string;
  autoDeployEnabled: boolean;
  branches: InfrastructureProjectBranch[];
  createdAt: number;
  deploymentStatus: string;
  environment: string;
  hostnames: string[];
  id: string;
  isBuiltin: boolean;
  lastDeployedAt: number | null;
  latestCommitHash: string | null;
  latestCommitShortHash: string | null;
  latestCommitSubject: string | null;
  latestSyncedAt: number | null;
  name: string;
  port: number;
  preset: string;
  repo: {
    owner: string;
    repo: string;
    url: string;
  };
  selectedBranch: string;
  updatedAt: number;
}

export interface CreateInfrastructureProjectPayload {
  appRoot?: string;
  hostnames?: string[];
  repoUrl: string;
  selectedBranch?: string;
}

export interface UpdateInfrastructureProjectPayload {
  appRoot?: string;
  autoDeployEnabled?: boolean;
  cronEnabled?: boolean;
  hostnames?: string[];
  logDrainEnabled?: boolean;
  name?: string;
  redisEnabled?: boolean;
  selectedBranch?: string;
}

export interface InfrastructureProjectResponse {
  project: InfrastructureProject;
}

export interface InfrastructureProjectsResponse {
  projects: InfrastructureProject[];
}

export interface ObservabilityDeployment {
  color: string | null;
  commitHash: string | null;
  commitShortHash: string | null;
  commitSubject: string | null;
  deploymentKind: string | null;
  deploymentStamp: string | null;
  durationMs: number | null;
  errorCount: number;
  failureReason: string | null;
  imageTag: string | null;
  lastRequestAt: number | null;
  runtimeState: 'active' | 'standby' | null;
  requestCount: number;
  startedAt: number | null;
  status: string;
  stageSummary: {
    blockedTargets: BlueGreenDeploymentTarget[];
    cacheHitCount: number;
    failedStageCount: number;
    promotedTargets: BlueGreenDeploymentTarget[];
    rebuildCount: number;
    runningStageCount: number;
    skippedStageCount: number;
    totalStageCount: number;
  };
  stages: BlueGreenDeploymentStage[];
  synthesizedStages: boolean;
  supportBuildCacheHits: number;
  supportBuildServiceCount: number;
  supportBuildServices: string[];
  targetStates: Record<'hive' | 'web', BlueGreenTargetRuntime>;
}

export interface ObservabilityLogEvent {
  createdAt: number;
  deploymentColor: string | null;
  deploymentStamp: string | null;
  durationMs: number | null;
  errorName: string | null;
  errorStack: string | null;
  id: string;
  ipAddress: string | null;
  level: ObservabilityLogLevel;
  message: string;
  metadata: Record<string, unknown>;
  requestId: string | null;
  route: string | null;
  source: ObservabilitySource;
  status: number | null;
  userAgent: string | null;
}

export interface ObservabilityLogFacet {
  count: number;
  errorCount: number;
  value: string;
}

export interface ObservabilityLogFacets {
  levels: ObservabilityLogFacet[];
  routes: ObservabilityLogFacet[];
  sources: ObservabilityLogFacet[];
  statuses: ObservabilityLogFacet[];
}

export interface ObservabilityLogGroup {
  createdAt: number;
  deploymentColor: string | null;
  deploymentStamp: string | null;
  durationMs: number | null;
  errorName: string | null;
  errorStack: string | null;
  eventCount: number;
  events: ObservabilityLogEvent[];
  firstEventAt: number;
  id: string;
  ipAddress: string | null;
  level: ObservabilityLogLevel;
  message: string;
  metadata: Record<string, unknown>;
  requestId: string | null;
  route: string | null;
  source: ObservabilitySource;
  status: number | null;
  userAgent: string | null;
}

export interface ObservabilityLogsResult
  extends ObservabilityPaginatedResult<ObservabilityLogGroup> {
  facets: ObservabilityLogFacets;
}

export interface ObservabilityRequest {
  cronJobId: string | null;
  deploymentColor: string | null;
  deploymentStamp: string | null;
  durationMs: number | null;
  endedAt: number;
  errorMessage: string | null;
  id: string;
  ipAddress: string | null;
  logCount: number;
  method: string | null;
  path: string | null;
  relatedLogs: ObservabilityLogEvent[];
  source: ObservabilitySource;
  startedAt: number;
  status: number | null;
  userAgent: string | null;
}

export interface ObservabilityCronRun {
  durationMs: number | null;
  endedAt: number;
  errorMessage: string | null;
  httpStatus: number | null;
  id: string;
  jobId: string;
  path: string;
  requestId: string | null;
  startedAt: number;
  status: string;
}

export interface ObservabilityOverview {
  cronFailureRate: number;
  errorRate: number;
  lastEventAt: number | null;
  p95DurationMs: number | null;
  recentErrors: ObservabilityLogEvent[];
  requestCount: number;
  serverErrorCount: number;
  slowRequestCount: number;
  sourceCounts: Record<string, number>;
  topRoutes: Array<{
    averageDurationMs: number | null;
    errorCount: number;
    path: string;
    requestCount: number;
  }>;
}

export interface ObservabilityAnalyticsBucket {
  bucketStart: number;
  cronRuns: number;
  errors: number;
  requests: number;
  serverErrors: number;
}

export interface ObservabilityAnalytics {
  buckets: ObservabilityAnalyticsBucket[];
  statusFamilies: {
    clientError: number;
    redirect: number;
    serverError: number;
    success: number;
    unknown: number;
  };
  topCronJobs: Array<{
    failureCount: number;
    jobId: string;
    runCount: number;
  }>;
  topRoutes: ObservabilityOverview['topRoutes'];
}

export interface ObservabilityResourceBucket {
  bucketStart: number;
  cpuPercent: number | null;
  hasLiveSample?: boolean;
  memoryBytes: number | null;
  rxBytes: number | null;
  sampleCount?: number;
  txBytes: number | null;
}

export type ObservabilityResourceSamplingStatus =
  | 'gapped'
  | 'healthy'
  | 'live-only'
  | 'stale';

export interface ObservabilityResourceSampling {
  bucketCount: number;
  expectedIntervalMs: number;
  gapBucketCount: number;
  latestSampleAgeMs: number | null;
  latestSampleAt: number | null;
  sampledBucketCount: number;
  status: ObservabilityResourceSamplingStatus;
}

export interface ObservabilityBuildProcess {
  commitShortHash: string | null;
  deploymentKind: string | null;
  id: string;
  name: string;
  source: 'watcher';
  startedAt: number | null;
  status: string | null;
}

export interface ObservabilityBuildResources {
  activeBuilds: ObservabilityBuildProcess[];
  containers: BlueGreenMonitoringDockerContainer[];
  state: string;
  totalCpuPercent: number;
  totalMemoryBytes: number;
  totalRxBytes: number;
  totalTxBytes: number;
}

export interface ObservabilityResources {
  buildBuckets: ObservabilityResourceBucket[];
  buildResources: ObservabilityBuildResources;
  buckets: ObservabilityResourceBucket[];
  dockerResources: BlueGreenMonitoringSnapshot['dockerResources'];
  sampling: {
    build: ObservabilityResourceSampling;
    runtime: ObservabilityResourceSampling;
  };
}

export interface ObservabilityPaginatedResult<T> {
  hasNextPage: boolean;
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface GetObservabilityParams {
  deploymentStamp?: string;
  level?: ObservabilityLogLevel | 'all';
  page?: number;
  pageSize?: number;
  projectId?: string;
  q?: string;
  requestId?: string;
  route?: string;
  since?: number;
  source?: ObservabilitySource | 'all';
  status?: string;
  timeframeHours?: number;
  until?: number;
}

export interface GetBlueGreenMonitoringRequestArchiveParams
  extends GetBlueGreenMonitoringArchiveParams {
  q?: string;
  render?: 'all' | 'document' | 'rsc';
  route?: string;
  since?: number;
  status?: string;
  traffic?: 'all' | 'external' | 'internal';
  until?: number;
}

export async function sendInfrastructurePushTest(
  payload: SendInfrastructurePushTestPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<SendInfrastructurePushTestResponse>(
    '/api/v1/infrastructure/push-notifications/test',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updateMobileVersionPolicies(
  payload: MobileVersionPoliciesPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    data: MobileVersionPoliciesPayload;
    message: string;
  }>('/api/v1/infrastructure/mobile-versions', {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'PUT',
  });
}

export async function listAiGatewayModels(
  params?: ListAiGatewayModelsParams,
  options?: InternalApiClientOptions
) {
  return listAiGatewayModelsLegacy(params, options);
}

export async function listAiGatewayModelsPage(
  params?: ListAiGatewayModelsPageParams,
  options?: InternalApiClientOptions
): Promise<AiGatewayModelsPage> {
  const client = getInternalApiClient(options);
  const response = await client.json<{
    data: GatewayModelRow[];
    pagination: AiGatewayModelsPage['pagination'];
  }>('/api/v1/infrastructure/ai/models', {
    cache: 'no-store',
    query: {
      enabled:
        typeof params?.enabled === 'boolean'
          ? String(params.enabled)
          : undefined,
      format: 'paginated',
      ids: params?.ids?.join(','),
      limit: params?.limit,
      page: params?.page,
      provider: params?.provider,
      q: params?.q,
      tag: params?.tag,
      type: params?.type ?? 'language',
    },
  });

  return {
    data: response.data.map((row) => mapGatewayModel(row)),
    pagination: response.pagination,
  };
}

export async function listAiGatewayModelsLegacy(
  params?: ListAiGatewayModelsParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const rows = await client.json<GatewayModelRow[]>(
    '/api/v1/infrastructure/ai/models',
    {
      cache: 'no-store',
      query: {
        enabled:
          typeof params?.enabled === 'boolean'
            ? String(params.enabled)
            : undefined,
        ids: params?.ids?.join(','),
        provider: params?.provider,
        q: params?.q,
        tag: params?.tag,
        type: params?.type ?? 'language',
      },
    }
  );

  return rows.map((row) => mapGatewayModel(row));
}

export async function resolveInfrastructureWorkspaceId(
  wsId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ResolveInfrastructureWorkspaceIdResponse>(
    '/api/v1/infrastructure/resolve-workspace-id',
    {
      body: JSON.stringify({ wsId }),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function listAIWhitelistDomains(
  params?: ListAIWhitelistDomainsParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AIWhitelistDomainsResponse>(
    '/api/v1/infrastructure/ai/whitelist/domains',
    {
      cache: 'no-store',
      query: {
        page: params?.page,
        pageSize: params?.pageSize,
        q: params?.q,
      },
    }
  );
}

export async function createAIWhitelistDomain(
  payload: CreateAIWhitelistDomainPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AIWhitelistDomainResponse>(
    '/api/v1/infrastructure/ai/whitelist/domains',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function updateAIWhitelistDomain(
  domain: string,
  payload: UpdateAIWhitelistDomainPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/infrastructure/ai/whitelist/domain/${encodePathSegment(domain)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    }
  );
}

export async function deleteAIWhitelistDomain(
  domain: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/infrastructure/ai/whitelist/domain/${encodePathSegment(domain)}`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}

export async function listAIWhitelistEmails(
  params?: ListAIWhitelistEmailsParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AIWhitelistEmailsResponse>(
    '/api/v1/infrastructure/ai/whitelist/emails',
    {
      cache: 'no-store',
      query: {
        page: params?.page,
        pageSize: params?.pageSize,
        q: params?.q,
      },
    }
  );
}

export async function createAIWhitelistEmail(
  payload: CreateAIWhitelistEmailPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AIWhitelistEmailResponse>(
    '/api/v1/infrastructure/ai/whitelist/emails',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function updateAIWhitelistEmail(
  email: string,
  payload: UpdateAIWhitelistEmailPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/infrastructure/ai/whitelist/${encodePathSegment(email)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    }
  );
}

export async function deleteAIWhitelistEmail(
  email: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/infrastructure/ai/whitelist/${encodePathSegment(email)}`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}

export async function listExternalApps(options?: InternalApiClientOptions) {
  const client = getInternalApiClient(options);
  return client.json<ExternalAppsResponse>(
    '/api/v1/infrastructure/external-apps',
    {
      cache: 'no-store',
    }
  );
}

export async function saveExternalApp(
  payload: SaveExternalAppPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<SaveExternalAppResponse>(
    '/api/v1/infrastructure/external-apps',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function rotateExternalAppSecret(
  appId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<SaveExternalAppResponse>(
    `/api/v1/infrastructure/external-apps/${encodeURIComponent(appId)}/secrets`,
    {
      cache: 'no-store',
      method: 'POST',
    }
  );
}

export async function listAiAgents(options?: InternalApiClientOptions) {
  const client = getInternalApiClient(options);
  return client.json<AiAgentsResponse>('/api/v1/infrastructure/ai-agents', {
    cache: 'no-store',
  });
}

export async function saveAiAgent(
  payload: SaveAiAgentPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<SaveAiAgentResponse>('/api/v1/infrastructure/ai-agents', {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
}

export async function deployAiAgentChannel(
  agentId: string,
  channelId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AiAgentDeployResponse>(
    `/api/v1/infrastructure/ai-agents/${encodePathSegment(agentId)}/deploy`,
    {
      body: JSON.stringify({ channelId }),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function pauseAiAgentChannel(
  agentId: string,
  channelId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<SaveAiAgentResponse>(
    `/api/v1/infrastructure/ai-agents/${encodePathSegment(agentId)}/pause`,
    {
      body: JSON.stringify({ channelId }),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function testAiAgentChannel(
  agentId: string,
  channelId: string,
  prompt?: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AiAgentTestResponse>(
    `/api/v1/infrastructure/ai-agents/${encodePathSegment(agentId)}/test`,
    {
      body: JSON.stringify({ channelId, prompt }),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function rotateAiAgentChannelSecret(
  agentId: string,
  channelId: string,
  name: string,
  value?: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<RotateAiAgentChannelSecretResponse>(
    `/api/v1/infrastructure/ai-agents/${encodePathSegment(
      agentId
    )}/channels/${encodePathSegment(channelId)}/secrets`,
    {
      body: JSON.stringify({ name, value }),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function saveAiAgentIdentityLink(
  payload: AiAgentIdentityLink,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<SaveAiAgentIdentityResponse>(
    '/api/v1/infrastructure/ai-agents/identities',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function listAiAgentExternalThreads(
  params?: {
    agentId?: string | null;
    channelId?: string | null;
    wsId?: string | null;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<AiAgentExternalThreadsResponse>(
    '/api/v1/infrastructure/ai-agents/external-threads',
    {
      cache: 'no-store',
      query: {
        agentId: params?.agentId ?? undefined,
        channelId: params?.channelId ?? undefined,
        wsId: params?.wsId ?? undefined,
      },
    }
  );
}

export async function listAiAgentExternalMessages(
  threadId: string,
  params?: { limit?: number },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<AiAgentExternalMessagesResponse>(
    `/api/v1/infrastructure/ai-agents/external-threads/${encodePathSegment(
      threadId
    )}/messages`,
    {
      cache: 'no-store',
      query: {
        limit: params?.limit,
      },
    }
  );
}

export async function syncAiAgentExternalThread(
  threadId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<AiAgentExternalSyncResponse>(
    `/api/v1/infrastructure/ai-agents/external-threads/${encodePathSegment(
      threadId
    )}/sync`,
    {
      cache: 'no-store',
      method: 'POST',
    }
  );
}

export async function draftAiAgentExternalResponse(
  threadId: string,
  prompt: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<AiAgentExternalDraftResponse>(
    `/api/v1/infrastructure/ai-agents/external-threads/${encodePathSegment(
      threadId
    )}/draft`,
    {
      body: JSON.stringify({ prompt }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export async function sendAiAgentExternalResponse(
  threadId: string,
  content: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<{ message: ChatMessage }>(
    `/api/v1/infrastructure/ai-agents/external-threads/${encodePathSegment(
      threadId
    )}/send`,
    {
      body: JSON.stringify({ content }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export async function getAppCoordinationSessionPolicy(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AppCoordinationSessionPolicyResponse>(
    '/api/v1/infrastructure/app-coordination',
    {
      cache: 'no-store',
    }
  );
}

export async function saveAppCoordinationSessionPolicy(
  payload: AppCoordinationSessionPolicy,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AppCoordinationSessionPolicyResponse>(
    '/api/v1/infrastructure/app-coordination',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    }
  );
}

export async function getAbuseIntelligenceSnapshot(
  params?: GetAbuseIntelligenceSnapshotParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const searchParams = new URLSearchParams();

  if (params?.limit != null) {
    searchParams.set('limit', String(params.limit));
  }

  if (params?.signalLimit != null) {
    searchParams.set('signalLimit', String(params.signalLimit));
  }

  return client.json<AbuseIntelligenceSnapshot>(
    `/api/v1/infrastructure/abuse-intelligence${
      searchParams.size > 0 ? `?${searchParams.toString()}` : ''
    }`,
    { cache: 'no-store' }
  );
}

export async function createAbuseTrustOverride(
  payload: CreateAbuseTrustOverridePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AbuseTrustOverrideResponse>(
    '/api/v1/infrastructure/abuse-intelligence',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function revokeAbuseTrustOverride(
  overrideId: string,
  payload: RevokeAbuseTrustOverridePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AbuseTrustOverrideResponse>(
    `/api/v1/infrastructure/abuse-intelligence/overrides/${encodeURIComponent(
      overrideId
    )}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
    }
  );
}

export async function getBlueGreenMonitoringSnapshot(
  params?: GetBlueGreenMonitoringSnapshotParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const searchParams = new URLSearchParams();

  if (params?.requestPreviewLimit != null) {
    searchParams.set('requestPreviewLimit', String(params.requestPreviewLimit));
  }

  if (params?.watcherLogLimit != null) {
    searchParams.set('watcherLogLimit', String(params.watcherLogLimit));
  }

  return client.json<BlueGreenMonitoringSnapshot>(
    `/api/v1/infrastructure/monitoring/blue-green${
      searchParams.size > 0 ? `?${searchParams.toString()}` : ''
    }`,
    {
      cache: 'no-store',
    }
  );
}

export async function getBlueGreenMonitoringRequestArchive(
  params?: GetBlueGreenMonitoringRequestArchiveParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const searchParams = new URLSearchParams();

  if (params?.page != null) {
    searchParams.set('page', String(params.page));
  }

  if (params?.pageSize != null) {
    searchParams.set('pageSize', String(params.pageSize));
  }

  if (params?.timeframeDays != null) {
    searchParams.set('timeframeDays', String(params.timeframeDays));
  }

  if (params?.q) {
    searchParams.set('q', params.q);
  }

  if (params?.status && params.status !== 'all') {
    searchParams.set('status', params.status);
  }

  if (params?.route && params.route !== 'all') {
    searchParams.set('route', params.route);
  }

  if (params?.since != null) {
    searchParams.set('since', String(params.since));
  }

  if (params?.render && params.render !== 'all') {
    searchParams.set('render', params.render);
  }

  if (params?.traffic && params.traffic !== 'all') {
    searchParams.set('traffic', params.traffic);
  }

  if (params?.until != null) {
    searchParams.set('until', String(params.until));
  }

  return client.json<BlueGreenMonitoringRequestArchive>(
    `/api/v1/infrastructure/monitoring/blue-green/requests${
      searchParams.size > 0 ? `?${searchParams.toString()}` : ''
    }`,
    {
      cache: 'no-store',
    }
  );
}

export async function getBlueGreenMonitoringWatcherLogArchive(
  params?: GetBlueGreenMonitoringArchiveParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const searchParams = new URLSearchParams();

  if (params?.page != null) {
    searchParams.set('page', String(params.page));
  }

  if (params?.pageSize != null) {
    searchParams.set('pageSize', String(params.pageSize));
  }

  return client.json<
    BlueGreenMonitoringPaginatedResult<BlueGreenMonitoringWatcherLog>
  >(
    `/api/v1/infrastructure/monitoring/blue-green/watcher-logs${
      searchParams.size > 0 ? `?${searchParams.toString()}` : ''
    }`,
    {
      cache: 'no-store',
    }
  );
}

export async function getCronMonitoringSnapshot(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CronMonitoringSnapshot>(
    '/api/v1/infrastructure/monitoring/cron',
    {
      cache: 'no-store',
    }
  );
}

export async function getCronMonitoringExecutionArchive(
  params?: GetCronMonitoringExecutionArchiveParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const searchParams = new URLSearchParams();

  if (params?.page != null) {
    searchParams.set('page', String(params.page));
  }

  if (params?.pageSize != null) {
    searchParams.set('pageSize', String(params.pageSize));
  }

  if (params?.jobId) {
    searchParams.set('jobId', params.jobId);
  }

  return client.json<BlueGreenMonitoringPaginatedResult<CronExecutionRecord>>(
    `/api/v1/infrastructure/monitoring/cron/executions${
      searchParams.size > 0 ? `?${searchParams.toString()}` : ''
    }`,
    {
      cache: 'no-store',
    }
  );
}

export async function queueCronRun(
  payload: QueueCronRunPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<QueueCronRunResponse>(
    '/api/v1/infrastructure/monitoring/cron/run',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function updateCronMonitoringControl(
  payload: UpdateCronMonitoringControlPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<UpdateCronMonitoringControlResponse>(
    '/api/v1/infrastructure/monitoring/cron/control',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    }
  );
}

function appendObservabilitySearchParams(
  searchParams: URLSearchParams,
  params?: GetObservabilityParams
) {
  if (params?.page != null) {
    searchParams.set('page', String(params.page));
  }

  if (params?.pageSize != null) {
    searchParams.set('pageSize', String(params.pageSize));
  }

  if (params?.projectId) {
    searchParams.set('projectId', params.projectId);
  }

  if (params?.timeframeHours != null) {
    searchParams.set('timeframeHours', String(params.timeframeHours));
  }

  if (params?.q) {
    searchParams.set('q', params.q);
  }

  if (params?.route && params.route !== 'all') {
    searchParams.set('route', params.route);
  }

  if (params?.requestId) {
    searchParams.set('requestId', params.requestId);
  }

  if (params?.deploymentStamp) {
    searchParams.set('deploymentStamp', params.deploymentStamp);
  }

  if (params?.since != null) {
    searchParams.set('since', String(params.since));
  }

  if (params?.until != null) {
    searchParams.set('until', String(params.until));
  }

  if (params?.level && params.level !== 'all') {
    searchParams.set('level', params.level);
  }

  if (params?.source && params.source !== 'all') {
    searchParams.set('source', params.source);
  }

  if (params?.status && params.status !== 'all') {
    searchParams.set('status', params.status);
  }
}

function getObservabilityPath(path: string, params?: GetObservabilityParams) {
  const searchParams = new URLSearchParams();
  appendObservabilitySearchParams(searchParams, params);
  return `/api/v1/infrastructure/observability/${path}${
    searchParams.size > 0 ? `?${searchParams.toString()}` : ''
  }`;
}

export async function getObservabilityOverview(
  params?: Pick<GetObservabilityParams, 'projectId' | 'timeframeHours'>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ObservabilityOverview>(
    getObservabilityPath('overview', params),
    { cache: 'no-store' }
  );
}

export async function getObservabilityDeployments(
  params?: GetObservabilityParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ObservabilityPaginatedResult<ObservabilityDeployment>>(
    getObservabilityPath('deployments', params),
    { cache: 'no-store' }
  );
}

export async function getObservabilityLogs(
  params?: GetObservabilityParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ObservabilityLogsResult>(
    getObservabilityPath('logs', params),
    { cache: 'no-store' }
  );
}

export async function getObservabilityRequests(
  params?: GetObservabilityParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ObservabilityPaginatedResult<ObservabilityRequest>>(
    getObservabilityPath('requests', params),
    { cache: 'no-store' }
  );
}

export async function getObservabilityAnalytics(
  params?: Pick<GetObservabilityParams, 'projectId' | 'timeframeHours'>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ObservabilityAnalytics>(
    getObservabilityPath('analytics', params),
    { cache: 'no-store' }
  );
}

export async function getObservabilityCronRuns(
  params?: GetObservabilityParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ObservabilityPaginatedResult<ObservabilityCronRun>>(
    getObservabilityPath('cron-runs', params),
    { cache: 'no-store' }
  );
}

export async function getObservabilityResources(
  params?: Pick<GetObservabilityParams, 'projectId' | 'timeframeHours'>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ObservabilityResources>(
    getObservabilityPath('resources', params),
    { cache: 'no-store' }
  );
}

export async function getInfrastructureProjects(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<InfrastructureProjectsResponse>(
    '/api/v1/infrastructure/projects',
    { cache: 'no-store' }
  );
}

export async function createInfrastructureProject(
  payload: CreateInfrastructureProjectPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<InfrastructureProjectResponse>(
    '/api/v1/infrastructure/projects',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function updateInfrastructureProject(
  projectId: string,
  payload: UpdateInfrastructureProjectPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<InfrastructureProjectResponse>(
    `/api/v1/infrastructure/projects/${encodeURIComponent(projectId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
    }
  );
}

export async function deleteInfrastructureProject(
  projectId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<InfrastructureProjectResponse>(
    `/api/v1/infrastructure/projects/${encodeURIComponent(projectId)}`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}

export async function syncInfrastructureProject(
  projectId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<InfrastructureProjectResponse>(
    `/api/v1/infrastructure/projects/${encodeURIComponent(projectId)}/sync`,
    {
      cache: 'no-store',
      method: 'POST',
    }
  );
}

export async function queueInfrastructureProjectDeploy(
  projectId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<InfrastructureProjectResponse>(
    `/api/v1/infrastructure/projects/${encodeURIComponent(projectId)}/deploy`,
    {
      cache: 'no-store',
      method: 'POST',
    }
  );
}

export async function requestBlueGreenInstantRollout(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<RequestBlueGreenInstantRolloutResponse>(
    '/api/v1/infrastructure/monitoring/blue-green/instant-rollout',
    {
      cache: 'no-store',
      method: 'POST',
    }
  );
}

export async function requestBlueGreenWatcherRecovery(
  payload: RequestBlueGreenWatcherRecoveryPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<RequestBlueGreenWatcherRecoveryResponse>(
    '/api/v1/infrastructure/monitoring/blue-green/watcher-recovery',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function updateBlueGreenDockerRecoverySettings(
  payload: UpdateBlueGreenDockerRecoverySettingsPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<UpdateBlueGreenDockerRecoverySettingsResponse>(
    '/api/v1/infrastructure/monitoring/blue-green/recovery-settings',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
    }
  );
}

export async function pinBlueGreenDeployment(
  payload: PinBlueGreenDeploymentPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<PinBlueGreenDeploymentResponse>(
    '/api/v1/infrastructure/monitoring/blue-green/deployment-pin',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function clearBlueGreenDeploymentPin(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ClearBlueGreenDeploymentPinResponse>(
    '/api/v1/infrastructure/monitoring/blue-green/deployment-pin',
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}
