import 'server-only';

import type { Chat } from '@tuturuuu/ai/chat-sdk';
import type {
  ZaloPersonalAdapter,
  ZaloPersonalHistorySyncOptions,
  ZaloPersonalPhoneSyncOptions,
  ZaloPersonalPhoneSyncStatus,
} from '@tuturuuu/ai/chat-sdk/zalo-personal';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  persistAiAgentExternalSdkMessage,
  persistAiAgentExternalSdkThread,
} from './external-chat-mirror';
import {
  getAiAgentById,
  getChannelSecretValues,
  isAiAgentZaloPersonalEnabled,
  recordAiAgentZaloPersonalConnection,
} from './registry';
import { createAiAgentPersonalZaloRuntime } from './runtime';
import type {
  AiAgentChannelConfig,
  AiAgentDefinition,
  AiAgentZaloPersonalStatus,
} from './types';
import { syncZaloPersonalWebHistory } from './zalo-personal-web-sync';

type ListenerRecord = {
  adapter: ZaloPersonalAdapter;
  agent: AiAgentDefinition;
  channel: AiAgentChannelConfig;
  chat: Chat;
};

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
  status: ZaloPersonalPhoneSyncStatus;
  synced: number;
  threads: number;
  userMessages: number;
}

type GlobalWithZaloPersonalListeners = typeof globalThis & {
  __tuturuuuAiAgentZaloPersonalListeners?: Map<string, ListenerRecord>;
};

type ResolvePersonalChannelResult = {
  agent: AiAgentDefinition;
  channel: AiAgentChannelConfig;
  enabled: boolean;
  record: ListenerRecord | null;
};

type SupabaseFilterBuilder = {
  eq(column: string, value: unknown): SupabaseFilterBuilder;
  like(
    column: string,
    pattern: string
  ): Promise<{ count: number | null; error: { message?: string } | null }>;
};

type PrivateExternalThreadDb = {
  from(table: 'ai_agent_external_threads'): {
    delete(options?: { count?: 'exact' }): SupabaseFilterBuilder;
  };
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
    await Promise.resolve(adapter.disconnect?.());

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
    await Promise.resolve(adapter.disconnect?.()).catch(() => undefined);
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

  const { adapter, chat } = await createAiAgentPersonalZaloRuntime({
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
      chat,
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

export async function syncAiAgentZaloPersonalHistory({
  agentId,
  channelId,
  db,
  options,
  origin,
}: {
  agentId: string;
  channelId: string;
  db?: TypedSupabaseClient;
  options?: ZaloPersonalHistorySyncOptions;
  origin?: string | null;
}): Promise<{
  status: AiAgentZaloPersonalStatus;
  sync: AiAgentZaloPersonalHistorySyncResult;
}> {
  const resolved = await resolvePersonalChannel({
    agentId,
    channelId,
    db,
    origin,
  });
  assertEnabled(resolved.enabled);

  const existingRecord = resolved.record;
  let runtime: ListenerRecord;

  await pruneLegacyZaloWebMirrorThreads({
    agentId: resolved.agent.id,
    channelId: resolved.channel.id,
    db,
  }).catch(() => undefined);

  if (existingRecord) {
    runtime = existingRecord;
  } else {
    const { adapter, chat } = await createAiAgentPersonalZaloRuntime({
      agent: resolved.agent,
      channel: resolved.channel,
    });

    runtime = {
      adapter,
      agent: resolved.agent,
      channel: resolved.channel,
      chat,
    };
  }

  try {
    const history = await runtime.adapter.syncPersonalHistory(options);
    const threadIds = new Set<string>();
    let synced = 0;

    for (const thread of history.threads) {
      await persistAiAgentExternalSdkThread({
        agent: runtime.agent,
        channel: runtime.channel,
        thread,
      });
      threadIds.add(thread.id);
    }

    for (const message of history.messages) {
      const thread = await runtime.adapter.fetchThread(message.threadId);
      await persistAiAgentExternalSdkMessage({
        agent: runtime.agent,
        channel: runtime.channel,
        direction: message.author.isMe ? 'outbound' : 'inbound',
        message,
        platformUserId: null,
        thread,
      });
      threadIds.add(message.threadId);
      synced += 1;
    }

    const status = runtime.adapter.getPersonalStatus();
    await recordAiAgentZaloPersonalConnection({
      agentId: resolved.agent.id,
      channelId: resolved.channel.id,
      db,
      error: status.lastError,
      ownId: status.ownId,
    });

    return {
      status: buildStatus({
        ...resolved,
        channel: {
          ...resolved.channel,
          lastError: status.lastError,
          lastEventAt: status.lastEventAt,
          zaloPersonalOwnId:
            status.ownId ?? resolved.channel.zaloPersonalOwnId ?? null,
        },
        record: existingRecord,
      }),
      sync: {
        exhausted: history.exhausted,
        failedGroupHistories: history.failedGroupHistories,
        groupMessages: history.groupMessages,
        groupsScanned: history.groupsScanned,
        pageCount: history.pageCount,
        synced,
        threads: threadIds.size,
        timedOut: history.timedOut,
        userMessages: history.userMessages,
      },
    };
  } finally {
    if (!existingRecord) {
      await Promise.resolve(runtime.adapter.disconnect?.()).catch(
        () => undefined
      );
    }
  }
}

export async function syncAiAgentZaloPersonalPhoneHistory({
  agentId,
  channelId,
  db,
  options,
  origin,
}: {
  agentId: string;
  channelId: string;
  db?: TypedSupabaseClient;
  options?: ZaloPersonalPhoneSyncOptions;
  origin?: string | null;
}): Promise<{
  status: AiAgentZaloPersonalStatus;
  sync: AiAgentZaloPersonalPhoneSyncResult;
}> {
  const resolved = await resolvePersonalChannel({
    agentId,
    channelId,
    db,
    origin,
  });
  assertEnabled(resolved.enabled);

  const existingRecord = resolved.record;
  let runtime: ListenerRecord;

  await pruneLegacyZaloWebMirrorThreads({
    agentId: resolved.agent.id,
    channelId: resolved.channel.id,
    db,
  }).catch(() => undefined);

  if (existingRecord) {
    runtime = existingRecord;
  } else {
    const { adapter, chat } = await createAiAgentPersonalZaloRuntime({
      agent: resolved.agent,
      channel: resolved.channel,
    });

    runtime = {
      adapter,
      agent: resolved.agent,
      channel: resolved.channel,
      chat,
    };
  }

  try {
    const phoneSync = await runtime.adapter.syncPersonalPhoneHistory(options);

    if (phoneSync.status !== 'failed' || phoneSync.messages.length > 0) {
      const threadIds = new Set<string>();
      let synced = 0;

      for (const message of phoneSync.messages) {
        const thread = await runtime.adapter.fetchThread(message.threadId);
        await persistAiAgentExternalSdkMessage({
          agent: runtime.agent,
          channel: runtime.channel,
          direction: message.author.isMe ? 'outbound' : 'inbound',
          message,
          platformUserId: null,
          thread,
        });
        threadIds.add(message.threadId);
        synced += 1;
      }

      const status = runtime.adapter.getPersonalStatus();
      await recordAiAgentZaloPersonalConnection({
        agentId: resolved.agent.id,
        channelId: resolved.channel.id,
        db,
        error: status.lastError,
        ownId: status.ownId,
      });

      return {
        status: buildStatus({
          ...resolved,
          channel: {
            ...resolved.channel,
            lastError: status.lastError,
            lastEventAt: status.lastEventAt,
            zaloPersonalOwnId:
              status.ownId ?? resolved.channel.zaloPersonalOwnId ?? null,
          },
          record: existingRecord,
        }),
        sync: {
          approvalRequested: phoneSync.approvalRequested,
          cleaned: phoneSync.cleaned,
          error: phoneSync.error,
          groupMessages: phoneSync.groupMessages,
          pullAttempts: phoneSync.pullAttempts,
          requestAccepted: phoneSync.requestAccepted,
          requestHttpError: phoneSync.requestHttpError,
          requestViaHttp: phoneSync.requestViaHttp,
          requestViaWebSocket: phoneSync.requestViaWebSocket,
          status: phoneSync.status,
          synced,
          threads: threadIds.size,
          userMessages: phoneSync.userMessages,
        },
      };
    }

    const secrets = await getChannelSecretValues({
      agentId: resolved.agent.id,
      channelId: resolved.channel.id,
      db,
    });
    const webSync = await syncZaloPersonalWebHistory({
      agentId: resolved.agent.id,
      channelDisplayName: resolved.channel.displayName,
      channelId: resolved.channel.id,
      cookieJson: secrets.personalCookieJson ?? '',
      imei: secrets.personalImei ?? '',
      ownId: resolved.channel.zaloPersonalOwnId,
      syncTimeoutMs: 100_000,
      userAgent: secrets.personalUserAgent ?? '',
    });

    if (webSync.messages.length > 0) {
      const threadById = new Map(
        webSync.threads.map((thread) => [thread.id, thread])
      );
      const threadIds = new Set<string>();
      let synced = 0;

      for (const message of webSync.messages) {
        const thread =
          threadById.get(message.threadId) ??
          (await runtime.adapter.fetchThread(message.threadId));

        await persistAiAgentExternalSdkMessage({
          agent: runtime.agent,
          channel: runtime.channel,
          direction: message.author.isMe ? 'outbound' : 'inbound',
          message,
          platformUserId: null,
          thread,
        });
        threadIds.add(message.threadId);
        synced += 1;
      }

      const status = runtime.adapter.getPersonalStatus();
      await recordAiAgentZaloPersonalConnection({
        agentId: resolved.agent.id,
        channelId: resolved.channel.id,
        db,
        error: webSync.error,
        ownId: status.ownId,
      });

      return {
        status: buildStatus({
          ...resolved,
          channel: {
            ...resolved.channel,
            lastError: webSync.error,
            lastEventAt: new Date().toISOString(),
            zaloPersonalOwnId:
              status.ownId ?? resolved.channel.zaloPersonalOwnId ?? null,
          },
          record: existingRecord,
        }),
        sync: {
          approvalRequested: webSync.approvalRequested,
          cleaned: webSync.missingRanges === 0,
          error: webSync.error,
          groupMessages: webSync.groupMessages,
          pullAttempts: 0,
          requestAccepted: webSync.requestAccepted,
          requestHttpError: null,
          requestViaHttp: false,
          requestViaWebSocket: webSync.approvalRequested,
          status: webSync.status,
          synced,
          threads: threadIds.size,
          userMessages: webSync.userMessages,
        },
      };
    }

    const threadIds = new Set<string>();
    let synced = 0;

    for (const message of phoneSync.messages) {
      const thread = await runtime.adapter.fetchThread(message.threadId);
      await persistAiAgentExternalSdkMessage({
        agent: runtime.agent,
        channel: runtime.channel,
        direction: message.author.isMe ? 'outbound' : 'inbound',
        message,
        platformUserId: null,
        thread,
      });
      threadIds.add(message.threadId);
      synced += 1;
    }

    const status = runtime.adapter.getPersonalStatus();
    await recordAiAgentZaloPersonalConnection({
      agentId: resolved.agent.id,
      channelId: resolved.channel.id,
      db,
      error: status.lastError,
      ownId: status.ownId,
    });

    return {
      status: buildStatus({
        ...resolved,
        channel: {
          ...resolved.channel,
          lastError: status.lastError,
          lastEventAt: status.lastEventAt,
          zaloPersonalOwnId:
            status.ownId ?? resolved.channel.zaloPersonalOwnId ?? null,
        },
        record: existingRecord,
      }),
      sync: {
        approvalRequested: phoneSync.approvalRequested,
        cleaned: phoneSync.cleaned,
        error: phoneSync.error,
        groupMessages: phoneSync.groupMessages,
        pullAttempts: phoneSync.pullAttempts,
        requestAccepted: phoneSync.requestAccepted,
        requestHttpError: phoneSync.requestHttpError,
        requestViaHttp: phoneSync.requestViaHttp,
        requestViaWebSocket: phoneSync.requestViaWebSocket,
        status: phoneSync.status,
        synced,
        threads: threadIds.size,
        userMessages: phoneSync.userMessages,
      },
    };
  } finally {
    if (!existingRecord) {
      await Promise.resolve(runtime.adapter.disconnect?.()).catch(
        () => undefined
      );
    }
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

async function pruneLegacyZaloWebMirrorThreads({
  agentId,
  channelId,
  db,
}: {
  agentId: string;
  channelId: string;
  db?: TypedSupabaseClient;
}) {
  if (!db || typeof (db as { schema?: unknown }).schema !== 'function') {
    return 0;
  }

  const privateDb = (
    db as unknown as {
      schema: (schema: 'private') => PrivateExternalThreadDb;
    }
  ).schema('private');
  const result = await privateDb
    .from('ai_agent_external_threads')
    .delete({ count: 'exact' })
    .eq('agent_id', agentId)
    .eq('channel_id', channelId)
    .like('external_thread_id', `zalo-personal:${channelId}:%:zalo-web:%`);

  if (result.error) {
    throw new Error(
      result.error.message || 'zalo_personal_legacy_web_thread_prune_failed'
    );
  }

  return result.count ?? 0;
}

function getListenerMap() {
  const scope = globalThis as GlobalWithZaloPersonalListeners;

  scope.__tuturuuuAiAgentZaloPersonalListeners ??= new Map<
    string,
    ListenerRecord
  >();

  return scope.__tuturuuuAiAgentZaloPersonalListeners;
}
