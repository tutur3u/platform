import { randomBytes } from 'node:crypto';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import {
  assertId,
  assertSecretName,
  buildAgentDefinitions,
  buildWebhookUrl,
  type ChannelMetaRecord,
  channelMetaKey,
  channelSecretKey,
  FIELD_VALUE_LIMIT,
  parseAgentRowName,
  stringifyField,
} from './registry-codec';
import {
  resolveAiAgentRedisUrl,
  resolveAiAgentWebhookOrigin,
} from './runtime-config';
import {
  AI_AGENT_REDIS_SECRET,
  AI_AGENT_REGISTRY_PREFIX,
  type AiAgentAdapter,
  type AiAgentChannelConfig,
  type AiAgentDeployResult,
} from './types';
import {
  getRootSecretValue,
  readSecretRows,
  replaceSecretRows,
} from './workspace-secret-store';

export async function listAiAgents({
  db,
  origin,
}: {
  db?: TypedSupabaseClient;
  origin?: string | null;
} = {}) {
  return buildAgentDefinitions(
    await readSecretRows({ db, prefix: AI_AGENT_REGISTRY_PREFIX }),
    resolveAiAgentWebhookOrigin({ requestOrigin: origin })
  );
}

export async function getAiAgentById({
  agentId,
  db,
  origin,
}: {
  agentId: string;
  db?: TypedSupabaseClient;
  origin?: string | null;
}) {
  const id = assertId(agentId, 'agent_id');
  return (
    (await listAiAgents({ db, origin })).find((agent) => agent.id === id) ??
    null
  );
}

export async function getAiAgentChannelById({
  adapter,
  channelId,
  db,
  origin,
}: {
  adapter?: AiAgentAdapter;
  channelId: string;
  db?: TypedSupabaseClient;
  origin?: string | null;
}) {
  const normalizedChannelId = assertId(channelId, 'channel_id');
  const agents = await listAiAgents({ db, origin });

  for (const agent of agents) {
    const channel = agent.channels.find(
      (candidate) =>
        candidate.id === normalizedChannelId &&
        (!adapter || candidate.adapter === adapter)
    );

    if (channel) {
      return { agent, channel };
    }
  }

  return null;
}

async function updateChannelMeta({
  agentId,
  channel,
  db,
  meta,
}: {
  agentId: string;
  channel: AiAgentChannelConfig;
  db?: TypedSupabaseClient;
  meta: Partial<ChannelMetaRecord>;
}) {
  const current: ChannelMetaRecord = {
    adapter: channel.adapter,
    displayName: channel.displayName,
    enabled: channel.enabled,
    id: channel.id,
    lastDeployedAt: channel.lastDeployedAt,
    lastError: channel.lastError,
    lastEventAt: channel.lastEventAt,
    mentionRoleIds: channel.mentionRoleIds,
    status: channel.status,
    webhookUrl: channel.webhookUrl,
    workspaceId: channel.workspaceId,
    discordGuildId: channel.discordGuildId ?? null,
    zaloOfficialAccountId: channel.zaloOfficialAccountId ?? null,
  };

  await replaceSecretRows({
    db,
    names: [channelMetaKey(agentId, channel.id)],
    rows: [
      {
        name: channelMetaKey(agentId, channel.id),
        value: stringifyField({ ...current, ...meta }),
      },
    ],
  });
}

export async function deployAiAgentChannel({
  agentId,
  channelId,
  db,
  origin,
}: {
  agentId: string;
  channelId: string;
  db?: TypedSupabaseClient;
  origin?: string | null;
}): Promise<AiAgentDeployResult> {
  const webhookOrigin = resolveAiAgentWebhookOrigin({ requestOrigin: origin });
  const agent = await getAiAgentById({ agentId, db, origin: webhookOrigin });
  const channel = agent?.channels.find(
    (candidate) => candidate.id === assertId(channelId, 'channel_id')
  );

  if (!agent || !channel) {
    throw new Error('agent_channel_not_found');
  }

  const missing = channel.secrets
    .filter((secret) => !secret.configured)
    .map((secret) => secret.name);
  const redisConfigured = resolveAiAgentRedisUrl({
    rootSecret: await getRootSecretValue(AI_AGENT_REDIS_SECRET, db),
  });
  if (!DEV_MODE && !redisConfigured) {
    missing.push(AI_AGENT_REDIS_SECRET);
  }

  const webhookUrl = buildWebhookUrl({
    adapter: channel.adapter,
    channelId: channel.id,
    origin: webhookOrigin,
  });
  const ok = missing.length === 0;
  await updateChannelMeta({
    agentId: agent.id,
    channel,
    db,
    meta: {
      lastDeployedAt: ok ? new Date().toISOString() : channel.lastDeployedAt,
      lastError: ok ? null : `Missing ${missing.join(', ')}`,
      status: ok ? 'deployed' : 'error',
      webhookUrl,
    },
  });

  const updated = await getAiAgentById({
    agentId,
    db,
    origin: webhookOrigin,
  });
  const updatedChannel =
    updated?.channels.find((candidate) => candidate.id === channel.id) ??
    channel;

  return {
    agent: updated ?? agent,
    channel: updatedChannel,
    missing,
    ok,
    webhookUrl,
  };
}

export async function pauseAiAgentChannel({
  agentId,
  channelId,
  db,
  origin,
}: {
  agentId: string;
  channelId: string;
  db?: TypedSupabaseClient;
  origin?: string | null;
}) {
  const agent = await getAiAgentById({ agentId, db, origin });
  const channel = agent?.channels.find(
    (candidate) => candidate.id === assertId(channelId, 'channel_id')
  );

  if (!agent || !channel) {
    throw new Error('agent_channel_not_found');
  }

  await updateChannelMeta({
    agentId: agent.id,
    channel,
    db,
    meta: { status: 'paused' },
  });

  return getAiAgentById({ agentId, db, origin });
}

export async function markAiAgentChannelEvent({
  agentId,
  channelId,
  db,
  error,
}: {
  agentId: string;
  channelId: string;
  db?: TypedSupabaseClient;
  error?: string | null;
}) {
  const agent = await getAiAgentById({ agentId, db });
  const channel = agent?.channels.find(
    (candidate) => candidate.id === assertId(channelId, 'channel_id')
  );

  if (!agent || !channel) {
    return;
  }

  await updateChannelMeta({
    agentId: agent.id,
    channel,
    db,
    meta: {
      lastError: error ?? null,
      lastEventAt: new Date().toISOString(),
    },
  });
}

export async function rotateAiAgentChannelSecret({
  agentId,
  channelId,
  db,
  secretName,
  value,
}: {
  agentId: string;
  channelId: string;
  db?: TypedSupabaseClient;
  secretName: string;
  value?: string | null;
}) {
  const normalizedAgentId = assertId(agentId, 'agent_id');
  const normalizedChannelId = assertId(channelId, 'channel_id');
  const normalizedSecret = assertSecretName(secretName);
  const secretValue = value?.trim() || randomBytes(24).toString('base64url');

  if (secretValue.length > FIELD_VALUE_LIMIT) {
    throw new Error('secret_value_too_large');
  }

  await replaceSecretRows({
    db,
    names: [
      channelSecretKey(
        normalizedAgentId,
        normalizedChannelId,
        normalizedSecret
      ),
    ],
    rows: [
      {
        name: channelSecretKey(
          normalizedAgentId,
          normalizedChannelId,
          normalizedSecret
        ),
        value: secretValue,
      },
    ],
  });

  return {
    lastFour: secretValue.slice(-4),
    name: normalizedSecret,
    value: secretValue,
  };
}

export async function getChannelSecretValues({
  agentId,
  channelId,
  db,
}: {
  agentId: string;
  channelId: string;
  db?: TypedSupabaseClient;
}) {
  const rows = await readSecretRows({
    db,
    prefix: `${AI_AGENT_REGISTRY_PREFIX}:${assertId(
      agentId,
      'agent_id'
    )}:channel:${assertId(channelId, 'channel_id')}:secret`,
  });

  return Object.fromEntries(
    rows.flatMap((row) => {
      const parsed = parseAgentRowName(row.name);
      return parsed?.field === 'channelSecret' && row.value
        ? [[parsed.secret, row.value]]
        : [];
    })
  );
}
