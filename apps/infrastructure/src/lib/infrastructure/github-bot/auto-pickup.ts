import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import {
  createGitHubBotWatcherClientRecord,
  revokeGitHubBotWatcherClientById,
} from './clients';
import {
  type AdminClient,
  DEFAULT_AUTO_PICKUP_EXPIRES_IN_DAYS,
  DOCKER_WEB_CONTROL_ENV_KEY,
  type FsLike,
  GITHUB_BOT_AUTO_PICKUP_CLIENT_NAME,
  GITHUB_BOT_CONFIG_ID,
  GITHUB_BOT_RUNTIME_REQUEST_FILE,
  GITHUB_BOT_RUNTIME_REQUEST_KIND,
  type GitHubBotAutoPickupStatus,
  type GitHubBotState,
  GitHubBotStoreError,
} from './shared';
import {
  assertNoError,
  listGitHubBotState,
  nowIso,
  privateDb,
  recordAudit,
  requireConfiguration,
} from './state';

function resolveGitHubBotControlDir(fsImpl: FsLike = fs) {
  const configuredDir = process.env[DOCKER_WEB_CONTROL_ENV_KEY]?.trim();
  const candidates = [
    configuredDir,
    path.resolve(process.cwd(), 'tmp', 'docker-web', 'watch', 'control'),
    path.resolve(process.cwd(), '..', 'tmp', 'docker-web', 'watch', 'control'),
    path.resolve(
      process.cwd(),
      '..',
      '..',
      'tmp',
      'docker-web',
      'watch',
      'control'
    ),
  ].filter((value): value is string => Boolean(value));
  const existing = candidates.find((candidate) => fsImpl.existsSync(candidate));

  return (
    existing ??
    candidates[0] ??
    path.resolve('tmp', 'docker-web', 'watch', 'control')
  );
}

function normalizeTokenEndpointUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('Invalid token endpoint URL protocol');
    }

    return url.toString();
  } catch {
    throw new GitHubBotStoreError(
      'GitHub bot token endpoint URL is invalid',
      400,
      'invalid_token_endpoint_url'
    );
  }
}

function writeGitHubBotRuntimeRequest(
  {
    clientId,
    clientToken,
    createdAt,
    expiresAt,
    repository,
    tokenEndpointUrl,
  }: {
    clientId: string;
    clientToken: string;
    createdAt: string;
    expiresAt: string;
    repository: {
      name: string;
      owner: string;
    };
    tokenEndpointUrl: string;
  },
  { fsImpl = fs }: { fsImpl?: FsLike } = {}
) {
  const queuedAt = nowIso();
  const controlDir = resolveGitHubBotControlDir(fsImpl);
  const filePath = path.join(
    /* turbopackIgnore: true */ controlDir,
    GITHUB_BOT_RUNTIME_REQUEST_FILE
  );

  fsImpl.mkdirSync(controlDir, { recursive: true });
  fsImpl.writeFileSync(
    filePath,
    JSON.stringify(
      {
        clientId,
        clientToken,
        createdAt,
        expiresAt,
        kind: GITHUB_BOT_RUNTIME_REQUEST_KIND,
        repository,
        tokenUrl: tokenEndpointUrl,
        updatedAt: queuedAt,
      },
      null,
      2
    ),
    {
      encoding: 'utf8',
      mode: 0o600,
    }
  );

  return queuedAt;
}

async function revokeAutoPickupClients({
  db,
  userId,
}: {
  db: AdminClient;
  userId: string;
}) {
  const { error } = await privateDb(db)
    .from('github_bot_watcher_clients')
    .update({ revoked_at: nowIso(), revoked_by: userId })
    .eq('configuration_id', GITHUB_BOT_CONFIG_ID)
    .eq('name', GITHUB_BOT_AUTO_PICKUP_CLIENT_NAME)
    .is('revoked_at', null);

  assertNoError(error, 'Failed to rotate GitHub bot auto-pickup token');
}

export async function enableGitHubBotWatcherAutoPickup({
  db,
  fsImpl = fs,
  tokenEndpointUrl,
  userId,
}: {
  db: AdminClient;
  fsImpl?: FsLike;
  tokenEndpointUrl: string;
  userId: string;
}): Promise<{
  autoPickup: GitHubBotAutoPickupStatus;
  state: GitHubBotState;
}> {
  const configuration = await requireConfiguration(db);
  const normalizedTokenEndpointUrl =
    normalizeTokenEndpointUrl(tokenEndpointUrl);

  await revokeAutoPickupClients({ db, userId });

  const { client, expiresAt, token } = await createGitHubBotWatcherClientRecord(
    {
      db,
      expiresInDays: DEFAULT_AUTO_PICKUP_EXPIRES_IN_DAYS,
      name: GITHUB_BOT_AUTO_PICKUP_CLIENT_NAME,
      userId,
    }
  );

  let queuedAt: string;
  try {
    queuedAt = writeGitHubBotRuntimeRequest(
      {
        clientId: client.id,
        clientToken: token,
        createdAt: client.created_at,
        expiresAt,
        repository: {
          name: configuration.repository_name,
          owner: configuration.repository_owner,
        },
        tokenEndpointUrl: normalizedTokenEndpointUrl,
      },
      { fsImpl }
    );
  } catch {
    await revokeGitHubBotWatcherClientById({
      clientId: client.id,
      db,
      userId,
    });
    await recordAudit(db, {
      actorType: 'user',
      actorUserId: userId,
      clientId: client.id,
      eventType: 'auto_pickup.queue_failed',
      metadata: { reason: 'control_write_failed' },
    });
    throw new GitHubBotStoreError(
      'Failed to queue watcher auto-pickup credential',
      500,
      'auto_pickup_queue_failed'
    );
  }

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: userId,
    clientId: client.id,
    eventType: 'auto_pickup.queued',
    metadata: {
      clientId: client.id,
      expiresAt,
      queuedAt,
      repository: `${configuration.repository_owner}/${configuration.repository_name}`,
    },
  });

  return {
    autoPickup: {
      clientId: client.id,
      expiresAt,
      queuedAt,
      tokenEndpointUrl: normalizedTokenEndpointUrl,
    },
    state: await listGitHubBotState(db),
  };
}
