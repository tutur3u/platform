import 'server-only';

import { randomBytes } from 'node:crypto';
import { hashApiKey, validateApiKeyHash } from '@tuturuuu/auth/api-keys';
import { redactLastFour } from '@/lib/mobile-deployment/crypto';
import {
  type AdminClient,
  DEFAULT_TOKEN_NAME,
  GITHUB_BOT_CONFIG_ID,
  GITHUB_BOT_REQUIRED_PERMISSIONS,
  GITHUB_BOT_TOKEN_LOOKUP_LENGTH,
  GITHUB_BOT_TOKEN_PREFIX,
  type GitHubBotInstallationTokenResponse,
  GitHubBotStoreError,
  type GitHubBotWatcherClientRow,
} from './shared';
import {
  assertNoError,
  listGitHubBotState,
  mintInstallationToken,
  nowIso,
  privateDb,
  recordAudit,
  requireConfiguration,
} from './state';

export async function createGitHubBotWatcherClientRecord({
  db,
  expiresInDays,
  name,
  userId,
}: {
  db: AdminClient;
  expiresInDays: number;
  name: string;
  userId: string;
}) {
  const token = `${GITHUB_BOT_TOKEN_PREFIX}${randomBytes(32).toString(
    'base64url'
  )}`;
  const tokenPrefix = token.slice(0, GITHUB_BOT_TOKEN_LOOKUP_LENGTH);
  const expiresAt = new Date(
    Date.now() + Math.max(1, Math.min(expiresInDays, 365)) * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await privateDb(db)
    .from('github_bot_watcher_clients')
    .insert({
      configuration_id: GITHUB_BOT_CONFIG_ID,
      created_by: userId,
      expires_at: expiresAt,
      last_four: redactLastFour(token),
      name: name.trim().slice(0, 120) || DEFAULT_TOKEN_NAME,
      token_hash: await hashApiKey(token),
      token_prefix: tokenPrefix,
    })
    .select('*')
    .single();

  assertNoError(error, 'Failed to issue GitHub bot watcher token');

  return {
    client: data as GitHubBotWatcherClientRow,
    expiresAt,
    token,
  };
}

export async function issueGitHubBotWatcherClient({
  db,
  expiresInDays,
  name,
  userId,
}: {
  db: AdminClient;
  expiresInDays: number;
  name: string;
  userId: string;
}) {
  await requireConfiguration(db);

  const { client, expiresAt, token } = await createGitHubBotWatcherClientRecord(
    {
      db,
      expiresInDays,
      name,
      userId,
    }
  );

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: userId,
    clientId: client.id,
    eventType: 'client.issued',
    metadata: {
      clientId: client.id,
      expiresAt,
    },
  });

  return {
    state: await listGitHubBotState(db),
    token,
  };
}

export async function revokeGitHubBotWatcherClientById({
  clientId,
  db,
  userId,
}: {
  clientId: string;
  db: AdminClient;
  userId: string;
}) {
  const { error } = await privateDb(db)
    .from('github_bot_watcher_clients')
    .update({ revoked_at: nowIso(), revoked_by: userId })
    .eq('configuration_id', GITHUB_BOT_CONFIG_ID)
    .eq('id', clientId);

  assertNoError(error, 'Failed to revoke GitHub bot watcher token');
}

export async function revokeGitHubBotWatcherClient({
  clientId,
  db,
  userId,
}: {
  clientId: string;
  db: AdminClient;
  userId: string;
}) {
  await requireConfiguration(db);

  await revokeGitHubBotWatcherClientById({ clientId, db, userId });

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: userId,
    clientId,
    eventType: 'client.revoked',
    metadata: { clientId },
  });

  return listGitHubBotState(db);
}

async function validateWatcherClient({
  db,
  token,
}: {
  db: AdminClient;
  token: string;
}) {
  if (!token.startsWith(GITHUB_BOT_TOKEN_PREFIX)) {
    throw new GitHubBotStoreError('Unauthorized', 401, 'invalid_token');
  }

  const tokenPrefix = token.slice(0, GITHUB_BOT_TOKEN_LOOKUP_LENGTH);
  const { data, error } = await privateDb(db)
    .from('github_bot_watcher_clients')
    .select('*')
    .eq('configuration_id', GITHUB_BOT_CONFIG_ID)
    .eq('token_prefix', tokenPrefix)
    .is('revoked_at', null)
    .gt('expires_at', nowIso());

  assertNoError(error, 'Failed to validate GitHub bot watcher token');

  for (const row of (data ?? []) as GitHubBotWatcherClientRow[]) {
    if (await validateApiKeyHash(token, row.token_hash)) {
      return row;
    }
  }

  throw new GitHubBotStoreError('Unauthorized', 401, 'invalid_token');
}

export async function issueGitHubInstallationTokenForWatcher({
  db,
  watcherToken,
}: {
  db: AdminClient;
  watcherToken: string;
}): Promise<GitHubBotInstallationTokenResponse> {
  const configuration = await requireConfiguration(db);
  const client = await validateWatcherClient({ db, token: watcherToken });
  const installationToken = await mintInstallationToken(configuration);
  const issuedAt = nowIso();

  const { error } = await privateDb(db)
    .from('github_bot_watcher_clients')
    .update({
      last_issued_at: issuedAt,
      last_used_at: issuedAt,
    })
    .eq('id', client.id);

  assertNoError(error, 'Failed to update GitHub bot watcher token usage');

  await recordAudit(db, {
    actorType: 'watcher',
    clientId: client.id,
    eventType: 'installation_token.issued',
    metadata: {
      expiresAt: installationToken.expiresAt,
      repository: `${configuration.repository_owner}/${configuration.repository_name}`,
    },
  });

  return {
    expiresAt: installationToken.expiresAt,
    permissions: GITHUB_BOT_REQUIRED_PERMISSIONS,
    repository: {
      name: configuration.repository_name,
      owner: configuration.repository_owner,
    },
    token: installationToken.token,
  };
}
