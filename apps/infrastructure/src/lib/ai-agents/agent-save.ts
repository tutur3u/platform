import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { getAiAgentById } from './agent-registry';
import {
  type AgentMetaRecord,
  agentKey,
  assertId,
  buildWebhookUrl,
  type ChannelMetaRecord,
  channelMetaKey,
  channelSecretKey,
  DEFAULT_INSTRUCTIONS,
  DEFAULT_MODEL_ID,
  FIELD_VALUE_LIMIT,
  getRequiredSecrets,
  instructionChunkKey,
  normalizeAdapter,
  normalizeTools,
  normalizeZaloAccountMode,
  type SecretRow,
  splitLongValue,
  stringifyField,
} from './registry-codec';
import { resolveAiAgentWebhookOrigin } from './runtime-config';
import type {
  AiAgentChannelConfig,
  SaveAiAgentChannelInput,
  SaveAiAgentInput,
} from './types';
import { AI_AGENT_REGISTRY_PREFIX } from './types';
import { readSecretRows, replaceSecretRows } from './workspace-secret-store';

function normalizeChannelInput(
  channel: SaveAiAgentChannelInput,
  existing?: AiAgentChannelConfig
) {
  const adapter = normalizeAdapter(channel.adapter);
  const channelId = assertId(channel.id, 'channel_id');

  return {
    adapter,
    displayName:
      channel.displayName?.trim() || existing?.displayName || adapter,
    enabled: channel.enabled ?? existing?.enabled ?? true,
    id: channelId,
    lastDeployedAt: existing?.lastDeployedAt ?? null,
    lastError: existing?.lastError ?? null,
    lastEventAt: existing?.lastEventAt ?? null,
    mentionRoleIds: [
      ...new Set(channel.mentionRoleIds ?? existing?.mentionRoleIds ?? []),
    ],
    status: channel.status ?? existing?.status ?? 'draft',
    webhookUrl: existing?.webhookUrl ?? null,
    workspaceId: channel.workspaceId,
    autoRespond: channel.autoRespond ?? existing?.autoRespond ?? true,
    discordGuildId:
      channel.discordGuildId?.trim() || existing?.discordGuildId || null,
    externalChannelId:
      channel.externalChannelId?.trim() || existing?.externalChannelId || null,
    historySyncEnabled:
      channel.historySyncEnabled ?? existing?.historySyncEnabled ?? true,
    zaloAccountMode:
      adapter === 'zalo'
        ? normalizeZaloAccountMode(channel.zaloAccountMode)
        : undefined,
    zaloOfficialAccountId:
      channel.zaloOfficialAccountId?.trim() ||
      existing?.zaloOfficialAccountId ||
      null,
    zaloPersonalOwnId:
      channel.zaloPersonalOwnId?.trim() || existing?.zaloPersonalOwnId || null,
  } satisfies ChannelMetaRecord;
}

export async function saveAiAgent({
  actorUserId,
  db,
  origin,
  payload,
}: {
  actorUserId: string;
  db?: TypedSupabaseClient;
  origin?: string | null;
  payload: SaveAiAgentInput;
}) {
  const agentId = assertId(payload.id, 'agent_id');
  const now = new Date().toISOString();
  const webhookOrigin = resolveAiAgentWebhookOrigin({ requestOrigin: origin });
  const existing = await getAiAgentById({ agentId, db, origin });
  const existingChannelMap = new Map(
    existing?.channels.map((channel) => [channel.id, channel]) ?? []
  );
  const existingRows = await readSecretRows({
    db,
    prefix: `${AI_AGENT_REGISTRY_PREFIX}:${agentId}`,
  });
  const existingNames = existingRows.map((row) => row.name);

  const meta: AgentMetaRecord = {
    createdAt: existing?.createdAt ?? now,
    enabled: payload.enabled ?? existing?.enabled ?? true,
    id: agentId,
    modelId: payload.modelId?.trim() || existing?.modelId || DEFAULT_MODEL_ID,
    name: payload.name.trim(),
    temperature: payload.temperature ?? existing?.temperature ?? null,
    tools: normalizeTools(payload.tools ?? existing?.tools),
    updatedAt: now,
  };

  const rows: SecretRow[] = [
    {
      name: agentKey(agentId, 'meta'),
      value: stringifyField({ ...meta, updatedBy: actorUserId }),
    },
  ];

  const instructionChunks = splitLongValue(
    payload.instructions ?? existing?.instructions ?? DEFAULT_INSTRUCTIONS
  );
  if (instructionChunks.length === 1) {
    rows.push({
      name: agentKey(agentId, 'instructions'),
      value: instructionChunks[0] ?? '',
    });
  } else {
    rows.push(
      ...instructionChunks.map((value, index) => ({
        name: instructionChunkKey(agentId, index),
        value,
      }))
    );
  }

  const inputChannelMap = new Map(
    payload.channels?.map((channel) => [
      assertId(channel.id, 'channel_id'),
      channel,
    ]) ?? []
  );
  const channels =
    payload.channels?.map((channel) =>
      normalizeChannelInput(
        channel,
        existingChannelMap.get(assertId(channel.id, 'channel_id'))
      )
    ) ??
    existing?.channels.map((channel) => ({
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
      autoRespond: channel.autoRespond ?? true,
      discordGuildId: channel.discordGuildId ?? null,
      externalChannelId: channel.externalChannelId ?? null,
      historySyncEnabled: channel.historySyncEnabled ?? true,
      zaloAccountMode: channel.zaloAccountMode ?? 'official',
      zaloOfficialAccountId: channel.zaloOfficialAccountId ?? null,
      zaloPersonalOwnId: channel.zaloPersonalOwnId ?? null,
    })) ??
    [];

  for (const channel of channels) {
    rows.push({
      name: channelMetaKey(agentId, channel.id),
      value: stringifyField({
        ...channel,
        webhookUrl: buildWebhookUrl({
          adapter: channel.adapter,
          channelId: channel.id,
          origin: webhookOrigin,
        }),
      }),
    });

    const input = inputChannelMap.get(channel.id);
    const prior = existingChannelMap.get(channel.id);
    const priorSecrets = new Map(
      prior?.secrets
        .filter((secret) => secret.configured)
        .map((secret) => [secret.name, null as string | null]) ?? []
    );
    const secretNames = new Set([
      ...getRequiredSecrets(
        channel.adapter,
        channel.adapter === 'zalo'
          ? normalizeZaloAccountMode(channel.zaloAccountMode)
          : 'official'
      ),
      ...Object.keys(input?.secrets ?? {}),
      ...priorSecrets.keys(),
    ]);

    for (const secretName of secretNames) {
      const submitted = input?.secrets?.[secretName];
      if (submitted === null) {
        continue;
      }

      if (submitted === undefined || submitted === '') {
        if (priorSecrets.has(secretName)) {
          const existingValue = existingRows.find(
            (row) =>
              row.name === channelSecretKey(agentId, channel.id, secretName)
          )?.value;
          if (existingValue) {
            rows.push({
              name: channelSecretKey(agentId, channel.id, secretName),
              value: existingValue,
            });
          }
        }
        continue;
      }

      if (submitted.length > FIELD_VALUE_LIMIT) {
        throw new Error('secret_value_too_large');
      }

      rows.push({
        name: channelSecretKey(agentId, channel.id, secretName),
        value: submitted,
      });
    }
  }

  await replaceSecretRows({ db, names: existingNames, rows });

  const saved = await getAiAgentById({ agentId, db, origin: webhookOrigin });
  if (!saved) {
    throw new Error('agent_save_failed');
  }

  return saved;
}
