import 'server-only';

import type { ZaloPersonalAdapter } from '@tuturuuu/ai/chat-sdk/zalo-personal';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  getAiAgentById,
  isAiAgentZaloPersonalEnabled,
  recordAiAgentZaloPersonalConnection,
} from './registry';
import { createAiAgentPersonalZaloRuntime } from './runtime';
import type {
  AiAgentChannelConfig,
  AiAgentDefinition,
  AiAgentZaloPersonalStatus,
} from './types';

type ListenerRecord = {
  adapter: ZaloPersonalAdapter;
  agent: AiAgentDefinition;
  channel: AiAgentChannelConfig;
};

type GlobalWithZaloPersonalListeners = typeof globalThis & {
  __tuturuuuAiAgentZaloPersonalListeners?: Map<string, ListenerRecord>;
};

type ResolvePersonalChannelResult = {
  agent: AiAgentDefinition;
  channel: AiAgentChannelConfig;
  enabled: boolean;
  record: ListenerRecord | null;
};

const listeners = getListenerMap();

export async function getAiAgentZaloPersonalStatus({
  agentId,
  channelId,
  db,
  origin,
}: {
  agentId: string;
  channelId: string;
  db?: TypedSupabaseClient;
  origin?: string | null;
}): Promise<AiAgentZaloPersonalStatus> {
  const resolved = await resolvePersonalChannel({
    agentId,
    channelId,
    db,
    origin,
  });

  return buildStatus(resolved);
}

export async function validateAiAgentZaloPersonalChannel({
  agentId,
  channelId,
  db,
  origin,
}: {
  agentId: string;
  channelId: string;
  db?: TypedSupabaseClient;
  origin?: string | null;
}): Promise<AiAgentZaloPersonalStatus> {
  const resolved = await resolvePersonalChannel({
    agentId,
    channelId,
    db,
    origin,
  });
  assertEnabled(resolved.enabled);

  const { adapter } = await createAiAgentPersonalZaloRuntime({
    agent: resolved.agent,
    channel: resolved.channel,
  });

  try {
    const status = await adapter.validateLogin();
    await recordAiAgentZaloPersonalConnection({
      agentId: resolved.agent.id,
      channelId: resolved.channel.id,
      db,
      ownId: status.ownId,
    });
    await adapter.disconnect?.();

    return buildStatus({
      ...resolved,
      channel: {
        ...resolved.channel,
        lastError: null,
        lastEventAt: new Date().toISOString(),
        zaloPersonalOwnId:
          status.ownId ?? resolved.channel.zaloPersonalOwnId ?? null,
      },
    });
  } catch (error) {
    await recordAiAgentZaloPersonalConnection({
      agentId: resolved.agent.id,
      channelId: resolved.channel.id,
      db,
      error: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);
    await adapter.disconnect?.().catch(() => undefined);
    throw error;
  }
}

export async function startAiAgentZaloPersonalListener({
  agentId,
  channelId,
  db,
  origin,
}: {
  agentId: string;
  channelId: string;
  db?: TypedSupabaseClient;
  origin?: string | null;
}): Promise<AiAgentZaloPersonalStatus> {
  const resolved = await resolvePersonalChannel({
    agentId,
    channelId,
    db,
    origin,
  });
  assertEnabled(resolved.enabled);

  if (resolved.record) {
    return buildStatus(resolved);
  }

  const { adapter } = await createAiAgentPersonalZaloRuntime({
    agent: resolved.agent,
    channel: resolved.channel,
  });

  try {
    const status = await adapter.startPersonalListener();
    const record = {
      adapter,
      agent: resolved.agent,
      channel: {
        ...resolved.channel,
        zaloPersonalOwnId:
          status.ownId ?? resolved.channel.zaloPersonalOwnId ?? null,
      },
    };
    listeners.set(listenerKey(agentId, channelId), record);
    await recordAiAgentZaloPersonalConnection({
      agentId: resolved.agent.id,
      channelId: resolved.channel.id,
      db,
      ownId: status.ownId,
    });

    return buildStatus({
      ...resolved,
      channel: record.channel,
      record,
    });
  } catch (error) {
    listeners.delete(listenerKey(agentId, channelId));
    await adapter.disconnect?.().catch(() => undefined);
    await recordAiAgentZaloPersonalConnection({
      agentId: resolved.agent.id,
      channelId: resolved.channel.id,
      db,
      error: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);
    throw error;
  }
}

export async function stopAiAgentZaloPersonalListener({
  agentId,
  channelId,
  db,
  origin,
}: {
  agentId: string;
  channelId: string;
  db?: TypedSupabaseClient;
  origin?: string | null;
}): Promise<AiAgentZaloPersonalStatus> {
  const resolved = await resolvePersonalChannel({
    agentId,
    channelId,
    db,
    origin,
  });
  const key = listenerKey(agentId, channelId);
  const record = listeners.get(key);

  if (record) {
    await record.adapter.stopPersonalListener();
    await record.adapter.disconnect?.();
    listeners.delete(key);
  }

  await recordAiAgentZaloPersonalConnection({
    agentId: resolved.agent.id,
    channelId: resolved.channel.id,
    db,
  }).catch(() => undefined);

  return buildStatus({
    ...resolved,
    record: null,
  });
}

function assertEnabled(enabled: boolean) {
  if (!enabled) {
    throw new Error('zalo_personal_feature_disabled');
  }
}

async function resolvePersonalChannel({
  agentId,
  channelId,
  db,
  origin,
}: {
  agentId: string;
  channelId: string;
  db?: TypedSupabaseClient;
  origin?: string | null;
}): Promise<ResolvePersonalChannelResult> {
  const [enabled, agent] = await Promise.all([
    isAiAgentZaloPersonalEnabled(db),
    getAiAgentById({ agentId, db, origin }),
  ]);
  const channel = agent?.channels.find(
    (candidate) => candidate.id === channelId
  );

  if (!agent || !channel) {
    throw new Error('agent_channel_not_found');
  }

  if (channel.adapter !== 'zalo' || channel.zaloAccountMode !== 'personal') {
    throw new Error('ai_agent_zalo_personal_channel_required');
  }

  return {
    agent,
    channel,
    enabled,
    record: listeners.get(listenerKey(agentId, channelId)) ?? null,
  };
}

function buildStatus({
  channel,
  enabled,
  record,
}: ResolvePersonalChannelResult): AiAgentZaloPersonalStatus {
  const listenerStatus = record?.adapter.getPersonalStatus();

  return {
    channelId: channel.id,
    connected: listenerStatus?.connected ?? false,
    enabled,
    lastError: listenerStatus?.lastError ?? channel.lastError,
    lastEventAt: listenerStatus?.lastEventAt ?? channel.lastEventAt,
    mode: 'personal',
    ownId: listenerStatus?.ownId ?? channel.zaloPersonalOwnId ?? null,
    running: listenerStatus?.running ?? false,
    startedAt: listenerStatus?.startedAt ?? null,
  };
}

function listenerKey(agentId: string, channelId: string) {
  return `${agentId}:${channelId}`;
}

function getListenerMap() {
  const scope = globalThis as GlobalWithZaloPersonalListeners;

  scope.__tuturuuuAiAgentZaloPersonalListeners ??= new Map<
    string,
    ListenerRecord
  >();

  return scope.__tuturuuuAiAgentZaloPersonalListeners;
}
