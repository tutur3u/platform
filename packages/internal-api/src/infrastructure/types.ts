import type {
  AIModelUI,
  AIWhitelistDomain,
  AIWhitelistEmail,
} from '@tuturuuu/types';
import type { Json } from '@tuturuuu/types/db';
import type { ChatMessage } from '../chat-types';

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

export type MobileDeploymentPlatform = 'android' | 'ios';
export type MobileDeploymentFileKind =
  | 'android_google_services_json'
  | 'ios_google_service_info_plist'
  | 'android_upload_keystore'
  | 'google_play_service_account_json'
  | 'apple_distribution_certificate_p12'
  | 'apple_app_store_provisioning_profile'
  | 'app_store_connect_private_key_p8';
export type MobileDeploymentScalarName =
  | 'ANDROID_KEYSTORE_ALIAS'
  | 'ANDROID_KEYSTORE_PASSWORD'
  | 'ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD'
  | 'GOOGLE_PLAY_PACKAGE_NAME'
  | 'GOOGLE_PLAY_TRACK'
  | 'APPLE_BUNDLE_ID'
  | 'APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD'
  | 'APPLE_TEAM_ID'
  | 'APP_STORE_CONNECT_API_KEY_ID'
  | 'APP_STORE_CONNECT_ISSUER_ID';
export type MobileDeploymentEnvKeyName = string;
export type MobileDeploymentSecretKind = 'env' | 'scalar';
export type InfrastructureJsonValue =
  | string
  | number
  | boolean
  | null
  | InfrastructureJsonValue[]
  | { [key: string]: InfrastructureJsonValue };

export interface SaveMobileDeploymentSecretPayload {
  kind: MobileDeploymentSecretKind;
  name: MobileDeploymentEnvKeyName | MobileDeploymentScalarName;
  previousName?: MobileDeploymentEnvKeyName;
  value: string;
}

export interface ClearMobileDeploymentSecretPayload {
  kind: MobileDeploymentSecretKind;
  name: MobileDeploymentEnvKeyName | MobileDeploymentScalarName;
}

export interface MobileDeploymentResourceStatus {
  configured: boolean;
  lastFour: string | null;
  name: string;
  plaintextSha256: string | null;
  size: number | null;
  updatedAt: string | null;
  validationErrors: string[];
  /**
   * Plaintext value for non-secret fields (public URLs, fixed identifiers,
   * feature flags, the Play track); `null` for secrets and files.
   */
  value: string | null;
}

export interface MobileDeploymentVersionStatus {
  activatedAt: string | null;
  createdAt: string;
  id: string;
  ready: boolean;
  readinessErrors: string[];
  status: 'active' | 'archived' | 'draft';
  version: number;
}

export interface MobileDeploymentTokenStatus {
  createdAt: string;
  expiresAt: string;
  id: string;
  lastFour: string;
  lastUsedAt: string | null;
  name: string;
  platforms: MobileDeploymentPlatform[];
  prefix: string;
  revokedAt: string | null;
}

export interface MobileDeploymentAuditEvent {
  actorType: 'ci' | 'user';
  createdAt: string;
  eventType: string;
  id: string;
  metadata: Record<string, InfrastructureJsonValue>;
  resourceKind: string | null;
}

export interface MobileDeploymentState {
  activeVersion: MobileDeploymentVersionStatus | null;
  auditEvents: MobileDeploymentAuditEvent[];
  draftVersion: MobileDeploymentVersionStatus | null;
  envKeys: MobileDeploymentResourceStatus[];
  fileArtifacts: MobileDeploymentResourceStatus[];
  scalarValues: MobileDeploymentResourceStatus[];
  tokens: MobileDeploymentTokenStatus[];
}

export interface IssueMobileDeploymentCiTokenPayload {
  expiresInDays?: number;
  name: string;
  platforms?: MobileDeploymentPlatform[];
}

export interface IssueMobileDeploymentCiTokenResponse {
  state: MobileDeploymentState;
  token: string;
}

export interface GitHubBotConfigurationStatus {
  appId: string;
  enabled: boolean;
  installationId: string;
  lastValidatedAt: string | null;
  lastValidationError: string | null;
  permissions: {
    checks: 'write';
  };
  privateKeyConfigured: boolean;
  privateKeyFingerprint: string;
  repository: {
    name: string;
    owner: string;
  };
  updatedAt: string;
}

export interface GitHubBotWatcherClientStatus {
  createdAt: string;
  expiresAt: string;
  id: string;
  lastFour: string;
  lastIssuedAt: string | null;
  lastUsedAt: string | null;
  name: string;
  prefix: string;
  revokedAt: string | null;
}

export interface GitHubBotAuditEvent {
  actorType: 'user' | 'watcher';
  createdAt: string;
  eventType: string;
  id: string;
  metadata: Record<string, InfrastructureJsonValue>;
}

export interface GitHubBotState {
  auditEvents: GitHubBotAuditEvent[];
  clients: GitHubBotWatcherClientStatus[];
  configuration: GitHubBotConfigurationStatus | null;
}

export interface SaveGitHubBotConfigurationPayload {
  appId: string;
  enabled: boolean;
  installationId: string;
  privateKey?: string;
  repositoryName: string;
  repositoryOwner: string;
}

export interface TestGitHubBotConfigurationResponse {
  state: GitHubBotState;
  validation: {
    ok: boolean;
    validatedAt: string;
  };
}

export interface IssueGitHubBotWatcherClientPayload {
  expiresInDays?: number;
  name: string;
}

export interface IssueGitHubBotWatcherClientResponse {
  state: GitHubBotState;
  token: string;
}

export interface EnableGitHubBotWatcherAutoPickupResponse {
  autoPickup: {
    clientId: string;
    expiresAt: string;
    queuedAt: string;
    tokenEndpointUrl: string;
  };
  state: GitHubBotState;
}

export interface ExternalAppRegistration {
  allowedScopes: string[];
  allowedWorkspaceIds: string[];
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
export type AiAgentZaloAccountMode = 'official' | 'personal';

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
  zaloAccountMode?: AiAgentZaloAccountMode;
  zaloOfficialAccountId?: string | null;
  zaloPersonalOwnId?: string | null;
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
  externalAppRefreshReplayGraceSeconds: number;
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

export type GatewayModelRow = {
  cache_read_price_per_token?: number | string | null;
  cache_write_price_per_token?: number | string | null;
  context_window: number | null;
  description: string | null;
  id: string;
  image_gen_price?: number | string | null;
  input_price_per_token?: number | string | null;
  input_tiers?: Json | null;
  is_enabled: boolean | null;
  max_tokens?: number | null;
  name: string;
  output_price_per_token?: number | string | null;
  output_tiers?: Json | null;
  pricing_raw?: Json | null;
  provider: string;
  released_at?: string | null;
  search_price?: number | string | null;
  synced_at?: string | null;
  tags: string[] | null;
  type?: string | null;
  web_search_price?: number | string | null;
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

export interface GatewayModelRowsPage {
  data: GatewayModelRow[];
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
  allowedWorkspaceIds?: string[];
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

export interface ApproveExternalAppManagedCronPayload {
  origin: string;
}

export interface ApproveExternalAppManagedCronResponse {
  domain: string;
  enabled: boolean;
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
    zaloAccountMode?: AiAgentZaloAccountMode;
    zaloOfficialAccountId?: string | null;
    zaloPersonalOwnId?: string | null;
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

export type ChatIntegrationKind = 'discord' | 'zalo-official' | 'zalo-personal';

export interface CreateChatIntegrationPayload {
  displayName?: string;
  kind: ChatIntegrationKind;
}

export interface CreateChatIntegrationResponse {
  agent: AiAgentDefinition;
  channel: AiAgentChannelConfig;
  conversationId: string;
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

export interface AiAgentZaloPersonalStatus {
  channelId: string;
  connected: boolean;
  enabled: boolean;
  lastError: string | null;
  lastEventAt: string | null;
  mode: AiAgentZaloAccountMode;
  ownId: string | null;
  running: boolean;
  startedAt: string | null;
}

export interface AiAgentZaloPersonalStatusResponse {
  phoneSyncJob?: AiAgentZaloPersonalPhoneSyncJobSnapshot | null;
  status: AiAgentZaloPersonalStatus;
}

export interface AiAgentZaloPersonalHistorySyncResult {
  exhausted: boolean;
  failedGroupHistories: number;
  groupMessages: number;
  groupsScanned: number;
  pageCount: number;
  synced: number;
  threads: number;
  timedOut: boolean;
  userMessages: number;
}

export type AiAgentZaloPersonalPhoneSyncStatus =
  | 'completed'
  | 'completed_no_payload'
  | 'failed'
  | 'partial'
  | 'waiting_for_phone';

export interface AiAgentZaloPersonalPhoneSyncResult {
  approvalRequested: boolean;
  cleaned: boolean;
  error: string | null;
  groupMessages: number;
  pullAttempts: number;
  requestAccepted: boolean;
  requestHttpError: string | null;
  requestViaHttp: boolean;
  requestViaWebSocket: boolean;
  status: AiAgentZaloPersonalPhoneSyncStatus;
  synced: number;
  threads: number;
  userMessages: number;
}

export interface AiAgentZaloPersonalPhoneSyncJobSnapshot {
  completedAt: string | null;
  error: string | null;
  startedAt: string;
  status: 'completed' | 'failed' | 'running';
  sync: AiAgentZaloPersonalPhoneSyncResult | null;
}

export type AiAgentZaloPersonalSyncResult =
  | AiAgentZaloPersonalHistorySyncResult
  | AiAgentZaloPersonalPhoneSyncResult;

export interface AiAgentZaloPersonalActionResponse {
  phoneSyncJob?: AiAgentZaloPersonalPhoneSyncJobSnapshot | null;
  status: AiAgentZaloPersonalStatus;
  sync?: AiAgentZaloPersonalSyncResult;
}

export type AiAgentZaloPersonalAction =
  | 'start'
  | 'stop'
  | 'sync-history'
  | 'sync-phone'
  | 'validate';

export type AiAgentZaloPersonalQrLoginStatus =
  | 'pending'
  | 'qr_generated'
  | 'scanned'
  | 'credentials_ready'
  | 'authenticated'
  | 'persisted'
  | 'expired'
  | 'declined'
  | 'aborted'
  | 'failed';

export interface AiAgentZaloPersonalQrScannedProfile {
  avatar: string | null;
  displayName: string | null;
}

export interface AiAgentZaloPersonalQrLoginSession {
  agentId: string;
  channelId: string;
  createdAt: string;
  error: string | null;
  expiresAt: string | null;
  mode: AiAgentZaloAccountMode;
  ownId: string | null;
  qrImageDataUrl: string | null;
  scannedProfile: AiAgentZaloPersonalQrScannedProfile | null;
  sessionId: string;
  status: AiAgentZaloPersonalQrLoginStatus;
  updatedAt: string;
}

export interface AiAgentZaloPersonalQrLoginResponse {
  session: AiAgentZaloPersonalQrLoginSession;
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
  | 'user_location'
  | 'workspace';

export type RateLimitMode =
  | 'absolute'
  | 'blocked'
  | 'inherit_multiplier'
  | 'unlimited';

/** Per-window absolute rate limits for limit_mode='absolute' rules. */
export interface RateLimitWindowLimits {
  day?: number;
  hour?: number;
  minute?: number;
}

export interface RateLimitAbsoluteLimits {
  read?: RateLimitWindowLimits;
  write?: RateLimitWindowLimits;
}

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
  limit_mode: RateLimitMode;
  absolute_limits: RateLimitAbsoluteLimits | null;
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

export interface BlueGreenDeploymentRevertRequest {
  commitHash: string;
  commitShortHash: string | null;
  commitSubject: string | null;
  deploymentStamp: string | null;
  imageTag: string | null;
  instant: boolean;
  kind: 'deployment-revert';
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
  dockerProbeTimeoutMs: number;
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

export type CronRunnerRecoveryAction = 'ensure' | 'restart';

export interface CronRunnerRecoveryRequest {
  action: CronRunnerRecoveryAction;
  attemptCount: number;
  kind: 'cron-runner-recovery';
  lastAttemptAt: number | null;
  lastError: string | null;
  reason: string;
  requestedAt: string;
  requestedBy: string;
  requestedByEmail: string | null;
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
  runnerRecoveryRequest: CronRunnerRecoveryRequest | null;
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
    deploymentRevertRequest: BlueGreenDeploymentRevertRequest | null;
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

export interface RequestBlueGreenDeploymentRevertPayload {
  commitHash: string;
  imageTag?: string | null;
  instant?: boolean;
}

export interface RequestBlueGreenDeploymentRevertResponse {
  message: string;
  request: BlueGreenDeploymentRevertRequest;
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

export interface RequestCronRunnerRecoveryPayload {
  action: CronRunnerRecoveryAction;
  reason?: string;
}

export interface RequestCronRunnerRecoveryResponse {
  message: string;
  request: CronRunnerRecoveryRequest;
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
  userEmail: string | null;
  userId: string | null;
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
  users: ObservabilityLogFacet[];
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
  userEmail: string | null;
  userId: string | null;
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
  userEmail: string | null;
  userId: string | null;
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
  user?: string;
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

export type InfrastructureStressTestStatus =
  | 'aborted'
  | 'completed'
  | 'failed'
  | 'queued'
  | 'running';

export type InfrastructureStressTestProfileId =
  | 'smoke'
  | 'spike'
  | 'steady'
  | 'ramp';

export interface InfrastructureStressTestTarget {
  baseUrl: string;
  defaultPath: string;
  description: string | null;
  id: string;
  label: string;
}

export interface InfrastructureStressTestProfile {
  concurrency: number;
  durationSeconds: number;
  id: InfrastructureStressTestProfileId;
  label: string;
  maxRequestsPerSecond: number;
  rampSeconds: number;
}

export interface InfrastructureStressTestSummary {
  averageRequestsPerSecond: number | null;
  capacityJudgement: string | null;
  errorRate: number | null;
  estimatedSteadyUsers: number | null;
  failureMode: string | null;
  peakRequestsPerSecond: number | null;
  safeRequestsPerSecond: number | null;
  saturationPoint: string | null;
  totalRequests: number;
  latency: {
    p50Ms: number | null;
    p95Ms: number | null;
    p99Ms: number | null;
  };
}

export interface InfrastructureStressTestResourceSpike {
  baseline: number | null;
  delta: number | null;
  metric: 'cpu' | 'memory' | 'rx' | 'tx';
  peak: number | null;
  recoveryMs: number | null;
  timeToPeakMs: number | null;
  unit: 'bytes' | 'percent';
}

export interface InfrastructureStressTestSample {
  activeRequests: number;
  cpuPercent: number | null;
  errorRate: number | null;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  latencyP99Ms: number | null;
  memoryBytes: number | null;
  requestsPerSecond: number;
  rxBytes: number | null;
  sampledAt: number;
  statusCodes: Record<string, number>;
  txBytes: number | null;
  virtualUsers: number;
}

export interface InfrastructureStressTestRun {
  abortReason: string | null;
  abortRequestedAt: number | null;
  createdAt: number;
  endedAt: number | null;
  errorMessage: string | null;
  id: string;
  profile: InfrastructureStressTestProfile;
  queuedAt: number;
  requestedBy: string | null;
  requestedByEmail: string | null;
  resourceSpikes: InfrastructureStressTestResourceSpike[];
  resultNotes: string | null;
  samples: InfrastructureStressTestSample[];
  startedAt: number | null;
  status: InfrastructureStressTestStatus;
  summary: InfrastructureStressTestSummary;
  target: InfrastructureStressTestTarget;
  updatedAt: number;
}

export interface InfrastructureStressTestSnapshot {
  activeRun: InfrastructureStressTestRun | null;
  canManage: boolean;
  profiles: InfrastructureStressTestProfile[];
  recentRuns: InfrastructureStressTestRun[];
  targets: InfrastructureStressTestTarget[];
}

export interface QueueInfrastructureStressTestPayload {
  concurrency?: number;
  durationSeconds?: number;
  maxRequestsPerSecond?: number;
  path?: string;
  profileId: InfrastructureStressTestProfileId;
  rampSeconds?: number;
  targetId: string;
}

export interface QueueInfrastructureStressTestResponse {
  message: string;
  run: InfrastructureStressTestRun;
}

export interface AbortInfrastructureStressTestPayload {
  reason?: string;
}

export interface AbortInfrastructureStressTestResponse {
  message: string;
  run: InfrastructureStressTestRun;
}
