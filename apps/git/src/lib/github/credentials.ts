import 'server-only';

import { createAppAuth } from '@octokit/auth-app';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  createEncryptedGitDataKey,
  decryptGitDataKey,
  decryptGitSecret,
  encryptGitSecret,
  gitSecretFingerprint,
} from './crypto';
import { GitHubMirrorError } from './errors';
import { privateDb } from './private-db';

export const GIT_APP_PERMISSIONS = {
  actions: 'read',
  checks: 'read',
  commit_statuses: 'read',
  contents: 'read',
  issues: 'read',
  metadata: 'read',
  pull_requests: 'read',
} as const;

type GitAppConfigurationRow = {
  app_id: string;
  data_key_ciphertext: string;
  enabled: boolean;
  installation_id: string;
  last_validated_at: string | null;
  last_validation_error: string | null;
  private_key_encrypted: string;
  private_key_fingerprint: string;
  updated_at: string;
};

export type GitAppConfigurationStatus = {
  appId: string;
  enabled: boolean;
  installationId: string;
  lastValidatedAt: string | null;
  lastValidationError: string | null;
  privateKeyConfigured: boolean;
  privateKeyFingerprint: string | null;
  updatedAt: string | null;
};

const tokenCache = new Map<number, { expiresAt: number; token: string }>();

export function normalizePrivateKey(value: string) {
  const normalized = value.trim().replace(/\\n/gu, '\n');

  if (
    !normalized.includes('BEGIN') ||
    !normalized.includes('PRIVATE KEY') ||
    !normalized.includes('END')
  ) {
    throw new GitHubMirrorError(
      'GitHub App private key is invalid',
      400,
      'invalid_private_key'
    );
  }

  return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
}

async function loadConfigurationRow() {
  const db = await createAdminClient({ noCookie: true });
  const { data, error } = await privateDb(db)
    .from('git_app_configurations')
    .select('*')
    .eq('id', 'primary')
    .maybeSingle();

  if (error) {
    return null;
  }

  return (data as GitAppConfigurationRow | null) ?? null;
}

export async function getGitAppConfigurationStatus(): Promise<GitAppConfigurationStatus> {
  const row = await loadConfigurationRow();

  return {
    appId: row?.app_id ?? '',
    enabled: row?.enabled ?? false,
    installationId: row?.installation_id ?? '',
    lastValidatedAt: row?.last_validated_at ?? null,
    lastValidationError: row?.last_validation_error ?? null,
    privateKeyConfigured: Boolean(row?.private_key_encrypted),
    privateKeyFingerprint: row?.private_key_fingerprint ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

export async function saveGitAppConfiguration({
  appId,
  enabled,
  installationId,
  privateKey,
  userId,
}: {
  appId: string;
  enabled: boolean;
  installationId: string;
  privateKey?: string;
  userId: string;
}) {
  if (!/^[0-9]+$/u.test(appId) || !/^[0-9]+$/u.test(installationId)) {
    throw new GitHubMirrorError(
      'GitHub App and installation IDs must be numeric',
      400,
      'invalid_configuration'
    );
  }

  const existing = await loadConfigurationRow();
  let dataKeyCiphertext = existing?.data_key_ciphertext;
  let encryptedPrivateKey = existing?.private_key_encrypted;
  let fingerprint = existing?.private_key_fingerprint;

  if (privateKey?.trim()) {
    const normalized = normalizePrivateKey(privateKey);
    const { dataKey, encryptedDataKey } = await createEncryptedGitDataKey();
    dataKeyCiphertext = encryptedDataKey;
    encryptedPrivateKey = encryptGitSecret(normalized, dataKey);
    fingerprint = gitSecretFingerprint(normalized);
  } else if (!existing) {
    throw new GitHubMirrorError(
      'A GitHub App private key is required',
      400,
      'private_key_required'
    );
  }

  const db = await createAdminClient({ noCookie: true });
  const { error } = await privateDb(db)
    .from('git_app_configurations')
    .upsert(
      {
        app_id: appId,
        created_by: existing ? undefined : userId,
        data_key_ciphertext: dataKeyCiphertext,
        enabled,
        id: 'primary',
        installation_id: installationId,
        last_validation_error: null,
        permissions: GIT_APP_PERMISSIONS,
        private_key_encrypted: encryptedPrivateKey,
        private_key_fingerprint: fingerprint,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      },
      { onConflict: 'id' }
    );

  if (error) {
    throw new GitHubMirrorError(
      'Failed to store GitHub App configuration',
      500,
      'configuration_write_failed'
    );
  }

  tokenCache.clear();
  return getGitAppConfigurationStatus();
}

export async function updateGitAppValidation({
  errorMessage,
  validatedAt,
}: {
  errorMessage: string | null;
  validatedAt: string | null;
}) {
  const db = await createAdminClient({ noCookie: true });
  const { error } = await privateDb(db)
    .from('git_app_configurations')
    .update({
      last_validated_at: validatedAt,
      last_validation_error: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 'primary');

  if (error) {
    throw new GitHubMirrorError(
      'Failed to update GitHub App validation state',
      500,
      'validation_write_failed'
    );
  }
}

async function decryptPrivateKey(row: GitAppConfigurationRow) {
  const dataKey = await decryptGitDataKey(row.data_key_ciphertext);
  return decryptGitSecret(row.private_key_encrypted, dataKey);
}

export async function getInstallationToken(repositoryId: number) {
  const cached = tokenCache.get(repositoryId);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const configuration = await loadConfigurationRow();
  if (!configuration?.enabled) {
    return null;
  }

  const auth = createAppAuth({
    appId: configuration.app_id,
    installationId: Number(configuration.installation_id),
    privateKey: await decryptPrivateKey(configuration),
  });
  const authentication = await auth({
    permissions: GIT_APP_PERMISSIONS,
    repositoryIds: [repositoryId],
    type: 'installation',
  });

  if (!('token' in authentication) || !authentication.token) {
    throw new GitHubMirrorError(
      'GitHub installation did not return a token',
      502,
      'installation_token_missing'
    );
  }

  tokenCache.set(repositoryId, {
    expiresAt: Date.parse(authentication.expiresAt),
    token: authentication.token,
  });
  return authentication.token;
}

export async function recordGitAuditEvent({
  eventType,
  metadata = {},
  repositoryId = null,
  userId,
}: {
  eventType: string;
  metadata?: Record<string, unknown>;
  repositoryId?: string | null;
  userId: string;
}) {
  const db = await createAdminClient({ noCookie: true });
  const { error } = await privateDb(db).from('git_audit_events').insert({
    actor_user_id: userId,
    event_type: eventType,
    metadata,
    repository_id: repositoryId,
  });

  if (error) {
    console.warn('Failed to record Git administration audit event');
  }
}
