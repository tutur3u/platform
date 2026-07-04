import 'server-only';

import { createAppAuth } from '@octokit/auth-app';
import {
  decryptDataKey,
  decryptSecretValue,
} from '@/lib/mobile-deployment/crypto';
import { sanitizeAuditMetadata } from './sanitize';
import {
  type AdminClient,
  GITHUB_BOT_CONFIG_ID,
  GITHUB_BOT_REQUIRED_PERMISSIONS,
  type GitHubBotAuditEventRow,
  type GitHubBotConfigRow,
  type GitHubBotState,
  GitHubBotStoreError,
  type GitHubBotWatcherClientRow,
  type GitHubBotWatcherClientStatus,
  type Json,
} from './shared';

export function privateDb(db: AdminClient) {
  return db.schema('private') as unknown as {
    from: (tableName: string) => any;
  };
}

export function nowIso() {
  return new Date().toISOString();
}

export function assertNoError(
  error: unknown,
  message: string
): asserts error is null {
  if (error) {
    throw new GitHubBotStoreError(message, 500);
  }
}

export function sanitizeIdentifier(value: string, label: string) {
  const normalized = value.trim();

  if (!/^[A-Za-z0-9_.-]{1,100}$/u.test(normalized)) {
    throw new GitHubBotStoreError(`${label} is invalid`, 400, 'invalid_input');
  }

  return normalized;
}

export function sanitizeNumericIdentifier(value: string, label: string) {
  const normalized = value.trim();

  if (!/^[0-9]+$/u.test(normalized)) {
    throw new GitHubBotStoreError(`${label} is invalid`, 400, 'invalid_input');
  }

  return normalized;
}

export function normalizePrivateKey(privateKey: string) {
  const normalized = privateKey.trim().replace(/\\n/g, '\n');

  if (
    !normalized.includes('BEGIN') ||
    !normalized.includes('PRIVATE KEY') ||
    !normalized.includes('END')
  ) {
    throw new GitHubBotStoreError(
      'GitHub App private key is invalid',
      400,
      'invalid_private_key'
    );
  }

  return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
}

function mapConfig(row: GitHubBotConfigRow) {
  return {
    appId: row.app_id,
    enabled: row.enabled,
    installationId: row.installation_id,
    lastValidatedAt: row.last_validated_at,
    lastValidationError: row.last_validation_error,
    permissions: GITHUB_BOT_REQUIRED_PERMISSIONS,
    privateKeyConfigured: Boolean(row.private_key_encrypted),
    privateKeyFingerprint: row.private_key_fingerprint,
    repository: {
      name: row.repository_name,
      owner: row.repository_owner,
    },
    updatedAt: row.updated_at,
  };
}

function mapClient(
  row: GitHubBotWatcherClientRow
): GitHubBotWatcherClientStatus {
  return {
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    id: row.id,
    lastFour: row.last_four,
    lastIssuedAt: row.last_issued_at,
    lastUsedAt: row.last_used_at,
    name: row.name,
    prefix: row.token_prefix,
    revokedAt: row.revoked_at,
  };
}

function mapAuditEvent(row: GitHubBotAuditEventRow) {
  return {
    actorType: row.actor_type,
    createdAt: row.created_at,
    eventType: row.event_type,
    id: row.id,
    metadata: sanitizeAuditMetadata(row.metadata ?? {}),
  };
}

export async function loadConfiguration(db: AdminClient) {
  const { data, error } = await privateDb(db)
    .from('github_bot_configurations')
    .select('*')
    .eq('id', GITHUB_BOT_CONFIG_ID)
    .maybeSingle();

  assertNoError(error, 'Failed to load GitHub bot configuration');
  return (data as GitHubBotConfigRow | null) ?? null;
}

export async function recordAudit(
  db: AdminClient,
  {
    actorType,
    actorUserId = null,
    clientId = null,
    eventType,
    metadata = {},
  }: {
    actorType: 'user' | 'watcher';
    actorUserId?: string | null;
    clientId?: string | null;
    eventType: string;
    metadata?: Json;
  }
) {
  const { error } = await privateDb(db).from('github_bot_audit_events').insert({
    actor_type: actorType,
    actor_user_id: actorUserId,
    client_id: clientId,
    configuration_id: GITHUB_BOT_CONFIG_ID,
    event_type: eventType,
    metadata,
  });

  if (error) {
    console.warn('Failed to record GitHub bot audit event');
  }
}

export async function requireConfiguration(db: AdminClient) {
  const configuration = await loadConfiguration(db);

  if (!configuration) {
    throw new GitHubBotStoreError(
      'GitHub bot is not configured',
      404,
      'not_configured'
    );
  }

  return configuration;
}

async function decryptPrivateKey(configuration: GitHubBotConfigRow) {
  const dataKey = await decryptDataKey(configuration.data_key_ciphertext);
  return decryptSecretValue(configuration.private_key_encrypted, dataKey);
}

export async function mintInstallationToken(configuration: GitHubBotConfigRow) {
  if (!configuration.enabled) {
    throw new GitHubBotStoreError(
      'GitHub bot is disabled',
      409,
      'github_bot_disabled'
    );
  }

  const privateKey = await decryptPrivateKey(configuration);
  const auth = createAppAuth({
    appId: configuration.app_id,
    installationId: Number(configuration.installation_id),
    privateKey,
  });

  const token = await auth({
    permissions: GITHUB_BOT_REQUIRED_PERMISSIONS,
    repositoryNames: [configuration.repository_name],
    type: 'installation',
  });

  if (!('token' in token) || !token.token) {
    throw new GitHubBotStoreError(
      'GitHub installation token was not returned',
      502,
      'github_token_missing'
    );
  }

  return {
    expiresAt: token.expiresAt,
    token: token.token,
  };
}

export async function listGitHubBotState(
  db: AdminClient
): Promise<GitHubBotState> {
  const configuration = await loadConfiguration(db);

  if (!configuration) {
    return {
      auditEvents: [],
      clients: [],
      configuration: null,
    };
  }

  const [clients, auditEvents] = await Promise.all([
    privateDb(db)
      .from('github_bot_watcher_clients')
      .select('*')
      .eq('configuration_id', GITHUB_BOT_CONFIG_ID)
      .order('created_at', { ascending: false })
      .limit(50),
    privateDb(db)
      .from('github_bot_audit_events')
      .select('actor_type,created_at,event_type,id,metadata')
      .eq('configuration_id', GITHUB_BOT_CONFIG_ID)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  assertNoError(clients.error, 'Failed to load GitHub bot watcher clients');
  assertNoError(auditEvents.error, 'Failed to load GitHub bot audit events');

  return {
    auditEvents: ((auditEvents.data ?? []) as GitHubBotAuditEventRow[]).map(
      mapAuditEvent
    ),
    clients: ((clients.data ?? []) as GitHubBotWatcherClientRow[]).map(
      mapClient
    ),
    configuration: mapConfig(configuration),
  };
}
