import 'server-only';

import {
  createEncryptedDataKey,
  encryptSecretValue,
  sha256Hex,
} from '@/lib/mobile-deployment/crypto';
import { sanitizeGitHubError } from './sanitize';
import {
  type AdminClient,
  GITHUB_API_VERSION,
  GITHUB_BOT_CONFIG_ID,
  GITHUB_BOT_REQUIRED_PERMISSIONS,
  type GitHubBotConfigRow,
  type GitHubBotSavePayload,
  GitHubBotStoreError,
} from './shared';
import {
  assertNoError,
  listGitHubBotState,
  loadConfiguration,
  mintInstallationToken,
  normalizePrivateKey,
  nowIso,
  privateDb,
  recordAudit,
  requireConfiguration,
  sanitizeIdentifier,
  sanitizeNumericIdentifier,
} from './state';

async function assertRepositoryReadable({
  configuration,
  token,
}: {
  configuration: GitHubBotConfigRow;
  token: string;
}) {
  const url = new URL(
    `https://api.github.com/repos/${encodeURIComponent(
      configuration.repository_owner
    )}/${encodeURIComponent(configuration.repository_name)}`
  );
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    },
  });

  if (!response.ok) {
    throw new GitHubBotStoreError(
      `GitHub repository validation failed with status ${response.status}`,
      502,
      'github_repository_validation_failed'
    );
  }
}

async function persistValidationResult({
  db,
  error,
  validatedAt,
}: {
  db: AdminClient;
  error: string | null;
  validatedAt: string | null;
}) {
  const { error: updateError } = await privateDb(db)
    .from('github_bot_configurations')
    .update({
      last_validated_at: validatedAt,
      last_validation_error: error,
      updated_at: nowIso(),
    })
    .eq('id', GITHUB_BOT_CONFIG_ID);

  assertNoError(updateError, 'Failed to update GitHub bot validation status');
}

export async function saveGitHubBotConfiguration({
  db,
  payload,
  userId,
}: {
  db: AdminClient;
  payload: GitHubBotSavePayload;
  userId: string;
}) {
  const existing = await loadConfiguration(db);
  const appId = sanitizeNumericIdentifier(payload.appId, 'GitHub App ID');
  const installationId = sanitizeNumericIdentifier(
    payload.installationId,
    'GitHub installation ID'
  );
  const repositoryOwner = sanitizeIdentifier(
    payload.repositoryOwner,
    'Repository owner'
  );
  const repositoryName = sanitizeIdentifier(
    payload.repositoryName,
    'Repository name'
  );
  const rawPrivateKey = payload.privateKey?.trim();

  let dataKeyCiphertext = existing?.data_key_ciphertext;
  let encryptedPrivateKey = existing?.private_key_encrypted;
  let fingerprint = existing?.private_key_fingerprint;

  if (rawPrivateKey) {
    const normalizedPrivateKey = normalizePrivateKey(rawPrivateKey);
    const { dataKey, encryptedDataKey } = await createEncryptedDataKey();
    dataKeyCiphertext = encryptedDataKey;
    encryptedPrivateKey = encryptSecretValue(normalizedPrivateKey, dataKey);
    fingerprint = sha256Hex(normalizedPrivateKey);
  } else if (!existing) {
    throw new GitHubBotStoreError(
      'GitHub App private key is required',
      400,
      'private_key_required'
    );
  }

  const row = {
    app_id: appId,
    data_key_ciphertext: dataKeyCiphertext,
    enabled: payload.enabled,
    id: GITHUB_BOT_CONFIG_ID,
    installation_id: installationId,
    last_validation_error: null,
    permissions: GITHUB_BOT_REQUIRED_PERMISSIONS,
    private_key_encrypted: encryptedPrivateKey,
    private_key_fingerprint: fingerprint,
    repository_name: repositoryName,
    repository_owner: repositoryOwner,
    updated_at: nowIso(),
    updated_by: userId,
    ...(existing ? {} : { created_by: userId }),
  };

  const { error } = await privateDb(db)
    .from('github_bot_configurations')
    .upsert(row, { onConflict: 'id' });

  assertNoError(error, 'Failed to save GitHub bot configuration');

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: userId,
    eventType: 'configuration.saved',
    metadata: {
      enabled: payload.enabled,
      privateKeyUpdated: Boolean(rawPrivateKey),
      repository: `${repositoryOwner}/${repositoryName}`,
    },
  });

  return listGitHubBotState(db);
}

export async function testGitHubBotConfiguration({
  db,
  userId,
}: {
  db: AdminClient;
  userId: string;
}) {
  const configuration = await requireConfiguration(db);

  try {
    const installationToken = await mintInstallationToken(configuration);
    await assertRepositoryReadable({
      configuration,
      token: installationToken.token,
    });

    const validatedAt = nowIso();
    await persistValidationResult({
      db,
      error: null,
      validatedAt,
    });
    await recordAudit(db, {
      actorType: 'user',
      actorUserId: userId,
      eventType: 'configuration.validated',
      metadata: {
        repository: `${configuration.repository_owner}/${configuration.repository_name}`,
        validatedAt,
      },
    });

    return {
      state: await listGitHubBotState(db),
      validation: {
        ok: true,
        validatedAt,
      },
    };
  } catch (error) {
    const message = sanitizeGitHubError(error);
    await persistValidationResult({
      db,
      error: message,
      validatedAt: null,
    });
    await recordAudit(db, {
      actorType: 'user',
      actorUserId: userId,
      eventType: 'configuration.validation_failed',
      metadata: { reason: message },
    });

    throw new GitHubBotStoreError(message, 502, 'github_validation_failed');
  }
}
