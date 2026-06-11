import 'server-only';

import type fs from 'node:fs';
import type { SupabaseClient } from '@tuturuuu/supabase/types';
import type { Database, Json } from '@tuturuuu/types';

export type { Json };

export type AdminClient = SupabaseClient<Database>;

export const GITHUB_BOT_CONFIG_ID = 'tuturuuu-ci';
export const GITHUB_BOT_REQUIRED_PERMISSIONS = { checks: 'write' } as const;
export const GITHUB_BOT_TOKEN_LOOKUP_LENGTH = 30;
export const GITHUB_BOT_TOKEN_PREFIX = 'ttr_github_bot_';
export const GITHUB_BOT_AUTO_PICKUP_CLIENT_NAME =
  'Blue/green watcher auto-pickup';

export const DEFAULT_TOKEN_NAME = 'Blue/green watcher';
export const DEFAULT_AUTO_PICKUP_EXPIRES_IN_DAYS = 90;
export const DOCKER_WEB_CONTROL_ENV_KEY = 'PLATFORM_BLUE_GREEN_CONTROL_DIR';
export const GITHUB_BOT_RUNTIME_REQUEST_FILE =
  'blue-green-github-bot-runtime.request.json';
export const GITHUB_BOT_RUNTIME_REQUEST_KIND =
  'tuturuuu-github-bot-runtime-credential';
export const GITHUB_API_VERSION = '2022-11-28';

export type GitHubBotConfigRow = {
  app_id: string;
  created_at: string;
  data_key_ciphertext: string;
  enabled: boolean;
  id: string;
  installation_id: string;
  last_validated_at: string | null;
  last_validation_error: string | null;
  permissions: Json;
  private_key_encrypted: string;
  private_key_fingerprint: string;
  repository_name: string;
  repository_owner: string;
  updated_at: string;
};

export type GitHubBotWatcherClientRow = {
  created_at: string;
  expires_at: string;
  id: string;
  last_four: string;
  last_issued_at: string | null;
  last_used_at: string | null;
  name: string;
  revoked_at: string | null;
  token_hash: string;
  token_prefix: string;
};

export type GitHubBotAuditEventRow = {
  actor_type: 'user' | 'watcher';
  created_at: string;
  event_type: string;
  id: string;
  metadata: Record<string, unknown>;
};

export type FsLike = Pick<
  typeof fs,
  'existsSync' | 'mkdirSync' | 'writeFileSync'
>;

export type GitHubBotConfigurationStatus = {
  appId: string;
  enabled: boolean;
  installationId: string;
  lastValidatedAt: string | null;
  lastValidationError: string | null;
  permissions: typeof GITHUB_BOT_REQUIRED_PERMISSIONS;
  privateKeyConfigured: boolean;
  privateKeyFingerprint: string;
  repository: {
    name: string;
    owner: string;
  };
  updatedAt: string;
};

export type GitHubBotWatcherClientStatus = {
  createdAt: string;
  expiresAt: string;
  id: string;
  lastFour: string;
  lastIssuedAt: string | null;
  lastUsedAt: string | null;
  name: string;
  prefix: string;
  revokedAt: string | null;
};

export type GitHubBotAuditEvent = {
  actorType: 'user' | 'watcher';
  createdAt: string;
  eventType: string;
  id: string;
  metadata: Record<string, unknown>;
};

export type GitHubBotState = {
  auditEvents: GitHubBotAuditEvent[];
  configuration: GitHubBotConfigurationStatus | null;
  clients: GitHubBotWatcherClientStatus[];
};

export type GitHubBotAutoPickupStatus = {
  clientId: string;
  expiresAt: string;
  queuedAt: string;
  tokenEndpointUrl: string;
};

export type GitHubBotSavePayload = {
  appId: string;
  enabled: boolean;
  installationId: string;
  privateKey?: string;
  repositoryName: string;
  repositoryOwner: string;
};

export type GitHubBotInstallationTokenResponse = {
  expiresAt: string;
  permissions: typeof GITHUB_BOT_REQUIRED_PERMISSIONS;
  repository: {
    name: string;
    owner: string;
  };
  token: string;
};

export class GitHubBotStoreError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code = 'github_bot_error'
  ) {
    super(message);
    this.name = 'GitHubBotStoreError';
  }
}
