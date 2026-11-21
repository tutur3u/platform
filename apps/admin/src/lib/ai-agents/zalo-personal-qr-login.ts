import 'server-only';

import {
  loginZaloPersonalWithQr,
  type ZaloPersonalQrLoginEvent,
} from '@tuturuuu/ai/chat-sdk/zalo-personal';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  getAiAgentById,
  isAiAgentZaloPersonalEnabled,
  recordAiAgentZaloPersonalConnection,
  rotateAiAgentChannelSecret,
} from './registry';
import type { AiAgentChannelConfig, AiAgentDefinition } from './types';
import {
  abortQrSessionRecord,
  createQrSessionRecord,
  getQrSessionMap,
  isActiveQrSessionStatus,
  isTerminalQrFailureStatus,
  publicQrSession,
  type QrSessionRecord,
  scheduleQrSessionCleanup,
  touchQrSession,
  waitForQrSessionReady,
} from './zalo-personal-qr-session-store';

type ResolvePersonalChannelResult = {
  agent: AiAgentDefinition;
  channel: AiAgentChannelConfig;
  enabled: boolean;
};

const sessions = getQrSessionMap();

export async function startAiAgentZaloPersonalQrLogin({
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
  const resolved = await resolvePersonalChannel({
    agentId,
    channelId,
    db,
    origin,
  });

  if (!resolved.enabled) {
    throw new Error('zalo_personal_feature_disabled');
  }

  const key = sessionKey(agentId, channelId);
  const existing = sessions.get(key);
  if (existing && isActiveQrSessionStatus(existing.session.status)) {
    abortQrSessionRecord(existing);
  }

  const record = createQrSessionRecord(agentId, channelId);
  sessions.set(key, record);

  void runQrLoginSession({ db, key, record, resolved }).catch(() => undefined);

  await waitForQrSessionReady(record);

  return publicQrSession(record.session);
}

export async function getAiAgentZaloPersonalQrLoginStatus({
  agentId,
  channelId,
  sessionId,
}: {
  agentId: string;
  channelId: string;
  sessionId: string;
}) {
  const record = getSessionRecord(agentId, channelId, sessionId);

  return publicQrSession(record.session);
}

export async function abortAiAgentZaloPersonalQrLogin({
  agentId,
  channelId,
  sessionId,
}: {
  agentId: string;
  channelId: string;
  sessionId: string;
}) {
  const record = getSessionRecord(agentId, channelId, sessionId);
  abortQrSessionRecord(record);

  return publicQrSession(record.session);
}

async function runQrLoginSession({
  db,
  key,
  record,
  resolved,
}: {
  db?: TypedSupabaseClient;
  key: string;
  record: QrSessionRecord;
  resolved: ResolvePersonalChannelResult;
}) {
  try {
    const result = await loginZaloPersonalWithQr({ language: 'vi' }, (event) =>
      handleQrLoginEvent(record, event)
    );

    if (record.session.status === 'aborted') {
      stopQrApi(result.api);
      return;
    }

    touchQrSession(record, {
      error: null,
      ownId: result.ownId,
      qrImageDataUrl: null,
      status: 'authenticated',
    });

    await Promise.all([
      rotateAiAgentChannelSecret({
        agentId: resolved.agent.id,
        channelId: resolved.channel.id,
        db,
        secretName: 'personalCookieJson',
        value: result.credentials.cookieJson,
      }),
      rotateAiAgentChannelSecret({
        agentId: resolved.agent.id,
        channelId: resolved.channel.id,
        db,
        secretName: 'personalImei',
        value: result.credentials.imei,
      }),
      rotateAiAgentChannelSecret({
        agentId: resolved.agent.id,
        channelId: resolved.channel.id,
        db,
        secretName: 'personalUserAgent',
        value: result.credentials.userAgent,
      }),
    ]);
    await recordAiAgentZaloPersonalConnection({
      agentId: resolved.agent.id,
      channelId: resolved.channel.id,
      db,
      ownId: result.ownId,
    });

    stopQrApi(result.api);
    touchQrSession(record, {
      error: null,
      ownId: result.ownId,
      qrImageDataUrl: null,
      status: 'persisted',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!isTerminalQrFailureStatus(record.session.status)) {
      touchQrSession(record, {
        error: message,
        qrImageDataUrl: null,
        status: 'failed',
      });
    }

    if (record.session.status !== 'aborted') {
      await recordAiAgentZaloPersonalConnection({
        agentId: resolved.agent.id,
        channelId: resolved.channel.id,
        db,
        error: message,
      }).catch(() => undefined);
    }
  } finally {
    scheduleQrSessionCleanup(key, record, sessions);
  }
}

function handleQrLoginEvent(
  record: QrSessionRecord,
  event: ZaloPersonalQrLoginEvent
) {
  if (record.session.status === 'aborted') {
    if ('actions' in event) {
      event.actions.abort();
    }
    return;
  }

  if ('actions' in event) {
    record.abort = event.actions.abort;
  }

  switch (event.type) {
    case 'qr_generated':
      touchQrSession(record, {
        error: null,
        expiresAt: event.expiresAt,
        qrImageDataUrl: event.qrImageDataUrl,
        status: 'qr_generated',
      });
      break;
    case 'qr_scanned':
      touchQrSession(record, {
        error: null,
        scannedProfile: event.scannedProfile,
        status: 'scanned',
      });
      break;
    case 'qr_expired':
      touchQrSession(record, {
        error: 'zalo_personal_qr_expired',
        qrImageDataUrl: null,
        status: 'expired',
      });
      break;
    case 'qr_declined':
      touchQrSession(record, {
        error: 'zalo_personal_qr_declined',
        qrImageDataUrl: null,
        status: 'declined',
      });
      break;
    case 'credentials_ready':
      touchQrSession(record, {
        error: null,
        qrImageDataUrl: null,
        status: 'credentials_ready',
      });
      break;
    case 'authenticated':
      touchQrSession(record, {
        error: null,
        ownId: event.ownId,
        qrImageDataUrl: null,
        status: 'authenticated',
      });
      break;
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
  const agent = await getAiAgentById({ agentId, db, origin });
  const channel = agent?.channels.find(
    (candidate) => candidate.id === channelId
  );

  if (!agent || !channel) {
    throw new Error('agent_channel_not_found');
  }

  if (channel.adapter !== 'zalo' || channel.zaloAccountMode !== 'personal') {
    throw new Error('ai_agent_zalo_personal_channel_required');
  }

  const enabled = await isAiAgentZaloPersonalEnabled(db, channel.workspaceId);

  return {
    agent,
    channel,
    enabled,
  };
}

function getSessionRecord(
  agentId: string,
  channelId: string,
  sessionId: string
) {
  const record = sessions.get(sessionKey(agentId, channelId));

  if (!record || record.session.sessionId !== sessionId) {
    throw new Error('zalo_personal_qr_session_not_found');
  }

  return record;
}

function sessionKey(agentId: string, channelId: string) {
  return `${agentId}:${channelId}`;
}

function stopQrApi(
  api: Awaited<ReturnType<typeof loginZaloPersonalWithQr>>['api']
) {
  try {
    api.listener.stop();
  } catch {
    // Pairing only needs credentials; listener lifecycle is managed elsewhere.
  }
}
